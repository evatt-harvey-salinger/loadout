/**
 * Discovery: Find .loadout/ directories from cwd up to git root
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { LoadoutRoot, Scope, CommandContext } from "./types.js";
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
    const projectRoot = await getProjectRoot(cwd);
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
