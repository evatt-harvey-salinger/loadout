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
import { discoverLoadoutRoots, getGlobalRoot, collectRootsWithSources } from "./discovery.js";
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
 * Resolve a loadout by name.
 */
export function resolveLoadout(
  name: string,
  roots: LoadoutRoot[],
  rootConfig?: RootConfig
): ResolvedLoadout {
  // Load any YAML-defined kinds from the discovered roots before resolving
  // items, so inferKind() can match custom kinds. Idempotent.
  loadYamlKindsFromRoots(roots);

  const found = findLoadoutDefinition(name, roots);
  if (!found) {
    throw new Error(`Loadout not found: ${name}`);
  }

  const { definition, rootPath } = found;
  const effectiveTools = definition.tools || rootConfig?.tools || [...BUILTIN_TOOL_NAMES];

  const items: ResolvedItem[] = [];
  for (const include of definition.include || []) {
    items.push(resolveInclude(include, rootPath, effectiveTools));
  }

  return {
    name,
    description: definition.description,
    tools: effectiveTools,
    items,
    rootPath,
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
  sourceWarnings: string[];
}

/**
 * Discover roots, parse root config, resolve the loadout, and attach the
 * instruction item if present. Throws on any failure — callers decide whether
 * to exit. This consolidates the pattern previously duplicated across apply,
 * diff, info, init, and global commands.
 *
 * Root collection order:
 *   1. Primary .loadout/ (from ctx.configPath)
 *   2. Sources declared in loadout.yaml (transitively)
 *   3. Global ~/.config/loadout/ (lowest priority)
 */
export async function loadResolvedLoadout(
  ctx: CommandContext,
  name?: string
): Promise<LoadResult> {
  let roots: LoadoutRoot[];
  let sourceWarnings: string[] = [];

  if (ctx.scope === "global") {
    const globalRoot = getGlobalRoot();
    if (!globalRoot) {
      throw new Error("No global loadout found at ~/.config/loadout");
    }
    // Global scope: just the global root, plus any sources it declares
    const collected = collectRootsWithSources(globalRoot, false);
    roots = collected.roots;
    sourceWarnings = collected.warnings;
  } else {
    // Project scope: start with the nearest .loadout/, collect sources
    const discovered = await discoverLoadoutRoots(ctx.projectRoot);
    if (discovered.length === 0) {
      throw new Error("No .loadout/ directory found. Run 'loadout init' first.");
    }
    const primaryRoot = discovered[0];
    const collected = collectRootsWithSources(primaryRoot, true);
    roots = collected.roots;
    sourceWarnings = collected.warnings;
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

  return { loadout, rootConfig, loadoutName, roots, sourceWarnings };
}
