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

import { Command } from "commander";
import { loadState, detectDrift } from "../../core/manifest.js";
import { loadResolvedLoadout } from "../../core/resolve.js";
import { planRender } from "../../core/render.js";
import { findUnsanitizedRules } from "../../core/config.js";
import { resolveContexts, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import { log, heading } from "../../lib/output.js";
import type { CommandContext, AppliedState, ManifestEntry } from "../../core/types.js";
import type { RenderPlan } from "../../core/types.js";

interface ConfigDrift {
  added: string[];   // targets to be created
  removed: string[]; // targets to be deleted (orphaned)
}

interface OutputDrift {
  modified: string[];
  missing: string[];
  unlinked: string[];
}

interface DriftSummary {
  config: ConfigDrift;
  output: OutputDrift;
  inSync: boolean;
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
  const output: OutputDrift = {
    modified: driftResults.filter((d) => d.status === "modified").map((d) => d.entry.targetPath),
    missing: driftResults.filter((d) => d.status === "missing").map((d) => d.entry.targetPath),
    unlinked: driftResults.filter((d) => d.status === "unlinked").map((d) => d.entry.targetPath),
  };

  const inSync =
    config.added.length === 0 &&
    config.removed.length === 0 &&
    output.modified.length === 0 &&
    output.missing.length === 0 &&
    output.unlinked.length === 0;

  return { config, output, inSync };
}

/**
 * Render status for a single context. Returns true if state file existed.
 */
export async function executeStatus(ctx: CommandContext): Promise<boolean> {
  const state = loadState(ctx.configPath);
  if (!state) return false;

  const label = ctx.scope === "global" ? "Global" : "Project";
  const activeList = state.active.join(", ");
  heading(`${label} loadout: ${activeList}`);
  console.log(`  Applied: ${new Date(state.appliedAt).toLocaleString()}`);
  console.log(`  Mode: ${state.mode}`);
  console.log(`  Outputs: ${state.entries.length}`);
  console.log();

  const drift = await detectAllDrift(ctx, state);

  if (drift.inSync) {
    log.success("All outputs in sync");
    console.log();
    return true;
  }

  // Config drift
  if (drift.config.added.length > 0) {
    log.info(`${drift.config.added.length} to add:`);
    for (const p of drift.config.added) log.dim(`  + ${p}`);
    console.log();
  }

  if (drift.config.removed.length > 0) {
    log.warn(`${drift.config.removed.length} to remove:`);
    for (const p of drift.config.removed) log.dim(`  - ${p}`);
    console.log();
  }

  // Output drift
  if (drift.output.modified.length > 0) {
    log.warn(`${drift.output.modified.length} modified:`);
    for (const p of drift.output.modified) log.dim(`  ~ ${p}`);
    console.log();
  }

  if (drift.output.missing.length > 0) {
    log.error(`${drift.output.missing.length} missing:`);
    for (const p of drift.output.missing) log.dim(`  ! ${p}`);
    console.log();
  }

  if (drift.output.unlinked.length > 0) {
    log.warn(`${drift.output.unlinked.length} unlinked (symlink → file):`);
    for (const p of drift.output.unlinked) log.dim(`  ⚡ ${p}`);
    console.log();
  }

  // Shadowed files from original apply
  if (state.shadowed.length > 0) {
    log.dim(`${state.shadowed.length} shadowed (unmanaged files blocking):`);
    for (const s of state.shadowed) log.dim(`  ? ${s.targetPath}`);
    console.log();
  }

  log.dim("Run 'loadout sync' to reconcile.");
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

export const statusCommand = new Command("status")
  .description("Show loadout status and drift")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .option(...SCOPE_FLAGS.all)
  .action(async (options: ScopeFlags) => {
    const { contexts } = await resolveContexts(options);

    let hasAny = false;
    for (const ctx of contexts) {
      // Check for unsanitized rules
      checkUnsanitizedRules(ctx);
      
      hasAny = (await executeStatus(ctx)) || hasAny;
    }

    if (!hasAny) {
      log.warn("No loadout applied.");
      log.dim("Run 'loadout activate <name>' to apply a loadout.");
    }
  });
