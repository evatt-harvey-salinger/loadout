/**
 * Resolve loadout graphs and included items
 */

import * as path from "node:path";
import {
  findLoadoutDefinition,
  parseRootConfig,
} from "./config.js";
import { registry } from "./registry.js";
import { loadYamlKindsFromRoots } from "./kindLoader.js";
import { fileExists, isDirectory } from "../lib/fs.js";
import { discoverLoadoutRoots, getGlobalRoot } from "./discovery.js";
import type {
  LoadoutRoot,
  LoadoutDefinition,
  LoadoutInclude,
  ResolvedItem,
  ResolvedLoadout,
  Tool,
  RootConfig,
  CommandContext,
} from "./types.js";
import { BUILTIN_TOOL_NAMES } from "../builtins/index.js";

/**
 * Resolve a loadout by name, processing the extends chain.
 */
export function resolveLoadout(
  name: string,
  roots: LoadoutRoot[],
  rootConfig?: RootConfig
): ResolvedLoadout {
  // Load any YAML-defined kinds from the discovered roots before resolving
  // items, so inferKind() can match custom kinds. Idempotent.
  loadYamlKindsFromRoots(roots);
  const extendsChain: string[] = [];
  const seen = new Set<string>();
  const allIncludes: Array<{
    include: LoadoutInclude;
    rootPath: string;
    loadoutTools: Tool[];
  }> = [];

  let currentName: string | undefined = name;
  let finalDescription: string | undefined;
  let finalTools: Tool[] | undefined;
  let finalRootPath: string | undefined;

  // Walk the extends chain
  while (currentName) {
    if (seen.has(currentName)) {
      throw new Error(
        `Circular extends detected: ${[...extendsChain, currentName].join(" -> ")}`
      );
    }
    seen.add(currentName);

    const found = findLoadoutDefinition(currentName, roots);
    if (!found) {
      throw new Error(`Loadout not found: ${currentName}`);
    }

    const { definition, rootPath } = found;
    extendsChain.push(currentName);

    // First loadout in chain determines description and tools
    if (!finalDescription && definition.description) {
      finalDescription = definition.description;
    }
    if (!finalTools && definition.tools) {
      finalTools = definition.tools;
    }
    if (!finalRootPath) {
      finalRootPath = rootPath;
    }

    // Collect includes (will be processed in reverse order)
    const loadoutTools = definition.tools || finalTools || [...BUILTIN_TOOL_NAMES];
    for (const include of definition.include || []) {
      allIncludes.push({ include, rootPath, loadoutTools });
    }

    currentName = definition.extends;
  }

  // Process includes in reverse order (base first, overrides last)
  // But for v1, we just flatten them—nearest wins on conflicts
  const items: ResolvedItem[] = [];
  const seenPaths = new Set<string>();

  // Reverse so base loadout items come first, then overrides
  for (const { include, rootPath, loadoutTools } of allIncludes.reverse()) {
    const resolved = resolveInclude(include, rootPath, loadoutTools);

    // Skip if we've already seen this relative path (nearest wins)
    if (seenPaths.has(resolved.relativePath)) {
      continue;
    }
    seenPaths.add(resolved.relativePath);
    items.push(resolved);
  }

  // Determine effective tools
  const effectiveTools =
    finalTools || rootConfig?.tools || [...BUILTIN_TOOL_NAMES];

  return {
    name,
    description: finalDescription,
    tools: effectiveTools,
    items,
    extendsChain,
    rootPath: finalRootPath!,
  };
}

/**
 * Resolve a single include entry to a ResolvedItem.
 */
function resolveInclude(
  include: LoadoutInclude,
  rootPath: string,
  defaultTools: Tool[]
): ResolvedItem {
  const relativePath = typeof include === "string" ? include : include.path;
  const tools =
    typeof include === "object" && include.tools
      ? include.tools
      : defaultTools;

  const sourcePath = path.join(rootPath, relativePath);

  // Validate the source exists
  if (!fileExists(sourcePath) && !isDirectory(sourcePath)) {
    throw new Error(`Include not found: ${relativePath} (in ${rootPath})`);
  }

  const kind = registry.inferKind(relativePath);
  if (!kind) {
    throw new Error(`Cannot infer artifact kind for path: ${relativePath}`);
  }

  return {
    kind,
    sourcePath,
    relativePath,
    tools,
  };
}

/**
 * Check if instructions (AGENTS.md) exist in the loadout root.
 */
export function hasInstructions(loadoutRoot: string): boolean {
  return fileExists(path.join(loadoutRoot, "AGENTS.md"));
}

/**
 * Get the instruction item if it exists.
 */
export function getInstructionItem(
  loadoutRoot: string,
  tools: Tool[]
): ResolvedItem | null {
  const sourcePath = path.join(loadoutRoot, "AGENTS.md");

  if (!fileExists(sourcePath)) {
    return null;
  }

  return {
    kind: "instruction",
    sourcePath,
    relativePath: "AGENTS.md",
    tools,
  };
}

/**
 * Result of loading and fully resolving a loadout for a command context.
 */
export interface LoadResult {
  loadout: ResolvedLoadout;
  rootConfig: RootConfig;
  loadoutName: string;
  roots: LoadoutRoot[];
}

/**
 * Discover roots, parse root config, resolve the loadout, and attach the
 * instruction item if present. Throws on any failure — callers decide whether
 * to exit. This consolidates the pattern previously duplicated across apply,
 * diff, info, init, and global commands.
 */
export async function loadResolvedLoadout(
  ctx: CommandContext,
  name?: string
): Promise<LoadResult> {
  // Roots: project scope walks up from cwd; global scope uses only the global root.
  let roots: LoadoutRoot[];
  if (ctx.scope === "global") {
    const globalRoot = getGlobalRoot();
    if (!globalRoot) {
      throw new Error("No global loadout found at ~/.config/loadout");
    }
    roots = [globalRoot];
  } else {
    roots = await discoverLoadoutRoots(ctx.projectRoot);
    if (roots.length === 0) {
      throw new Error("No .loadout/ directory found. Run 'loadout init' first.");
    }
  }

  const rootConfig = parseRootConfig(ctx.configPath);
  const loadoutName = name || rootConfig.default || "base";
  const loadout = resolveLoadout(loadoutName, roots, rootConfig);

  // Auto-inject AGENTS.md only when not already in the loadout's include list.
  const alreadyHasInstruction = loadout.items.some(
    (i) => i.relativePath === "AGENTS.md"
  );
  if (!alreadyHasInstruction) {
    const instructionItem = getInstructionItem(ctx.configPath, loadout.tools);
    if (instructionItem) loadout.items.push(instructionItem);
  }

  return { loadout, rootConfig, loadoutName, roots };
}
