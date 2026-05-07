/**
 * loadout diff — Show what would change if a loadout were applied.
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   -a / --all     → show diff for both scopes
 *   (none)         → auto-detect; error if name exists in both without flag
 *
 * Output follows unified visual language (see docs/visual-language.md).
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
import {
  groupOutputsByArtifact,
  renderChangeTable,
  type ChangeType,
} from "../../lib/artifact-table.js";
import type { CommandContext, Tool } from "../../core/types.js";

export async function executeDiff(
  ctx: CommandContext,
  name?: string
): Promise<void> {
  const result = await loadResolvedLoadout(ctx, name);
  const { loadout, loadoutName } = result;

  const plan = await planRender(loadout, ctx.projectRoot, ctx.scope);
  const state = loadState(ctx.configPath);

  heading(`Diff: ${loadoutName} (${ctx.scope})`);

  // Build sets for change detection
  const stateTargets = new Set(state?.entries.map((e) => e.targetPath) || []);
  const planTargets = new Set(plan.outputs.map((o) => o.spec.targetPath));

  // Collect all tools
  const toolSet = new Set<Tool>();
  for (const { spec } of plan.outputs) {
    toolSet.add(spec.tool);
  }
  if (state) {
    for (const entry of state.entries) {
      for (const tool of entry.tools) {
        toolSet.add(tool);
      }
    }
  }
  const tools = Array.from(toolSet).sort();

  // Build outputs with change types
  const outputs: Array<{
    spec: (typeof plan.outputs)[0]["spec"];
    change: ChangeType;
  }> = [];

  // Current plan outputs: create or update
  for (const { spec } of plan.outputs) {
    const change: ChangeType = stateTargets.has(spec.targetPath) ? "updated" : "added";
    outputs.push({ spec, change });
  }

  // Deleted entries from state
  if (state) {
    for (const entry of state.entries) {
      if (!planTargets.has(entry.targetPath)) {
        // Use first tool for display (all tools share the same output)
        outputs.push({
          spec: {
            tool: entry.tools[0],
            kind: entry.kind,
            sourcePath: entry.sourcePath,
            targetPath: entry.targetPath,
            mode: entry.mode,
          },
          change: "removed",
        });
      }
    }
  }

  // Shadowed entries
  for (const s of plan.shadowed) {
    outputs.push({
      spec: {
        tool: s.tool,
        kind: s.kind,
        sourcePath: s.sourcePath,
        targetPath: s.targetPath,
        mode: "symlink", // Default, doesn't matter for display
      },
      change: "shadowed",
    });
  }

  if (outputs.length === 0) {
    log.success("No changes");
    return;
  }

  const artifacts = groupOutputsByArtifact(outputs);
  renderChangeTable(artifacts, tools, { showAction: true });

  // Summary counts
  const added = outputs.filter((o) => o.change === "added").length;
  const updated = outputs.filter((o) => o.change === "updated").length;
  const removed = outputs.filter((o) => o.change === "removed").length;
  const shadowed = outputs.filter((o) => o.change === "shadowed").length;

  console.log();
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} to create`);
  if (updated > 0) parts.push(`${updated} to update`);
  if (removed > 0) parts.push(`${removed} to remove`);
  if (shadowed > 0) parts.push(`${shadowed} shadowed`);
  log.dim(`  ${parts.join(" • ")}`);
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
