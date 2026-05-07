/**
 * loadout info — Show detailed loadout information.
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   -a / --all     → show both scopes (default)
 *   (none)         → all available scopes; error if name exists in both without flag
 */

import { Command } from "commander";
import {
  resolveContexts,
  requireScopeForName,
  SCOPE_FLAGS,
  type ScopeFlags,
} from "../../core/scope.js";
import { getContext } from "../../core/discovery.js";
import { loadResolvedLoadout } from "../../core/resolve.js";
import { loadState } from "../../core/manifest.js";
import { log, heading, keyValue } from "../../lib/output.js";
import chalk from "chalk";
import type { CommandContext, ResolvedItem, Tool } from "../../core/types.js";
import { registry } from "../../core/registry.js";
import {
  estimateFileTokens,
  estimateDirTokens,
  estimateSkillUpfrontTokens,
  formatTokens,
} from "../../core/tokens.js";

// Kinds whose content goes into the agent's context window.
// Extensions (runtime code) and themes (UI config) don't count.
const CONTEXT_KINDS = new Set(["rule", "skill", "instruction", "prompt"]);

const MIN_KIND_W = 4; // minimum kind column width

// Sort order for artifact kinds in info display
// Prioritizes context-heavy kinds first, then alphabetical for the rest
const KIND_SORT_ORDER: Record<string, number> = {
  instruction: 0,
  rule: 1,
  skill: 2,
  prompt: 3,  // slash commands
  // Everything else gets 100, sorted alphabetically within that tier
};

/**
 * Sort items by kind priority, then alphabetically by path within each kind.
 */
function sortItems(items: ResolvedItem[]): ResolvedItem[] {
  return [...items].sort((a, b) => {
    const orderA = KIND_SORT_ORDER[a.kind] ?? 100;
    const orderB = KIND_SORT_ORDER[b.kind] ?? 100;
    if (orderA !== orderB) return orderA - orderB;
    // Within same priority tier, sort by kind name then path
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.relativePath.localeCompare(b.relativePath);
  });
}

/**
 * Token breakdown for a resolved item.
 * - upfront: tokens injected into context at session start
 * - lazy: tokens loaded on-demand when the artifact is invoked
 */
interface TokenBreakdown {
  upfront: number;
  lazy: number;
}

/**
 * Estimate tokens for a resolved item based on its kind.
 * Skills are special: only the description is upfront, full content is lazy.
 */
function getItemTokens(item: ResolvedItem): TokenBreakdown {
  if (!CONTEXT_KINDS.has(item.kind)) return { upfront: 0, lazy: 0 };
  const kind = registry.getKind(item.kind);
  if (!kind) return { upfront: 0, lazy: 0 };

  // Skills: description is upfront, full content is lazy-loaded
  if (item.kind === "skill") {
    const upfront = estimateSkillUpfrontTokens(item.sourcePath);
    const total = estimateDirTokens(item.sourcePath);
    return { upfront, lazy: Math.max(0, total - upfront) };
  }

  // All other context kinds: full content is upfront
  const total = kind.layout === "dir"
    ? estimateDirTokens(item.sourcePath)
    : estimateFileTokens(item.sourcePath);
  return { upfront: total, lazy: 0 };
}

