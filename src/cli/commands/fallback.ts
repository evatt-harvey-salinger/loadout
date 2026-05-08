/**
 * loadout fallback — Regenerate fallback sync scripts.
 *
 * Updates .loadouts/sync-fallback.sh and git hooks to the latest version.
 * Run this after upgrading loadout to get improvements to the fallback logic.
 */

import { Command } from "commander";
import * as path from "node:path";
import { fileExists } from "../../lib/fs.js";
import { writeFallbackScript, writeGitHooks } from "../../core/fallback.js";
import { findGitRoot } from "../../lib/git.js";
import { log } from "../../lib/output.js";

export const fallbackCommand = new Command("fallback")
  .description("Regenerate fallback sync scripts (.loadouts/sync-fallback.sh and hooks)")
  .action(async () => {
    const loadoutPath = path.join(process.cwd(), ".loadouts");

    if (!fileExists(loadoutPath)) {
      log.error("No .loadouts/ directory found. Run 'loadouts init' first.");
      process.exit(1);
    }

    writeFallbackScript(loadoutPath);
    log.success("Updated .loadouts/sync-fallback.sh");

    // Only update git hooks if at git root
    const gitRoot = await findGitRoot(process.cwd());
    const isAtGitRoot = gitRoot === process.cwd();
    
    if (isAtGitRoot) {
      writeGitHooks(loadoutPath);
      log.success("Updated .loadouts/hooks/post-checkout");
      log.success("Updated .loadouts/hooks/post-merge");
    } else {
      log.dim("Skipped git hooks (subproject - use direnv instead)");
    }
  });
