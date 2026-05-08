/**
 * Shared loadout column rendering for unified tables.
 * 
 * Used by `list`, `info`, and `status` commands to consistently render
 * the loadout column with scope indicators and optional default markers.
 */

import chalk from "chalk";
import {
  type ScopeIndicator,
  formatScopeIndicatorPadded,
  maxScopeWidth,
} from "./scope-indicators.js";

/**
 * Base interface for items that have a loadout name and scope.
 */
export interface LoadoutColumnItem {
  loadoutName: string;
  scope: ScopeIndicator;
}

/**
 * Extended interface for items that also have a default marker (used by list).
 */
export interface LoadoutColumnItemWithDefault extends LoadoutColumnItem {
  isDefault: boolean;
}

/**
 * Calculate column widths for the loadout column.
 */
export function calculateLoadoutColumnWidths<T extends LoadoutColumnItem>(
  items: T[],
  options: { hasDefaultMarker?: boolean } = {}
): {
  nameWidth: number;
  scopeWidth: number;
  totalWidth: number;
} {
  const nameWidth = Math.max(
    "loadout".length - 2, // Account for "▸ " prefix in data rows
    ...items.map((i) => i.loadoutName.length)
  );
  const scopeWidth = maxScopeWidth(items);
  
  // Total: "▸ " (2) + name (padded) + ["* " (2) if hasDefaultMarker] + scope (padded)
  const defaultMarkerWidth = options.hasDefaultMarker ? 2 : 0;
  const totalWidth = 2 + nameWidth + defaultMarkerWidth + scopeWidth;

  return { nameWidth, scopeWidth, totalWidth };
}

/**
 * Render the loadout column header.
 */
export function renderLoadoutHeader(totalWidth: number): string {
  return chalk.dim("loadout".padEnd(totalWidth));
}

/**
 * Render the loadout column separator.
 */
export function renderLoadoutSeparator(totalWidth: number): string {
  return "─".repeat(totalWidth);
}

/**
 * Extended interface for items that track active state.
 */
export interface LoadoutColumnItemWithActive extends LoadoutColumnItem {
  isActive: boolean;
}

/**
 * Render a loadout cell for info/status style (no default marker).
 * 
 * @param item - The loadout item (or null for continuation rows)
 * @param nameWidth - Width for the name portion
 * @param scopeWidth - Width for the scope indicator
 * @param totalWidth - Total column width (for empty rows)
 */
export function renderLoadoutCell(
  item: (LoadoutColumnItem & { isActive?: boolean }) | null,
  nameWidth: number,
  scopeWidth: number,
  totalWidth: number
): string {
  if (!item) {
    return " ".repeat(totalWidth);
  }
  
  const activeMarker = item.isActive !== false ? chalk.green("▸") : " ";
  const nameStr = item.loadoutName.padEnd(nameWidth);
  const scopeStr = formatScopeIndicatorPadded(item.scope, scopeWidth);
  return activeMarker + " " + nameStr + scopeStr;
}

/**
 * Render a loadout cell for list style (with default marker).
 * 
 * @param item - The loadout item
 * @param isActive - Whether this loadout is active
 * @param nameWidth - Width for the name portion
 * @param scopeWidth - Width for the scope indicator
 * @param totalWidth - Total column width
 */
export function renderLoadoutCellWithDefault(
  item: LoadoutColumnItemWithDefault,
  isActive: boolean,
  nameWidth: number,
  scopeWidth: number,
  totalWidth: number
): string {
  const activeMarker = isActive ? chalk.green("▸") : " ";
  const defaultMarker = item.isDefault ? chalk.cyan("*") : " ";
  const nameStr = item.loadoutName.padEnd(nameWidth);
  const scopeStr = formatScopeIndicatorPadded(item.scope, scopeWidth);
  
  return `${activeMarker} ${nameStr}${defaultMarker} ${scopeStr}`.padEnd(totalWidth);
}
