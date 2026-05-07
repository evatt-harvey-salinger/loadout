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
import type { LoadoutRoot } from "../../core/types.js";
import chalk from "chalk";

interface LoadoutInfo {
  name: string;
  isDefault: boolean;
  isActive: boolean;
  count: number;
  description?: string;
  source: string;
  error?: boolean;
}

/**
 * Truncate a path with leading ellipsis if too long.
 */
function truncateSource(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return "…" + str.slice(-(maxLen - 1));
}

/**
 * Collect loadouts from a root and its sources.
 */
function collectLoadoutsFromRoot(
  primaryRoot: LoadoutRoot,
  activeNames: Set<string>,
  seenNames: Set<string>,
  sourceChain: string[]
): { infos: LoadoutInfo[]; warnings: string[] } {
  const { roots, warnings } = collectRootsWithSources(primaryRoot, false);
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

    // Determine source label
    let sourceLabel: string;
    if (root.level === "source") {
      sourceLabel = root.sourceRef || path.basename(path.dirname(root.path));
    } else if (root.level === "global") {
      sourceLabel = "global";
    } else {
      sourceLabel = "local";
    }

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
          source: sourceLabel,
        });
      } catch {
        infos.push({ name, isDefault, isActive, count: 0, source: sourceLabel, error: true });
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

  // Calculate column widths
  const nameWidth = Math.max(...infos.map(i => i.name.length), "loadout".length);
  const sourceMaxWidth = 20;
  const sourceWidth = Math.min(
    Math.max(...infos.map(i => (i.source || "").length), "source".length),
    sourceMaxWidth
  );
  const itemsWidth = 5; // "items" header

  // Render header
  const nameH = chalk.dim("loadout".padEnd(nameWidth));
  const sourceH = chalk.dim("source".padEnd(sourceWidth));
  const itemsH = chalk.dim("items".padStart(itemsWidth));
  const descH = hasDescriptions ? "  " + chalk.dim("description") : "";
  
  console.log(`    ${nameH}     ${sourceH}  ${itemsH}${descH}`);

  // Render separator
  const sep = chalk.dim(
    `    ${"─".repeat(nameWidth)}     ${"─".repeat(sourceWidth)}  ${"─".repeat(itemsWidth)}` +
    (hasDescriptions ? `  ${"─".repeat(30)}` : "")
  );
  console.log(sep);

  // Render rows
  for (const info of infos) {
    if (info.error) {
      const activeMarker = info.isActive ? chalk.green("▸") : " ";
      const defaultMarker = info.isDefault ? chalk.cyan("*") : " ";
      console.log(`  ${activeMarker} ${info.name.padEnd(nameWidth)} ${defaultMarker}   ${chalk.red("(error reading definition)")}`);
      continue;
    }

    const activeMarker = info.isActive ? chalk.green("▸") : " ";
    const defaultMarker = info.isDefault ? chalk.cyan("*") : " ";
    const nameCol = info.name.padEnd(nameWidth);
    const sourceCol = truncateSource(info.source || "", sourceMaxWidth).padEnd(sourceWidth);
    const itemsCol = String(info.count).padStart(itemsWidth);
    const descCol = hasDescriptions && info.description 
      ? "  " + chalk.dim(info.description) 
      : "";

    console.log(`  ${activeMarker} ${nameCol} ${defaultMarker}   ${chalk.yellow(sourceCol)}  ${chalk.cyan(itemsCol)}${descCol}`);
  }

  // Footer: show legend and source chain
  console.log();
  
  const legendParts: string[] = [];
  if (infos.some(i => i.isActive)) {
    legendParts.push(`${chalk.green("▸")} active`);
  }
  if (infos.some(i => i.isDefault)) {
    legendParts.push(`${chalk.cyan("*")} default`);
  }
  if (legendParts.length > 0) {
    console.log(chalk.dim(`  ${legendParts.join("  ")}`));
  }

  if (sourceChain.length > 0) {
    console.log(chalk.dim(`  sources: ${sourceChain.join(" → ")}`));
  }
}

export const listCommand = new Command("list")
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
          sourceChain
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
          sourceChain
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
