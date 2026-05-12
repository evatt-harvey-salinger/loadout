/**
 * Unified scope indicators for CLI output.
 * 
 * Used by `list`, `info`, and other commands to consistently display
 * the scope/source of loadouts and artifacts.
 * 
 * Symbols:
 *   • (dim)    — global scope
 *   ◦ (cyan)   — local/project scope
 *   ◆ (blue)   — bundled (built-in)
 *   →name (yellow) — external source
 */

import chalk from "chalk";
import type { LoadoutRoot, Scope } from "../core/types.js";

/**
 * Scope indicator for a loadout or artifact.
 */
export type ScopeIndicator =
  | { type: "global" }
  | { type: "local" }
  | { type: "bundled" }
  | { type: "source"; name: string };

/**
 * Get the raw (uncolored) text for a scope indicator.
 */
export function scopeIndicatorText(scope: ScopeIndicator): string {
  switch (scope.type) {
    case "global":
      return "•";
    case "local":
      return "◦";
    case "bundled":
      return "◆";
    case "source":
      return `→${scope.name}`;
  }
}

/**
 * Format a scope indicator with appropriate color.
 */
export function formatScopeIndicator(scope: ScopeIndicator): string {
  switch (scope.type) {
    case "global":
      return chalk.dim("•");
    case "local":
      return chalk.cyan("◦");
    case "bundled":
      return chalk.blue("◆");
    case "source":
      return chalk.yellow(`→${scope.name}`);
  }
}

/**
 * Format a scope indicator padded to a specific width.
 * Padding is applied BEFORE coloring to avoid ANSI code length issues.
 */
export function formatScopeIndicatorPadded(scope: ScopeIndicator, width: number): string {
  const text = scopeIndicatorText(scope);
  const padded = text.padEnd(width);
  
  // Apply color only to the actual indicator, not the padding
  const padding = padded.slice(text.length);
  return formatScopeIndicator(scope) + padding;
}

/**
 * Calculate the display width needed for a scope indicator.
 */
export function scopeIndicatorWidth(scope: ScopeIndicator): number {
  return scopeIndicatorText(scope).length;
}

/**
 * Calculate the maximum width needed for scope indicators in a list.
 */
export function maxScopeWidth<T extends { scope: ScopeIndicator }>(items: T[]): number {
  let maxWidth = 1; // minimum for • or ◦
  for (const item of items) {
    maxWidth = Math.max(maxWidth, scopeIndicatorWidth(item.scope));
  }
  return maxWidth;
}

/**
 * Convert a LoadoutRoot to a ScopeIndicator.
 */
export function rootToScope(root: LoadoutRoot): ScopeIndicator {
  if (root.level === "source" && root.sourceRef) {
    const shortName = root.sourceRef.split("/").pop() || root.sourceRef;
    return { type: "source", name: shortName };
  }
  if (root.level === "bundled") {
    return { type: "bundled" };
  }
  if (root.level === "global") {
    return { type: "global" };
  }
  return { type: "local" };
}

/**
 * Determine scope indicator by matching a path against collected roots.
 * Falls back to context scope if no matching root is found.
 */
export function getScopeFromRoots(
  targetPath: string,
  roots: LoadoutRoot[],
  fallbackScope: Scope
): ScopeIndicator {
  const matchingRoot = roots.find((r) => r.path === targetPath);
  if (matchingRoot) {
    return rootToScope(matchingRoot);
  }
  return fallbackScope === "global" ? { type: "global" } : { type: "local" };
}

/**
 * Render the scope legend footer.
 * Only includes indicators that are actually present in the items.
 */
export function renderScopeLegend<T extends { scope: ScopeIndicator }>(items: T[]): void {
  const hasGlobal = items.some((i) => i.scope.type === "global");
  const hasLocal = items.some((i) => i.scope.type === "local");
  const hasBundled = items.some((i) => i.scope.type === "bundled");
  const hasSource = items.some((i) => i.scope.type === "source");

  const parts: string[] = [];
  if (hasGlobal) parts.push(chalk.dim("• global"));
  if (hasLocal) parts.push(chalk.cyan("◦") + chalk.dim(" local"));
  if (hasBundled) parts.push(chalk.blue("◆") + chalk.dim(" bundled"));
  if (hasSource) parts.push(chalk.yellow("→") + chalk.dim("name source"));

  if (parts.length > 0) {
    console.log(`  ${parts.join("  ")}`);
  }
}
