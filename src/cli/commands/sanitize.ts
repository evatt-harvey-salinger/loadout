/**
 * loadout sanitize — Sanitize artifacts for cross-tool compatibility.
 *
 * Currently sanitizes:
 *   - Rule frontmatter: ensures both `paths` and `globs` are present
 *
 * Scope flags:
 *   -l / --local   → project scope only
 *   -g / --global  → global scope only
 *   -a / --all     → both scopes (default)
 */

import { Command } from "commander";
import * as path from "node:path";
import { resolveContexts, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import { findUnsanitizedRules, sanitizeRuleFile } from "../../core/config.js";
import { listFiles, isDirectory } from "../../lib/fs.js";
import { log, heading } from "../../lib/output.js";

interface SanitizeOptions extends ScopeFlags {
  dryRun?: boolean;
}

export const sanitizeCommand = new Command("sanitize")
  .description("Sanitize artifacts for cross-tool compatibility")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .option(...SCOPE_FLAGS.all)
  .option("--dry-run", "Show what would be sanitized without modifying files")
  .action(async (options: SanitizeOptions) => {
    const { contexts } = await resolveContexts(options);

    let totalFixed = 0;
    let totalSkipped = 0;

    for (const ctx of contexts) {
      const label = ctx.scope === "global" ? "Global" : "Project";
      const unsanitized = findUnsanitizedRules(ctx.configPath);

      if (unsanitized.length === 0) {
        log.dim(`[${ctx.scope}] All rules are already sanitized`);
        continue;
      }

      heading(`${label} rules needing sanitization`);

      for (const name of unsanitized) {
        const rulePath = path.join(ctx.configPath, "rules", `${name}.md`);

        if (options.dryRun) {
          log.dim(`  Would sanitize: ${name}`);
          totalSkipped++;
        } else {
          sanitizeRuleFile(rulePath);
          log.success(`  Sanitized: ${name}`);
          totalFixed++;
        }
      }

      console.log();
    }

    if (options.dryRun) {
      if (totalSkipped > 0) {
        log.info(`${totalSkipped} rule(s) would be sanitized. Run without --dry-run to apply.`);
      }
    } else if (totalFixed > 0) {
      log.success(`Sanitized ${totalFixed} rule(s)`);
      log.dim("Run 'loadout sync' to apply changes to tool directories.");
    } else {
      log.success("All artifacts are already sanitized");
    }
  });
