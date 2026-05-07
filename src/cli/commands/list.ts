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
  discoverLoadoutRoots,
  getGlobalRoot,
  findNearestLoadoutRoot,
} from "../../core/discovery.js";
import {
  listLoadouts,
  parseLoadoutDefinition,
  parseRootConfig,
} from "../../core/config.js";
import { resolveScopes, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import { fileExists } from "../../lib/fs.js";
import { log, heading } from "../../lib/output.js";
import type { LoadoutRoot, Scope } from "../../core/types.js";
import chalk from "chalk";

interface LoadoutInfo {
  name: string;
  isDefault: boolean;
  count: number;
  extends?: string;
  description?: string;
  error?: boolean;
}

function printRoot(root: LoadoutRoot): void {
  const rootConfig = parseRootConfig(root.path);
  const loadoutNames = listLoadouts(root.path);

  heading(`${root.level === "global" ? "Global loadouts" : "Project loadouts"} (${root.path})`);

  if (loadoutNames.length === 0) {
    log.dim("  No loadouts defined");
    return;
  }

  // First pass: collect info and compute widths
  const infos: LoadoutInfo[] = [];
  for (const name of loadoutNames) {
    const isDefault = rootConfig.default === name;
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
      });
    } catch {
      infos.push({ name, isDefault, count: 0, error: true });
    }
  }

  // Compute column widths
  const nameWidth = Math.max(...infos.map(i => i.name.length));
  const maxCount = Math.max(...infos.map(i => i.count));
  const countWidth = `${maxCount} items`.length;

  // Second pass: print aligned
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
    const desc = info.description ? chalk.dim(`  ${info.description}`) : "";

    console.log(`  ${nameCol}${marker}  ${chalk.cyan(countStr)}${extendsInfo}${desc}`);
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
          printRoot(projectRoot);
          console.log();
          hasAny = true;
        }
      } else {
        const globalRoot = getGlobalRoot();
        if (globalRoot) {
          printRoot(globalRoot);
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
