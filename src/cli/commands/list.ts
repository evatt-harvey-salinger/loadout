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
import { resolveScopes, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import { fileExists } from "../../lib/fs.js";
import { log, heading } from "../../lib/output.js";
import type { LoadoutRoot } from "../../core/types.js";
import chalk from "chalk";

interface LoadoutInfo {
  name: string;
  isDefault: boolean;
  count: number;
  extends?: string;
  description?: string;
  source?: string;  // Which root this loadout comes from
  error?: boolean;
}

/**
 * Collect loadouts from all roots (local + sources + global).
 * Returns loadouts grouped with their source, and any warnings.
 */
function collectAllLoadouts(
  primaryRoot: LoadoutRoot,
  includeGlobal: boolean
): { infos: LoadoutInfo[]; warnings: string[] } {
  const { roots, warnings } = collectRootsWithSources(primaryRoot, includeGlobal);
  const infos: LoadoutInfo[] = [];
  const seenNames = new Set<string>();

  for (const root of roots) {
    const rootConfig = parseRootConfig(root.path);
    const loadoutNames = listLoadouts(root.path);

    // Determine source label
    let sourceLabel: string | undefined;
    if (root.level === "source") {
      sourceLabel = root.sourceRef || path.basename(path.dirname(root.path));
    } else if (root.level === "global") {
      sourceLabel = "global";
    }
    // level === "project" → no source label (it's local)

    for (const name of loadoutNames) {
      // Skip if we've already seen this name (nearest wins)
      if (seenNames.has(name)) continue;
      seenNames.add(name);

      const isDefault = root.level === "project" && rootConfig.default === name;
      const defPath = path.join(root.path, "loadouts", `${name}.yaml`);
      const ymlPath = path.join(root.path, "loadouts", `${name}.yml`);
      const filePath = fileExists(defPath) ? defPath : ymlPath;

      try {
        const def = parseLoadoutDefinition(filePath);
        infos.push({
          name,
          isDefault,
          count: def.include.length,
          extends: def.extends,
          description: def.description,
          source: sourceLabel,
        });
      } catch {
        infos.push({ name, isDefault, count: 0, source: sourceLabel, error: true });
      }
    }
  }

  return { infos, warnings };
}

function printLoadouts(infos: LoadoutInfo[], title: string): void {
  heading(title);

  if (infos.length === 0) {
    log.dim("  No loadouts defined");
    return;
  }

  // Compute column widths
  const nameWidth = Math.max(...infos.map(i => i.name.length), 4);
  const maxCount = Math.max(...infos.map(i => i.count));
  const countWidth = Math.max(`${maxCount} items`.length, 6);
  const sourceWidth = Math.max(...infos.map(i => (i.source || "").length), 0);

  for (const info of infos) {
    if (info.error) {
      console.log(`  ${info.name.padEnd(nameWidth)}  ${chalk.red("(error reading definition)")}`);
      continue;
    }

    const nameCol = info.name.padEnd(nameWidth);
    const itemWord = info.count === 1 ? "item" : "items";
    const countStr = `${info.count} ${itemWord}`.padEnd(countWidth);
    const marker = info.isDefault ? chalk.green(" *") : "  ";
    const extendsInfo = info.extends ? chalk.dim(` → ${info.extends}`) : "";
    const sourceInfo = info.source ? chalk.yellow(` [${info.source}]`) : "";
    const desc = info.description ? chalk.dim(`  ${info.description}`) : "";

    console.log(`  ${nameCol}${marker}  ${chalk.cyan(countStr)}${sourceInfo}${extendsInfo}${desc}`);
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

    let hasAny = false;

    for (const scope of scopes) {
      if (scope === "project") {
        const projectRoot = await findNearestLoadoutRoot(cwd);
        if (projectRoot) {
          const { infos, warnings } = collectAllLoadouts(projectRoot, false);
          printLoadouts(infos, `Project loadouts (${projectRoot.path})`);
          
          // Show source warnings
          if (warnings.length > 0) {
            console.log();
            for (const w of warnings) {
              log.warn(w);
            }
          }
          
          console.log();
          hasAny = true;
        }
      } else {
        const globalRoot = getGlobalRoot();
        if (globalRoot) {
          const { infos, warnings } = collectAllLoadouts(globalRoot, false);
          printLoadouts(infos, `Global loadouts (${globalRoot.path})`);
          
          if (warnings.length > 0) {
            console.log();
            for (const w of warnings) {
              log.warn(w);
            }
          }
          
          console.log();
          hasAny = true;
        }
      }
    }

    if (!hasAny) {
      log.error("No loadout directories found.");
      log.dim("Run 'loadout init' or 'loadout init --global' to get started.");
    }
  });
