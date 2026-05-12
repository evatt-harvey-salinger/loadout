/**
 * Unified scope resolution for all commands.
 *
 * Scope flags:
 *   -l / --local   → project scope only (error if not in a project)
 *   -g / --global  → global scope only
 *   -a / --all     → both scopes
 *   (none)         → both scopes (show everything by default)
 *
 * For commands that target a specific loadout by name, collision detection
 * requires explicit scope when the same name exists in both scopes.
 */

import { getContext, findNearestLoadoutRoot, getGlobalRoot, getBundledRoot } from "./discovery.js";
import { isProjectScope } from "../lib/artifact-paths.js";
import { listLoadouts } from "./config.js";
import type { Scope, CommandContext } from "./types.js";

export interface ScopeFlags {
  local?: boolean;
  global?: boolean;
  all?: boolean;
}

export interface ScopeResolution {
  scopes: Scope[];
  contexts: CommandContext[];
}

/**
 * Check if we're currently in a loadout project.
 * Returns true only if there's a project-level .loadouts/ directory
 * (not just global or bundled).
 */
export async function inProject(cwd: string = process.cwd()): Promise<boolean> {
  const root = await findNearestLoadoutRoot(cwd);
  // Only count as "in project" if we found a project-level root
  // (global and bundled roots don't count)
  return root !== null && isProjectScope(root.level);
}

/**
 * Check if a global loadout root exists.
 */
export function hasGlobal(): boolean {
  return getGlobalRoot() !== null;
}

/**
 * Resolve scope flags to a list of scopes.
 * Default (no flags) = all available scopes.
 */
export async function resolveScopes(
  flags: ScopeFlags,
  cwd: string = process.cwd()
): Promise<Scope[]> {
  const hasProject = await inProject(cwd);
  const hasGlobalRoot = hasGlobal();

  // Explicit --local
  if (flags.local) {
    if (!hasProject) {
      throw new Error("Not in a loadout project. Run 'loadouts init' first.");
    }
    return ["project"];
  }

  // Explicit --global
  if (flags.global) {
    if (!hasGlobalRoot) {
      throw new Error("No global loadout found at ~/.config/loadouts");
    }
    return ["global"];
  }

  // Explicit --all, or default (no flags) = everything available
  const scopes: Scope[] = [];
  if (hasProject) scopes.push("project");
  if (hasGlobalRoot) scopes.push("global");

  if (scopes.length === 0) {
    throw new Error(
      "No loadout found. Run 'loadouts init' or 'loadouts init --global'."
    );
  }

  return scopes;
}

/**
 * Resolve scope flags to CommandContexts.
 */
export async function resolveContexts(
  flags: ScopeFlags,
  cwd: string = process.cwd()
): Promise<ScopeResolution> {
  const scopes = await resolveScopes(flags, cwd);
  const contexts: CommandContext[] = [];

  for (const scope of scopes) {
    contexts.push(await getContext(scope, cwd));
  }

  return { scopes, contexts };
}

/**
 * Check if a loadout name exists in a given scope.
 */
export function loadoutExistsInScope(name: string, scope: Scope): boolean {
  if (scope === "global") {
    const globalRoot = getGlobalRoot();
    if (!globalRoot) return false;
    return listLoadouts(globalRoot.path).includes(name);
  } else {
    // For project scope, we need to check synchronously
    // This is a simplified check - full resolution happens in commands
    return true; // Let the command handle the actual check
  }
}

/**
 * Detect if a loadout name exists in multiple scopes (collision).
 * Returns the scopes where it exists.
 */
export async function detectCollision(
  name: string,
  cwd: string = process.cwd()
): Promise<Scope[]> {
  const found: Scope[] = [];
  const hasProjectRoot = await inProject(cwd);

  // Check project scope
  if (hasProjectRoot) {
    const projectRoot = await findNearestLoadoutRoot(cwd);
    if (projectRoot) {
      const projectLoadouts = listLoadouts(projectRoot.path);
      if (projectLoadouts.includes(name)) {
        found.push("project");
      }
    }
  }

  // Check global scope
  const globalRoot = getGlobalRoot();
  if (globalRoot) {
    const globalLoadouts = listLoadouts(globalRoot.path);
    if (globalLoadouts.includes(name)) {
      found.push("global");
    }
  }

  return found;
}

/**
 * Require explicit scope when a loadout name exists in both scopes.
 * Throws if ambiguous; returns the single scope to use if unambiguous.
 */
export async function requireScopeForName(
  name: string,
  flags: ScopeFlags,
  cwd: string = process.cwd()
): Promise<Scope> {
  // If explicit scope given, use it
  if (flags.local) return "project";
  if (flags.global) return "global";

  // Check for collision
  const collision = await detectCollision(name, cwd);

  if (collision.length > 1) {
    throw new Error(
      `Loadout '${name}' exists in both project and global scope. ` +
        `Use -l/--local or -g/--global to specify which one.`
    );
  }

  if (collision.length === 0) {
    const bundledRoot = getBundledRoot();
    if (bundledRoot) {
      const bundledLoadouts = listLoadouts(bundledRoot.path);
      if (bundledLoadouts.includes(name)) {
        const hasProjectRoot = await inProject(cwd);
        const hasGlobalRoot = hasGlobal();

        if (hasProjectRoot && hasGlobalRoot) {
          throw new Error(
            `Loadout '${name}' is bundled. Use -l/--local or -g/--global to choose a target scope.`
          );
        }
        if (hasProjectRoot) return "project";
        if (hasGlobalRoot) return "global";

        throw new Error(
          `Loadout '${name}' is bundled and requires a target scope. Run 'loadouts init' or 'loadouts init --global' first.`
        );
      }
    }

    throw new Error(`Loadout '${name}' not found in any scope.`);
  }

  return collision[0];
}

/**
 * For commands that operate on multiple loadouts (activate, deactivate),
 * validate that all names resolve unambiguously given the scope flags.
 *
 * Returns a map of name -> scope for each loadout.
 */
export async function resolveLoadoutScopes(
  names: string[],
  flags: ScopeFlags,
  cwd: string = process.cwd()
): Promise<Map<string, Scope>> {
  const result = new Map<string, Scope>();

  for (const name of names) {
    const scope = await requireScopeForName(name, flags, cwd);
    result.set(name, scope);
  }

  return result;
}

/**
 * Standard scope flag definitions for Commander.
 */
export const SCOPE_FLAGS = {
  local: ["-l, --local", "Project scope only"] as const,
  global: ["-g, --global", "Global scope only"] as const,
  all: ["-a, --all", "All scopes"] as const,
};
