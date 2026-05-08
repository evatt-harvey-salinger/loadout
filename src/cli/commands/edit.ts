/**
 * loadout edit — Open a loadout definition in $EDITOR.
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   (none)         → auto-detect; error if name exists in both without flag
 */

import { Command } from "commander";
import * as path from "node:path";
import {
  requireScopeForName,
  SCOPE_FLAGS,
  type ScopeFlags,
} from "../../core/scope.js";
import { findNearestLoadoutRoot, getGlobalRoot } from "../../core/discovery.js";
import { fileExists } from "../../lib/fs.js";
import { log } from "../../lib/output.js";
import { openInEditor } from "../../lib/editor.js";

const LOADOUTS_DIR = "loadouts";

/**
 * Find the loadout definition file path for a given name and scope.
 */
function findLoadoutPath(loadoutRoot: string, name: string): string | null {
  const yamlPath = path.join(loadoutRoot, LOADOUTS_DIR, `${name}.yaml`);
  const ymlPath = path.join(loadoutRoot, LOADOUTS_DIR, `${name}.yml`);

  if (fileExists(yamlPath)) return yamlPath;
  if (fileExists(ymlPath)) return ymlPath;
  return null;
}

export const editCommand = new Command("edit")
  .description("Open a loadout definition in $EDITOR")
  .argument("<name>", "Loadout name to edit")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .action(async (name: string, options: ScopeFlags) => {
    const cwd = process.cwd();

    try {
      // Resolve scope — throws if ambiguous or not found
      const scope = await requireScopeForName(name, options, cwd);

      // Get the loadout root for the resolved scope
      let loadoutRoot: string;
      if (scope === "global") {
        const globalRoot = getGlobalRoot();
        if (!globalRoot) {
          log.error("No global loadout found at ~/.config/loadouts");
          process.exit(1);
        }
        loadoutRoot = globalRoot.path;
      } else {
        const projectRoot = await findNearestLoadoutRoot(cwd);
        if (!projectRoot) {
          log.error("Not in a loadout project. Run 'loadouts init' first.");
          process.exit(1);
        }
        loadoutRoot = projectRoot.path;
      }

      // Find the loadout definition file
      const filePath = findLoadoutPath(loadoutRoot, name);
      if (!filePath) {
        log.error(`Loadout '${name}' not found in ${scope} scope.`);
        process.exit(1);
      }

      // Open in editor from the loadout root directory
      await openInEditor(filePath, { cwd: loadoutRoot });
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
