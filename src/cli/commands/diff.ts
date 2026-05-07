/**
 * loadout diff — Show what would change if a loadout were applied.
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   -a / --all     → show diff for both scopes
 *   (none)         → auto-detect; error if name exists in both without flag
 */

import { Command } from "commander";
import { getContext } from "../../core/discovery.js";
import { loadResolvedLoadout } from "../../core/resolve.js";
import { planRender } from "../../core/render.js";
import { loadState } from "../../core/manifest.js";
import {
  resolveContexts,
  requireScopeForName,
  SCOPE_FLAGS,
  type ScopeFlags,
} from "../../core/scope.js";
import { log, heading } from "../../lib/output.js";
import type { CommandContext } from "../../core/types.js";

export async function executeDiff(
  ctx: CommandContext,
  name?: string
): Promise<void> {
  const result = await loadResolvedLoadout(ctx, name);
  const { loadout, loadoutName } = result;

  const plan = await planRender(loadout, ctx.projectRoot, ctx.scope);
  const state = loadState(ctx.configPath);

  heading(`Diff: ${loadoutName} (${ctx.scope})`);
  console.log();

  const stateTargets = new Set(state?.entries.map((e) => e.targetPath) || []);
  const creates = plan.outputs.filter((o) => !stateTargets.has(o.spec.targetPath));
  const updates = plan.outputs.filter((o) => stateTargets.has(o.spec.targetPath));

  if (creates.length > 0) {
    console.log(`ℹ Create (${creates.length}):`);
    for (const { spec } of creates) console.log(`  + ${spec.targetPath}`);
    console.log();
  }

  if (updates.length > 0) {
    console.log(`ℹ Update (${updates.length}):`);
    for (const { spec } of updates) console.log(`  ~ ${spec.targetPath}`);
    console.log();
  }

  if (state) {
    const planTargets = new Set(plan.outputs.map((o) => o.spec.targetPath));
    const deletes = state.entries.filter((e) => !planTargets.has(e.targetPath));
    if (deletes.length > 0) {
      console.log(`ℹ Delete (${deletes.length}):`);
      for (const entry of deletes) console.log(`  - ${entry.targetPath}`);
      console.log();
    }
  }

  if (plan.shadowed.length > 0) {
    console.log(`ℹ Shadowed (${plan.shadowed.length}):`);
    for (const s of plan.shadowed) {
      console.log(`  ! ${s.targetPath} (unmanaged file exists)`);
    }
  }
}

export const diffCommand = new Command("diff")
  .description("Show what would change if loadout were applied")
  .argument("[name]", "Loadout name (uses default if not specified)")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .option(...SCOPE_FLAGS.all)
  .action(async (name: string | undefined, options: ScopeFlags) => {
    const cwd = process.cwd();

    // If a name is given and no explicit scope, check for collisions
    if (name && !options.local && !options.global && !options.all) {
      try {
        const scope = await requireScopeForName(name, options, cwd);
        const ctx = await getContext(scope, cwd);
        await executeDiff(ctx, name);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("exists in both")) {
          log.error(msg);
          process.exit(1);
        }
      }
    }

    // Show diff for all resolved scopes
    const { contexts } = await resolveContexts(options, cwd);
    let hasAny = false;

    for (const ctx of contexts) {
      try {
        await executeDiff(ctx, name);
        hasAny = true;
      } catch {
        // Scope doesn't have this loadout — skip silently
      }
    }

    if (!hasAny) {
      log.warn("No loadout found.");
      log.dim("Run 'loadout init' to set up a loadout.");
    }
  });
