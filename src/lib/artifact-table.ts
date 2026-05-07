/**
 * Shared artifact table rendering utilities for info and status commands.
 */

import chalk from "chalk";
import type { Tool } from "../core/types.js";

// Sort order for artifact kinds in display
// Prioritizes context-heavy kinds first, then alphabetical for the rest
export const KIND_SORT_ORDER: Record<string, number> = {
  instruction: 0,
  rule: 1,
  skill: 2,
  prompt: 3,  // slash commands
  // Everything else gets 100, sorted alphabetically within that tier
};

/**
 * Base artifact info needed for table display.
 */
export interface ArtifactRow {
  kind: string;
  name: string;         // Display name (e.g., "codebase-layout")
  relativePath: string; // Full relative path for reference
  tools: Tool[];        // Tools this artifact applies to
}

/**
 * Extract artifact display name from a relative path.
 * 
 * Examples:
 *   skills/codebase-layout → codebase-layout
 *   skills/codebase-layout/SKILL.md → codebase-layout
 *   rules/agent-definitions.md → agent-definitions
 *   AGENTS.md → AGENTS
 */
export function getArtifactName(relativePath: string, kind: string): string {
  // For skills, extract the skill directory name
  if (kind === "skill") {
    const match = relativePath.match(/^skills\/([^/]+)/);
    if (match) return match[1];
  }

  // For rules, strip the rules/ prefix and .md extension
  if (kind === "rule") {
    const match = relativePath.match(/^rules\/(.+)\.md$/);
    if (match) return match[1];
  }

  // For instructions at root level, strip .md extension
  if (kind === "instruction") {
    const match = relativePath.match(/^([^/]+)\.md$/);
    if (match) return match[1];
  }

  // For extensions, strip the extensions/ prefix
  if (kind === "extension") {
    const match = relativePath.match(/^extensions\/(.+)$/);
    if (match) return match[1];
  }

  // Fallback: return the path as-is
  return relativePath;
}

/**
 * Sort artifacts by kind priority, then alphabetically by name.
 */
export function sortArtifacts<T extends { kind: string; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = KIND_SORT_ORDER[a.kind] ?? 100;
    const orderB = KIND_SORT_ORDER[b.kind] ?? 100;
    if (orderA !== orderB) return orderA - orderB;
    // Within same priority tier, sort by kind name then artifact name
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.name.localeCompare(b.name);
  });
}

/**
 * Truncate a string with leading ellipsis if too long.
 */
export function truncatePath(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return "…" + str.slice(-(maxLen - 1));
}

/**
 * Calculate tool column specs.
 */
export interface ToolColumn {
  tool: Tool;
  width: number;
}

export function getToolColumns(tools: Tool[]): ToolColumn[] {
  return tools.map((t) => ({ tool: t, width: Math.max(t.length, 2) }));
}

/**
 * Render table header row.
 */
export function renderHeader(
  kindWidth: number,
  nameWidth: number,
  toolCols: ToolColumn[],
  extraHeaders: Array<{ label: string; width: number }> = []
): void {
  const kindH = chalk.dim("kind".padEnd(kindWidth));
  const nameH = chalk.dim("artifact".padEnd(nameWidth));
  const extraH = extraHeaders.map((h) => chalk.dim(h.label.padStart(h.width)) + "  ").join("");
  const toolH = toolCols.map((c) => chalk.dim(c.tool)).join("  ");
  console.log(`  ${kindH}  ${nameH}  ${extraH}${toolH}`);
}

/**
 * Render table separator row.
 */
export function renderSeparator(
  kindWidth: number,
  nameWidth: number,
  toolCols: ToolColumn[],
  extraWidths: number[] = []
): void {
  const parts = [
    "─".repeat(kindWidth),
    "─".repeat(nameWidth),
    ...extraWidths.map((w) => "─".repeat(w)),
    toolCols.map((c) => "─".repeat(c.width)).join("  "),
  ];
  console.log(chalk.dim(`  ${parts.join("  ")}`));
}

/**
 * Calculate dynamic column widths for kind and name columns.
 */
export function calculateColumnWidths(
  artifacts: Array<{ kind: string; name: string }>,
  minKindWidth = 4,
  maxNameWidth = 35
): { kindWidth: number; nameWidth: number } {
  const kindWidth = Math.max(
    minKindWidth,
    "kind".length,
    ...artifacts.map((a) => a.kind.length)
  );
  const maxNameLen = Math.max(
    "artifact".length,
    ...artifacts.map((a) => a.name.length)
  );
  const nameWidth = Math.min(maxNameLen, maxNameWidth);
  return { kindWidth, nameWidth };
}