function renderArtifactTable(items: ResolvedItem[], tools: Tool[]): void {
  if (items.length === 0) {
    log.dim("  No artifacts.");
    console.log();
    return;
  }

  // Sort items by kind priority, then alphabetically
  const sortedItems = sortItems(items);

  // Pre-compute tokens for context kinds
  const itemTokens = new Map<ResolvedItem, TokenBreakdown>();
  let totalUpfront = 0;
  let totalLazy = 0;
  for (const item of sortedItems) {
    const tokens = getItemTokens(item);
    itemTokens.set(item, tokens);
    totalUpfront += tokens.upfront;
    totalLazy += tokens.lazy;
  }

  // Check if any items have tokens to show
  const hasTokens = totalUpfront > 0 || totalLazy > 0;
  const hasLazy = totalLazy > 0;

  // Dynamic column widths based on actual content
  const KIND_W = Math.max(
    MIN_KIND_W,
    "kind".length,
    ...sortedItems.map((i) => i.kind.length)
  );
  const maxPathLen = Math.max(
    "artifact".length,
    ...sortedItems.map((i) => i.relativePath.length)
  );
  const PATH_W = Math.min(maxPathLen, 45);

  // Token column widths (right-aligned numbers)
  const TOKEN_W = hasTokens ? 7 : 0;
  const LAZY_W = hasLazy ? 7 : 0;

  // Tool columns: width = tool name length (min 2)
  const toolCols = tools.map((t) => ({ tool: t, w: Math.max(t.length, 2) }));

  // ── Header ───────────────────────────────────────────────────────────────
  const kindH = chalk.dim("kind".padEnd(KIND_W));
  const pathH = chalk.dim("artifact".padEnd(PATH_W));
  const upfrontH = hasTokens ? chalk.dim("upfront".padStart(TOKEN_W)) + "  " : "";
  const lazyH = hasLazy ? chalk.dim("lazy".padStart(LAZY_W)) + "  " : "";
  const toolH = toolCols.map((c) => chalk.dim(c.tool)).join("  ");
  console.log(`  ${kindH}  ${pathH}  ${upfrontH}${lazyH}${toolH}`);

  // ── Separator ─────────────────────────────────────────────────────────────
  const sep = [
    "─".repeat(KIND_W),
    "─".repeat(PATH_W),
    ...(hasTokens ? ["─".repeat(TOKEN_W)] : []),
    ...(hasLazy ? ["─".repeat(LAZY_W)] : []),
    toolCols.map((c) => "─".repeat(c.w)).join("  "),
  ].join("  ");
  console.log(chalk.dim(`  ${sep}`))

  // ── Rows ──────────────────────────────────────────────────────────────────
  for (const item of sortedItems) {
    const kindCell = chalk.dim(item.kind.padEnd(KIND_W));

    // Truncate long paths with a leading ellipsis
    const displayPath =
      item.relativePath.length > PATH_W
        ? "…" + item.relativePath.slice(-(PATH_W - 1))
        : item.relativePath;
    const pathCell = displayPath.padEnd(PATH_W);

    // Token cells (upfront and lazy)
    let upfrontCell = "";
    let lazyCell = "";
    if (hasTokens) {
      const tokens = itemTokens.get(item) ?? { upfront: 0, lazy: 0 };
      if (tokens.upfront > 0) {
        const formatted = tokens.upfront >= 1000 ? `${(tokens.upfront / 1000).toFixed(1)}k` : String(tokens.upfront);
        upfrontCell = chalk.cyan(formatted.padStart(TOKEN_W)) + "  ";
      } else {
        upfrontCell = chalk.dim("—".padStart(TOKEN_W)) + "  ";
      }
    }
    if (hasLazy) {
      const tokens = itemTokens.get(item) ?? { upfront: 0, lazy: 0 };
      if (tokens.lazy > 0) {
        const formatted = tokens.lazy >= 1000 ? `${(tokens.lazy / 1000).toFixed(1)}k` : String(tokens.lazy);
        lazyCell = chalk.yellow(formatted.padStart(LAZY_W)) + "  ";
      } else {
        lazyCell = chalk.dim("—".padStart(LAZY_W)) + "  ";
      }
    }

    // One cell per tool — colored ✓ + plain padding so ANSI codes don't break alignment
    // Only show ✓ if the tool actually supports this kind (has a mapping)
    const toolCells = toolCols
      .map((c) => {
        const hasMapping = registry.resolveMapping(c.tool, item.kind);
        if (item.tools.includes(c.tool) && hasMapping) {
          return chalk.green("✓") + " ".repeat(c.w - 1);
        }
        return " ".repeat(c.w);
      })
      .join("  ");

    console.log(`  ${kindCell}  ${pathCell}  ${upfrontCell}${lazyCell}${toolCells}`);
  }

  // ── Footer with totals ────────────────────────────────────────────────────
  if (hasTokens) {
    console.log();
    if (hasLazy) {
      log.dim(`  Upfront: ${formatTokens(totalUpfront)} • Lazy: ${formatTokens(totalLazy)} • Total: ${formatTokens(totalUpfront + totalLazy)}`);
    } else {
      log.dim(`  Total context: ${formatTokens(totalUpfront)}`);
    }
  }

  console.log();
}

/**
 * Render info for a single named loadout within a scope.
 * Throws if the loadout cannot be loaded; callers decide how to handle.
 */
async function renderInfoForName(
  ctx: CommandContext,
  name: string
): Promise<void> {
  const result = await loadResolvedLoadout(ctx, name);

  const { loadout, loadoutName } = result;
  const scopeLabel = ctx.scope === "global" ? "Global" : "Project";

  heading(`${scopeLabel} loadout: ${loadoutName}`);

  const meta: Record<string, string | undefined> = {};
  if (loadout.description) meta["Description"] = loadout.description;
  if (loadout.extendsChain.length > 1) {
    meta["Extends"] = loadout.extendsChain.join(" → ");
  }
  meta["Root"] = loadout.rootPath;

  keyValue(meta);
  console.log();

  renderArtifactTable(loadout.items, loadout.tools);
}

/**
 * Render info for a scope. When no name is given, uses active loadouts from
 * state (mirrors `status`), falling back to rootConfig.default / "base".
 * Throws if nothing can be loaded; callers decide how to handle.
 */
export async function executeInfo(
  ctx: CommandContext,
  name?: string
): Promise<void> {
  if (!name) {
    // Prefer what's actually active over the (possibly stale) config default.
    const state = loadState(ctx.configPath);
    if (state && state.active.length > 0) {
      for (const activeName of state.active) {
        await renderInfoForName(ctx, activeName);
      }
      return;
    }
  }
  // Explicit name, or no state yet — fall through to normal resolution.
  await renderInfoForName(ctx, name ?? "base");
}

export const infoCommand = new Command("info")
  .description("Show loadout information")
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
        await executeInfo(ctx, name);
        return;
      } catch (err) {
        // If it's a collision error, rethrow
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("exists in both")) {
          log.error(msg);
          process.exit(1);
        }
        // Otherwise fall through to show all
      }
    }

    // Show info for all resolved scopes
    const { contexts } = await resolveContexts(options, cwd);
    let hasAny = false;

    for (const ctx of contexts) {
      try {
        await executeInfo(ctx, name);
        hasAny = true;
      } catch (err) {
        // Only skip when the loadout genuinely doesn't exist in this scope.
        // Re-surface unexpected errors so they aren't hidden.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("not found") && !msg.includes("No .loadout") && !msg.includes("No global")) {
          log.error(msg);
        }
      }
    }

    if (!hasAny) {
      log.warn("No loadout found.");
      log.dim("Run 'loadout init' to set up a loadout.");
    }
  });
