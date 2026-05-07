/**
 * loadout fallback — Regenerate fallback sync scripts.
 *
 * Updates .loadout/sync-fallback.sh and git hooks to the latest version.
 * Run this after upgrading loadout to get improvements to the fallback logic.
 */

import { Command } from "commander";
import * as path from "node:path";
import { fileExists } from "../../lib/fs.js";
import { writeFallbackScript, writeGitHooks } from "../../core/fallback.js";
import { findGitRoot } from "../../lib/git.js";
import { log } from "../../lib/output.js";

export const fallbackCommand = new Command("fallback")
  .description("Regenerate fallback sync scripts (.loadout/sync-fallback.sh and hooks)")
  .action(async () => {
    const loadoutPath = path.join(process.cwd(), ".loadout");

    if (!fileExists(loadoutPath)) {
      log.error("No .loadout/ directory found. Run 'loadout init' first.");
      process.exit(1);
    }

    writeFallbackScript(loadoutPath);
    log.success("Updated .loadout/sync-fallback.sh");

    // Only update git hooks if at git root
    const gitRoot = await findGitRoot(process.cwd());
    const isAtGitRoot = gitRoot === process.cwd();
    
    if (isAtGitRoot) {
      writeGitHooks(loadoutPath);
      log.success("Updated .loadout/hooks/post-checkout");
      log.success("Updated .loadout/hooks/post-merge");
    } else {
      log.dim("Skipped git hooks (subproject - use direnv instead)");
    }
  });
