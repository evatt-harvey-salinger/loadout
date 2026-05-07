/**
 * loadout status — Show drift status for active loadouts.
 *
 * Detects two types of drift:
 *   1. Config drift: loadout definition changed (items added/removed)
 *   2. Output drift: managed files changed on disk (modified/missing/unlinked)
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   -a / --all     → show both scopes (default)
 */

import * as path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { loadState, detectDrift, type DriftResult } from "../../core/manifest.js";
import { loadResolvedLoadout } from "../../core/resolve.js";
import { planRender } from "../../core/render.js";
import { findUnsanitizedRules } from "../../core/config.js";
import { resolveContexts, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import { log, heading } from "../../lib/output.js";
import {
  getArtifactName,
  sortArtifacts,
  truncatePath,
  getToolColumns,
  renderHeader,
  renderSeparator,
  calculateColumnWidths,
  KIND_SORT_ORDER,
} from "../../lib/artifact-table.js";
import type { CommandContext, AppliedState, Tool } from "../../core/types.js";
import type { RenderPlan } from "../../core/types.js";

type DriftStatus = DriftResult["status"];

// Status priority for determining "worst" status (higher = worse)
const STATUS_PRIORITY: Record<DriftStatus, number> = {
  ok: 0,
  modified: 1,
  unlinked: 2,
  missing: 3,
  broken: 4,
};

// Status display symbols and colors
const STATUS_DISPLAY: Record<DriftStatus, { symbol: string; color: (s: string) => string }> = {
  ok: { symbol: "✓", color: chalk.green },
  modified: { symbol: "~", color: chalk.yellow },
  unlinked: { symbol: "⚡", color: chalk.yellow },
  missing: { symbol: "!", color: chalk.red },
  broken: { symbol: "💀", color: chalk.red },
};

interface ConfigDrift {
  added: string[];   // targets to be created
  removed: string[]; // targets to be deleted (orphaned)
}

// Grouped artifact status: one row per artifact with status per tool
interface ArtifactStatus {
  name: string;           // Display name (e.g., "codebase-layout")
  relativePath: string;   // Full relative path for reference
  kind: string;
  toolStatus: Map<Tool, DriftStatus>;  // Status per tool
  overallStatus: DriftStatus;          // Worst status across tools
}

interface DriftSummary {
  config: ConfigDrift;
  artifacts: ArtifactStatus[];
  inSync: boolean;
  tools: Tool[];  // All tools involved
}

/**
 * Detect config drift by comparing current loadout definition against applied state.
 */
function detectConfigDrift(plan: RenderPlan, state: AppliedState): ConfigDrift {
  const stateTargets = new Set(state.entries.map((e) => e.targetPath));
  const planTargets = new Set(plan.outputs.map((o) => o.spec.targetPath));

  const added = plan.outputs
    .filter((o) => !stateTargets.has(o.spec.targetPath))
    .map((o) => o.spec.targetPath);

  const removed = state.entries
    .filter((e) => !planTargets.has(e.targetPath))
    .map((e) => e.targetPath);

  return { added, removed };
}

/**
 * Convert sourcePath to a display-friendly relative path.
 * Tries configPath first, then projectRoot, then shows basename with parent.
 */
function getRelativePath(sourcePath: string, configPath: string, projectRoot: string): string {
  // Try relative to configPath first
  const relConfig = path.relative(configPath, sourcePath);
  if (!relConfig.startsWith("..")) {
    return relConfig;
  }

  // Try relative to projectRoot
  const relProject = path.relative(projectRoot, sourcePath);
  if (!relProject.startsWith("..")) {
    return relProject;
  }

  // Fallback: show parent/basename for context
  const basename = path.basename(sourcePath);
  const parent = path.basename(path.dirname(sourcePath));
  return `${parent}/${basename}`;
}

/**
 * Group drift results by artifact (sourcePath) and compute per-tool status.
 */
function groupByArtifact(
  driftResults: DriftResult[],
  configPath: string,
  projectRoot: string
): { artifacts: ArtifactStatus[]; tools: Tool[] } {
  // Collect all tools
  const toolSet = new Set<Tool>();
  for (const result of driftResults) {
    toolSet.add(result.entry.tool);
  }
  const tools = Array.from(toolSet).sort();

  // Group by sourcePath
  const bySource = new Map<string, DriftResult[]>();
  for (const result of driftResults) {
    const key = result.entry.sourcePath;
    if (!bySource.has(key)) {
      bySource.set(key, []);
    }
    bySource.get(key)!.push(result);
  }

  // Build artifact status for each group
  const artifacts: ArtifactStatus[] = [];
  for (const [sourcePath, results] of bySource) {
    const toolStatus = new Map<Tool, DriftStatus>();
    let worstPriority = 0;
    let overallStatus: DriftStatus = "ok";

    for (const result of results) {
      toolStatus.set(result.entry.tool, result.status);
      const priority = STATUS_PRIORITY[result.status];
      if (priority > worstPriority) {
        worstPriority = priority;
        overallStatus = result.status;
      }
    }

    const relativePath = getRelativePath(sourcePath, configPath, projectRoot);
    const kind = results[0].entry.kind;

    artifacts.push({
      name: getArtifactName(relativePath, kind),
      relativePath,
      kind,
      toolStatus,
      overallStatus,
    });
  }

  return { artifacts, tools };
}

/**
 * Sort artifacts: worst status first, then by kind priority, then by name.
 */
function sortByStatusThenKind(artifacts: ArtifactStatus[]): ArtifactStatus[] {
  return [...artifacts].sort((a, b) => {
    // First: worst status first
    const pa = STATUS_PRIORITY[a.overallStatus];
    const pb = STATUS_PRIORITY[b.overallStatus];
    if (pa !== pb) return pb - pa;

    // Then: by kind priority
    const orderA = KIND_SORT_ORDER[a.kind] ?? 100;
    const orderB = KIND_SORT_ORDER[b.kind] ?? 100;
    if (orderA !== orderB) return orderA - orderB;

    // Finally: alphabetically by name
    return a.name.localeCompare(b.name);
  });
}

/**
 * Render artifact status table.
 */
function renderStatusTable(artifacts: ArtifactStatus[], tools: Tool[]): void {
  if (artifacts.length === 0) {
    log.dim("  No artifacts.");
    console.log();
    return;
  }

  // Sort: worst status first, then by kind, then by name
  const sortedArtifacts = sortByStatusThenKind(artifacts);

  // Calculate column widths
  const { kindWidth, nameWidth } = calculateColumnWidths(sortedArtifacts);
  const toolCols = getToolColumns(tools);
  const STATUS_W = 8;  // "status" header + padding

  // ── Header ───────────────────────────────────────────────────────────────
  const kindH = chalk.dim("kind".padEnd(kindWidth));
  const nameH = chalk.dim("artifact".padEnd(nameWidth));
  const toolH = toolCols.map((c) => chalk.dim(c.tool)).join("  ");
  const statusH = chalk.dim("status");
  console.log(`  ${kindH}  ${nameH}  ${toolH}  ${statusH}`);

  // ── Separator ─────────────────────────────────────────────────────────────
  const sep = [
    "─".repeat(kindWidth),
    "─".repeat(nameWidth),
    toolCols.map((c) => "─".repeat(c.width)).join("  "),
    "─".repeat(STATUS_W),
  ].join("  ");
  console.log(chalk.dim(`  ${sep}`));

  // ── Rows ──────────────────────────────────────────────────────────────────
  for (const artifact of sortedArtifacts) {
    const kindCell = chalk.dim(artifact.kind.padEnd(kindWidth));
    const nameCell = truncatePath(artifact.name, nameWidth).padEnd(nameWidth);

    // Tool status cells
    const toolCells = toolCols
      .map((c) => {
        const status = artifact.toolStatus.get(c.tool);
        if (!status) {
          return " ".repeat(c.width);  // Tool not applicable
        }
        const { symbol, color } = STATUS_DISPLAY[status];
        // Emoji takes 2 chars visually, regular symbols take 1
        const symbolWidth = symbol === "💀" ? 2 : 1;
        return color(symbol) + " ".repeat(c.width - symbolWidth);
      })
      .join("  ");

    // Overall status
    const { color: overallColor } = STATUS_DISPLAY[artifact.overallStatus];
    const statusCell = overallColor(artifact.overallStatus);

    console.log(`  ${kindCell}  ${nameCell}  ${toolCells}  ${statusCell}`);
  }

  console.log();
}

/**
 * Render config drift (added/removed artifacts).
 */
function renderConfigDrift(config: ConfigDrift): void {
  if (config.added.length > 0) {
    log.info(`${config.added.length} to add:`);
    for (const p of config.added) log.dim(`  + ${p}`);
    console.log();
  }

  if (config.removed.length > 0) {
    log.warn(`${config.removed.length} to remove:`);
    for (const p of config.removed) log.dim(`  - ${p}`);
    console.log();
  }
}

/**
 * Detect all drift for a context.
 */
async function detectAllDrift(
  ctx: CommandContext,
  state: AppliedState
): Promise<DriftSummary> {
  // Config drift: re-resolve ALL active loadouts and compare merged plan
  let config: ConfigDrift = { added: [], removed: [] };
  
  try {
    // Merge plans from all active loadouts (same logic as applyMultiPlan)
    const seenTargets = new Set<string>();
    const mergedOutputs: RenderPlan["outputs"] = [];

    for (const activeName of state.active) {
      const { loadout } = await loadResolvedLoadout(ctx, activeName);
      const plan = await planRender(loadout, ctx.projectRoot, ctx.scope);
      for (const output of plan.outputs) {
        if (!seenTargets.has(output.spec.targetPath)) {
          seenTargets.add(output.spec.targetPath);
          mergedOutputs.push(output);
        }
      }
    }

    const mergedPlan: RenderPlan = { outputs: mergedOutputs, shadowed: [], errors: [] };
    config = detectConfigDrift(mergedPlan, state);
  } catch {
    // Can't resolve loadout — might be deleted or broken
    // We'll still show output drift
  }

  // Output drift: check managed files on disk
  const driftResults = detectDrift(state, ctx.projectRoot);
  const { artifacts, tools } = groupByArtifact(driftResults, ctx.configPath, ctx.projectRoot);

  // Check if everything is in sync
  const configInSync = config.added.length === 0 && config.removed.length === 0;
  const outputInSync = artifacts.every((a) => a.overallStatus === "ok");
  const inSync = configInSync && outputInSync;

  return { config, artifacts, tools, inSync };
}

/**
 * Collapse skill reference files into their parent skill.
 * E.g., skills/foo/SKILL.md + skills/foo/references/bar.md → foo
 * Aggregates status: worst status of any file in the skill.
 */
function collapseSkillReferences(artifacts: ArtifactStatus[]): ArtifactStatus[] {
  const skillGroups = new Map<string, ArtifactStatus[]>();
  const nonSkills: ArtifactStatus[] = [];

  for (const artifact of artifacts) {
    if (artifact.kind !== "skill") {
      nonSkills.push(artifact);
      continue;
    }

    // Extract skill name from relativePath: skills/<name>/... → <name>
    const match = artifact.relativePath.match(/^skills\/([^/]+)/);
    if (!match) {
      nonSkills.push(artifact);
      continue;
    }

    const skillName = match[1];
    if (!skillGroups.has(skillName)) {
      skillGroups.set(skillName, []);
    }
    skillGroups.get(skillName)!.push(artifact);
  }

  // Aggregate each skill group into a single artifact
  const collapsedSkills: ArtifactStatus[] = [];
  for (const [skillName, files] of skillGroups) {
    // Merge toolStatus: for each tool, take worst status
    const mergedToolStatus = new Map<Tool, DriftStatus>();
    let worstPriority = 0;
    let overallStatus: DriftStatus = "ok";

    for (const file of files) {
      for (const [tool, status] of file.toolStatus) {
        const existing = mergedToolStatus.get(tool);
        if (!existing || STATUS_PRIORITY[status] > STATUS_PRIORITY[existing]) {
          mergedToolStatus.set(tool, status);
        }
      }
      const priority = STATUS_PRIORITY[file.overallStatus];
      if (priority > worstPriority) {
        worstPriority = priority;
        overallStatus = file.overallStatus;
      }
    }

    collapsedSkills.push({
      name: skillName,
      relativePath: `skills/${skillName}`,
      kind: "skill",
      toolStatus: mergedToolStatus,
      overallStatus,
    });
  }

  return [...nonSkills, ...collapsedSkills];
}

/**
 * Render status for a single context. Returns true if state file existed.
 */
export async function executeStatus(ctx: CommandContext, showReferences: boolean = false): Promise<boolean> {
  const state = loadState(ctx.configPath);
  if (!state) return false;

  const label = ctx.scope === "global" ? "Global" : "Project";
  const activeList = state.active.join(", ");
  heading(`${label} loadout: ${activeList}`);

  const drift = await detectAllDrift(ctx, state);

  // Collapse skill references unless --references flag
  // When showing references, use relativePath as name to distinguish files
  let displayArtifacts: ArtifactStatus[];
  if (showReferences) {
    displayArtifacts = drift.artifacts.map((a) => ({
      ...a,
      name: a.relativePath,  // Show full path when expanded
    }));
  } else {
    displayArtifacts = collapseSkillReferences(drift.artifacts);
  }

  console.log(`  Applied: ${new Date(state.appliedAt).toLocaleString()}`);
  console.log(`  Mode: ${state.mode}`);
  console.log(`  Artifacts: ${displayArtifacts.length}`);
  console.log();

  // Config drift (added/removed) - only show if there's drift
  renderConfigDrift(drift.config);

  // Always show artifact table
  renderStatusTable(displayArtifacts, drift.tools);

  // Shadowed files from original apply
  if (state.shadowed.length > 0) {
    log.dim(`${state.shadowed.length} shadowed (unmanaged files blocking):`);
    for (const s of state.shadowed) log.dim(`  ? ${s.targetPath}`);
    console.log();
  }

  // Summary message
  if (drift.inSync) {
    log.success("All in sync");
  } else {
    log.dim("Run 'loadout sync' to reconcile.");
  }
  console.log();

  return true;
}

/**
 * Check for unsanitized rules and warn.
 */
function checkUnsanitizedRules(ctx: CommandContext): void {
  const unsanitized = findUnsanitizedRules(ctx.configPath);
  if (unsanitized.length === 0) return;

  log.warn(`${unsanitized.length} rule(s) need sanitization for cross-tool compatibility:`);
  for (const name of unsanitized) {
    log.dim(`  ${name}`);
  }
  log.dim("Run 'loadout sanitize' to fix.");
  console.log();
}

interface StatusOptions extends ScopeFlags {
  references?: boolean;
}

export const statusCommand = new Command("status")
  .description("Show loadout status and drift")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .option(...SCOPE_FLAGS.all)
  .option("-r, --references", "Show individual skill reference files")
  .action(async (options: StatusOptions) => {
    const { contexts } = await resolveContexts(options);

    let hasAny = false;
    for (const ctx of contexts) {
      // Check for unsanitized rules
      checkUnsanitizedRules(ctx);
      
      hasAny = (await executeStatus(ctx, options.references ?? false)) || hasAny;
    }

    if (!hasAny) {
      log.warn("No loadout applied.");
      log.dim("Run 'loadout activate <name>' to apply a loadout.");
    }
  });
