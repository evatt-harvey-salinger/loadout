/**
 * Discovery: Find .loadout/ directories and resolve source references
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "yaml";
import { LoadoutRoot, Scope, CommandContext, SourceRef } from "./types.js";
import { findGitRoot } from "../lib/git.js";

const LOADOUT_DIR = ".loadout";
const STATE_FILE = ".state.json";

export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".config", "loadout");
}

const GLOBAL_CONFIG_PATH = getGlobalConfigPath();

/**
 * Discover all .loadout/ directories from cwd up to git root.
 * Returns them ordered from nearest (depth 0) to furthest.
 */
export async function discoverLoadoutRoots(
  cwd: string = process.cwd()
): Promise<LoadoutRoot[]> {
  const roots: LoadoutRoot[] = [];
  const gitRoot = await findGitRoot(cwd);
  const stopAt = gitRoot || path.parse(cwd).root;

  let current = path.resolve(cwd);
  let depth = 0;

  // Walk up from cwd to git root (or filesystem root)
  while (true) {
    const loadoutPath = path.join(current, LOADOUT_DIR);

    if (fs.existsSync(loadoutPath) && fs.statSync(loadoutPath).isDirectory()) {
      roots.push({
        path: loadoutPath,
        level: "project",
        depth,
      });
    }

    // Stop if we've reached the boundary
    if (current === stopAt || current === path.parse(current).root) {
      break;
    }

    current = path.dirname(current);
    depth++;
  }

  // Check for global config
  if (
    fs.existsSync(GLOBAL_CONFIG_PATH) &&
    fs.statSync(GLOBAL_CONFIG_PATH).isDirectory()
  ) {
    roots.push({
      path: GLOBAL_CONFIG_PATH,
      level: "global",
      depth: Infinity,
    });
  }

  return roots;
}

/**
 * Find the nearest .loadout/ directory.
 */
export async function findNearestLoadoutRoot(
  cwd: string = process.cwd()
): Promise<LoadoutRoot | null> {
  const roots = await discoverLoadoutRoots(cwd);
  return roots.length > 0 ? roots[0] : null;
}

/**
 * Get the project root (git root or cwd if no git).
 */
export async function getProjectRoot(
  cwd: string = process.cwd()
): Promise<string> {
  const gitRoot = await findGitRoot(cwd);
  return gitRoot || cwd;
}

/**
 * Get the command context for a given scope.
 */
export async function getContext(
  scope: Scope,
  cwd: string = process.cwd()
): Promise<CommandContext> {
  if (scope === "global") {
    const configPath = getGlobalConfigPath();
    return {
      scope: "global",
      configPath,
      statePath: path.join(configPath, STATE_FILE),
      projectRoot: os.homedir(),
    };
  } else {
    const nearestRoot = await findNearestLoadoutRoot(cwd);
    if (!nearestRoot) {
      throw new Error("No .loadout/ directory found. Run 'loadout init' first.");
    }
    // projectRoot is the directory containing .loadout/, not git root
    // This allows subprojects in monorepos to have their own loadout
    const projectRoot = path.dirname(nearestRoot.path);
    return {
      scope: "project",
      configPath: nearestRoot.path,
      statePath: path.join(nearestRoot.path, STATE_FILE),
      projectRoot,
    };
  }
}

/**
 * Get global config path if it exists.
 */
export function getGlobalRoot(): LoadoutRoot | null {
  if (
    fs.existsSync(GLOBAL_CONFIG_PATH) &&
    fs.statSync(GLOBAL_CONFIG_PATH).isDirectory()
  ) {
    return {
      path: GLOBAL_CONFIG_PATH,
      level: "global",
      depth: Infinity,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a source path relative to a .loadout/ directory.
 * Handles ~, relative paths, and looks for .loadout/ within the target.
 */
export function resolveSourcePath(sourceRef: string, fromLoadoutDir: string): string | null {
  // Expand ~ to home directory
  let resolved = sourceRef.startsWith("~")
    ? path.join(os.homedir(), sourceRef.slice(1))
    : sourceRef;

  // Resolve relative to the directory containing .loadout/
  if (!path.isAbsolute(resolved)) {
    const fromDir = path.dirname(fromLoadoutDir);
    resolved = path.resolve(fromDir, resolved);
  }

  // If the path points directly to a .loadout/ directory, use it
  if (path.basename(resolved) === ".loadout" && fs.existsSync(resolved)) {
    return resolved;
  }

  // Otherwise, look for .loadout/ within the resolved path
  const loadoutPath = path.join(resolved, ".loadout");
  if (fs.existsSync(loadoutPath) && fs.statSync(loadoutPath).isDirectory()) {
    return loadoutPath;
  }

  return null;
}

/**
 * Parse sources from a loadout.yaml file.
 * Returns empty array if file doesn't exist or has no sources.
 */
function parseSourcesFromConfig(loadoutDir: string): SourceRef[] {
  const configPath = path.join(loadoutDir, "loadout.yaml");
  if (!fs.existsSync(configPath)) return [];

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = yaml.parse(content);
    return config?.sources ?? [];
  } catch {
    return [];
  }
}

/**
 * Collect all roots starting from a primary root, following sources transitively.
 * Missing sources generate warnings but don't fail resolution.
 *
 * @param primaryRoot - The starting .loadout/ directory
 * @param includeGlobal - Whether to append the global root
 * @returns Ordered list of roots (primary first, then sources in declaration order, global last)
 */
export function collectRootsWithSources(
  primaryRoot: LoadoutRoot,
  includeGlobal: boolean = true
): { roots: LoadoutRoot[]; warnings: string[] } {
  const roots: LoadoutRoot[] = [primaryRoot];
  const seen = new Set<string>([primaryRoot.path]);
  const warnings: string[] = [];

  // BFS through sources to maintain declaration order and handle transitives
  const queue: Array<{ loadoutDir: string; depth: number }> = [
    { loadoutDir: primaryRoot.path, depth: 0 },
  ];

  while (queue.length > 0) {
    const { loadoutDir, depth } = queue.shift()!;
    const sources = parseSourcesFromConfig(loadoutDir);

    for (const sourcePath of sources) {
      const resolved = resolveSourcePath(sourcePath, loadoutDir);

      if (!resolved) {
        warnings.push(`Source not found: ${sourcePath} (from ${path.basename(path.dirname(loadoutDir))})`);
        continue;
      }

      // Cycle detection
      if (seen.has(resolved)) {
        continue; // Skip silently - not an error, just already included
      }
      seen.add(resolved);

      const sourceRoot: LoadoutRoot = {
        path: resolved,
        level: "source",
        depth: depth + 1,
        sourceRef: sourcePath,
      };
      roots.push(sourceRoot);

      // Queue for transitive source resolution
      queue.push({ loadoutDir: resolved, depth: depth + 1 });
    }
  }

  // Append global root last (lowest priority)
  if (includeGlobal) {
    const globalRoot = getGlobalRoot();
    if (globalRoot && !seen.has(globalRoot.path)) {
      roots.push(globalRoot);
    }
  }

  return { roots, warnings };
}
