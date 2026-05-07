/**
 * loadout remove — Remove applied loadout outputs.
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   -a / --all     → remove from both scopes (default)
 *   (none)         → all available scopes
 */

import { Command } from "commander";
import { loadState, clearState } from "../../core/manifest.js";
import { removeManaged } from "../../core/render.js";
import { resolveContexts, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import { log, heading, list } from "../../lib/output.js";
import type { CommandContext } from "../../core/types.js";

export interface RemoveOptions extends ScopeFlags {
  dryRun?: boolean;
}

/**
 * Remove all managed outputs for a context and clear its state.
 *
 * If `name` is given and doesn't match the applied loadout, this is a no-op
 * with a warning (so users don't accidentally clean the wrong loadout).
 */
export async function executeRemove(
  ctx: CommandContext,
  name?: string,
  options: RemoveOptions = {}
): Promise<void> {
  const state = loadState(ctx.configPath);

  if (!state) {
    log.dim(`[${ctx.scope}] No loadout currently applied.`);
    return;
  }

  const activeList = state.active.join(", ");

  if (name && !state.active.includes(name)) {
    log.warn(
      `[${ctx.scope}] Active loadouts are [${activeList}], not "${name}". ` +
        `Run without a name to remove the current state.`
    );
    return;
  }

  if (options.dryRun) {
    heading(`Would remove loadouts: ${activeList} (${ctx.scope})`);
    console.log();
    log.info(`${state.entries.length} files would be removed:`);
    list(state.entries.map((e) => e.targetPath));
    return;
  }

  const { removed, missing } = await removeManaged(ctx.configPath, ctx.projectRoot, ctx.scope);
  clearState(ctx.configPath);

  heading(`Removed loadouts: ${activeList} (${ctx.scope})`);

  if (removed.length > 0) {
    log.success(`${removed.length} files removed`);
  }

  if (missing.length > 0) {
    log.warn(`${missing.length} files were already missing:`);
    list(missing);
  }
}

export const removeCommand = new Command("remove")
  .description("Remove applied loadout outputs")
  .argument("[name]", "Loadout name (optional, validates against active)")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .option(...SCOPE_FLAGS.all)
  .option("--dry-run", "Preview what would be removed")
  .action(async (name: string | undefined, options: RemoveOptions) => {
    const { contexts } = await resolveContexts(options);

    for (const ctx of contexts) {
      await executeRemove(ctx, name, options);
    }
  });
