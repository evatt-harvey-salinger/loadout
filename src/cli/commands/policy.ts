/**
 * Policy functions for computing target active sets.
 *
 * Pure functions that determine what the active loadout set should become.
 * Separated from mechanism (apply-core.ts) for testability and clarity.
 */

export interface PolicyResult {
  targets: string[];
  /** If set, the command should exit early with this warning. */
  earlyExit?: string;
}

/**
 * Compute target set for activation: add names to current set, deduping.
 */
export function computeActivateSet(
  current: string[],
  toAdd: string[]
): PolicyResult {
  if (toAdd.length === 0) {
    return { targets: [], earlyExit: "Activate requires at least one loadout name" };
  }

  const targets = [...current];
  for (const name of toAdd) {
    if (!targets.includes(name)) {
      targets.push(name);
    }
  }
  return { targets };
}

/**
 * Compute target set for deactivation: remove names from current set.
 */
export function computeDeactivateSet(
  current: string[],
  toRemove: string[]
): PolicyResult {
  if (toRemove.length === 0) {
    return { targets: [], earlyExit: "Deactivate requires at least one loadout name" };
  }

  const targets = current.filter((n) => !toRemove.includes(n));

  if (targets.length === current.length) {
    return { targets: [], earlyExit: `None of [${toRemove.join(", ")}] were active` };
  }

  return { targets };
}

/**
 * Compute target set for sync: re-render current active set.
 */
export function computeSyncSet(current: string[]): PolicyResult {
  if (current.length === 0) {
    return { targets: [], earlyExit: "No active loadouts to sync" };
  }
  return { targets: current };
}

/**
 * Compute target set for clear: empty set (remove all).
 */
export function computeClearSet(): PolicyResult {
  return { targets: [] };
}
