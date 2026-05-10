/**
 * loadout list — List available loadouts.
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   -a / --all     → show both scopes (default)
 *   (none)         → all available scopes
 */

import { Command } from "commander";
import * as path from "node:path";
import {
  getGlobalRoot,
  findNearestLoadoutRoot,
  collectRootsWithSources,
} from "../../core/discovery.js";
import {
  listLoadouts,
  parseLoadoutDefinition,
  parseRootConfig,
} from "../../core/config.js";
import { loadState } from "../../core/manifest.js";
import { resolveScopes, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import { fileExists } from "../../lib/fs.js";
import { log, heading } from "../../lib/output.js";
import {
  type ScopeIndicator,
  rootToScope,
  renderScopeLegend,
} from "../../lib/scope-indicators.js";
import {
  calculateLoadoutColumnWidths,
  renderLoadoutHeader,
  renderLoadoutSeparator,
  renderLoadoutCellWithDefault,
} from "../../lib/loadout-column.js";
import type { LoadoutRoot } from "../../core/types.js";
import chalk from "chalk";

interface LoadoutInfo {
  name: string;
  isDefault: boolean;
  isActive: boolean;
  count: number;
  description?: string;
  scope: ScopeIndicator;
  error?: boolean;
}

/**
 * Collect loadouts from a root and its sources.
 */
function collectLoadoutsFromRoot(
  primaryRoot: LoadoutRoot,
  activeNames: Set<string>,
  seenNames: Set<string>,
  sourceChain: string[],
  includeBundled: boolean = false
): { infos: LoadoutInfo[]; warnings: string[] } {
  const { roots, warnings } = collectRootsWithSources(primaryRoot, false, includeBundled);
  const infos: LoadoutInfo[] = [];

  // Collect source references for footer
  for (const root of roots) {
    if (root.level === "source" && root.sourceRef) {
      if (!sourceChain.includes(root.sourceRef)) {
        sourceChain.push(root.sourceRef);
      }
    }
  }

  const rootConfig = parseRootConfig(primaryRoot.path);

  for (const root of roots) {
    const loadoutNames = listLoadouts(root.path);
    const scope = rootToScope(root);

    for (const name of loadoutNames) {
      // Skip if we've already seen this name (nearest wins)
      if (seenNames.has(name)) continue;
      seenNames.add(name);

      const isDefault = root.level === "project" && rootConfig.default === name;
      const isActive = activeNames.has(name);
      const defPath = path.join(root.path, "loadouts", `${name}.yaml`);
      const ymlPath = path.join(root.path, "loadouts", `${name}.yml`);
      const filePath = fileExists(defPath) ? defPath : ymlPath;

      try {
        const def = parseLoadoutDefinition(filePath);
        infos.push({
          name,
          isDefault,
          isActive,
          count: def.include.length,
          description: def.description,
          scope,
        });
      } catch {
        infos.push({ name, isDefault, isActive, count: 0, scope, error: true });
      }
    }
  }

  return { infos, warnings };
}

/**
 * Render the loadouts as a columnar table.
 */
function renderTable(infos: LoadoutInfo[], sourceChain: string[]): void {
  if (infos.length === 0) {
    log.dim("  No loadouts defined");
    return;
  }

  // Check if any loadout has a description
  const hasDescriptions = infos.some(i => i.description);

  // Calculate column widths - list has a default marker column
  const listItems = infos.map(i => ({ loadoutName: i.name, scope: i.scope, isDefault: i.isDefault }));
  const { nameWidth, scopeWidth, totalWidth: loadoutColWidth } = 
    calculateLoadoutColumnWidths(listItems, { hasDefaultMarker: true });
  
  const itemsWidth = 5; // "items" header

  // ── Header ───────────────────────────────────────────────────────────────
  const loadoutH = renderLoadoutHeader(loadoutColWidth);
  const itemsH = chalk.dim("items".padStart(itemsWidth));
  const descH = hasDescriptions ? "  " + chalk.dim("description") : "";
  
  console.log(`  ${loadoutH}  ${itemsH}${descH}`);

  // ── Separator ─────────────────────────────────────────────────────────────
  const sep = [
    renderLoadoutSeparator(loadoutColWidth),
    "─".repeat(itemsWidth),
    ...(hasDescriptions ? ["─".repeat(30)] : []),
  ].join("  ");
  console.log(chalk.dim(`  ${sep}`));

  // ── Rows ──────────────────────────────────────────────────────────────────
  for (const info of infos) {
    const item = { loadoutName: info.name, scope: info.scope, isDefault: info.isDefault };
    const loadoutCell = renderLoadoutCellWithDefault(
      item,
      info.isActive,
      nameWidth,
      scopeWidth,
      loadoutColWidth
    );

    if (info.error) {
      console.log(`  ${loadoutCell}  ${chalk.red("error")}`);
      continue;
    }
    
    const itemsCol = chalk.cyan(String(info.count).padStart(itemsWidth));
    const descCol = hasDescriptions && info.description 
      ? "  " + chalk.dim(info.description) 
      : "";

    console.log(`  ${loadoutCell}  ${itemsCol}${descCol}`);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  console.log();
  
  // Legend for markers
  const activeLegend = `${chalk.green("▸")} active`;
  const defaultLegend = `${chalk.cyan("*")} default`;
  console.log(`  ${activeLegend}  ${defaultLegend}`);

  // Scope legend
  renderScopeLegend(infos);

  // Source chain (if any external sources)
  if (sourceChain.length > 0) {
    console.log(chalk.dim(`  sources: ${sourceChain.join(" → ")}`));
  }
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List available loadouts")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .option(...SCOPE_FLAGS.all)
  .action(async (options: ScopeFlags) => {
    const cwd = process.cwd();
    const scopes = await resolveScopes(options, cwd);

    const allInfos: LoadoutInfo[] = [];
    const allWarnings: string[] = [];
    const sourceChain: string[] = [];

    // Collect from project scope
    if (scopes.includes("project")) {
      const projectRoot = await findNearestLoadoutRoot(cwd);
      if (projectRoot) {
        const state = loadState(projectRoot.path);
        const activeNames = new Set(state?.active || []);
        // Each scope gets its own seenNames - no cross-scope deduplication
        const seenNames = new Set<string>();
        const { infos, warnings } = collectLoadoutsFromRoot(
          projectRoot, 
          activeNames, 
          seenNames, 
          sourceChain,
          false  // Don't include bundled for project scope
        );
        allInfos.push(...infos);
        allWarnings.push(...warnings);
      }
    }

    // Collect from global scope (independent from project)
    if (scopes.includes("global")) {
      const globalRoot = getGlobalRoot();
      if (globalRoot) {
        const state = loadState(globalRoot.path);
        const activeNames = new Set(state?.active || []);
        // Each scope gets its own seenNames - no cross-scope deduplication
        const seenNames = new Set<string>();
        const { infos, warnings } = collectLoadoutsFromRoot(
          globalRoot, 
          activeNames, 
          seenNames, 
          sourceChain,
          true  // Include bundled for global scope
        );
        allInfos.push(...infos);
        allWarnings.push(...warnings);
      }
    }

    if (allInfos.length === 0 && allWarnings.length === 0) {
      log.error("No loadout directories found.");
      log.dim("Run 'loadout init' or 'loadout init --global' to get started.");
      return;
    }

    // Build title based on scopes
    let title: string;
    if (scopes.length === 1) {
      title = scopes[0] === "project" ? "Project loadouts" : "Global loadouts";
    } else {
      title = "Available loadouts";
    }
    heading(title);

    renderTable(allInfos, sourceChain);

    // Show warnings
    if (allWarnings.length > 0) {
      console.log();
      for (const w of allWarnings) {
        log.warn(w);
      }
    }
  });
