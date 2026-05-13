/**
 * loadouts doctor — Check and repair loadout health.
 *
 * Focuses on migration drift so environments stay up to date after upgrades:
 *   - Per-target .gitignore entries for managed artifacts
 *   - .loadouts/.gitignore state paths
 *   - Legacy root .gitignore managed sections
 */

import { Command } from "commander";
import * as os from "node:os";
import * as path from "node:path";
import { findNearestLoadoutRoot, getGlobalRoot } from "../../core/discovery.js";
import { resolveScopes, SCOPE_FLAGS, type ScopeFlags } from "../../core/scope.js";
import type { Scope } from "../../core/types.js";
import {
  inspectGitignoreHealth,
  rebuildAllGitignores,
  updateLoadoutsGitignore,
  removeLegacyRootGitignoreSection,
  type GitignoreHealthReport,
} from "../../lib/gitignore.js";
import { heading, log } from "../../lib/output.js";

interface DoctorOptions extends ScopeFlags {
  check?: boolean;
  verbose?: boolean;
}

function formatScope(scope: Scope): string {
  return scope === "project" ? "project" : "global";
}

function renderHealthReport(
  scope: Scope,
  rootPath: string,
  projectRoot: string,
  report: GitignoreHealthReport,
  verbose: boolean
): void {
  const scopeLabel = formatScope(scope);

  if (report.hasLegacyRootSection) {
    const rootGitignore = path.join(projectRoot, ".gitignore");
    log.warn(`[${scopeLabel}] legacy managed section found in ${rootGitignore}`);
  }

  if (report.loadoutsStateOutOfDate) {
    log.warn(`[${scopeLabel}] ${path.join(rootPath, ".gitignore")} is missing required state entries`);
  }

  if (report.targetMismatches.length > 0) {
    log.warn(
      `[${scopeLabel}] ${report.targetMismatches.length} target .gitignore file(s) out of date`
    );

    if (verbose) {
      for (const mismatch of report.targetMismatches) {
        log.dim(
          `  ${mismatch.targetDir}: expected ${mismatch.expectedPaths.length}, found ${mismatch.actualPaths.length}`
        );
      }
    }
  }
}

async function resolveRootInfo(
  scope: Scope,
  cwd: string
): Promise<{ rootPath: string; projectRoot: string } | null> {
  if (scope === "project") {
    const root = await findNearestLoadoutRoot(cwd);
    if (!root) return null;
    return { rootPath: root.path, projectRoot: path.dirname(root.path) };
  }

  const root = getGlobalRoot();
  if (!root) return null;
  return { rootPath: root.path, projectRoot: os.homedir() };
}

export const doctorCommand = new Command("doctor")
  .description("Check and repair loadout health (migrations, gitignore drift)")
  .option(...SCOPE_FLAGS.local)
  .option(...SCOPE_FLAGS.global)
  .option(...SCOPE_FLAGS.all)
  .option("--check", "Check only (do not modify files)")
  .option("-v, --verbose", "Show detailed diagnostics")
  .action(async (options: DoctorOptions) => {
    const cwd = process.cwd();
    const scopes = await resolveScopes(options, cwd);

    heading("Loadout doctor");
    console.log();

    let initialIssues = 0;
    let remainingIssues = 0;

    for (const scope of scopes) {
      const info = await resolveRootInfo(scope, cwd);
      if (!info) continue;

      const before = inspectGitignoreHealth(info.rootPath, info.projectRoot, scope);
      initialIssues += before.issues;

      if (before.issues === 0) {
        log.success(`[${formatScope(scope)}] healthy`);
        continue;
      }

      renderHealthReport(scope, info.rootPath, info.projectRoot, before, !!options.verbose);

      if (options.check) {
        remainingIssues += before.issues;
        continue;
      }

      rebuildAllGitignores(info.rootPath, info.projectRoot, scope);
      updateLoadoutsGitignore(info.rootPath);
      removeLegacyRootGitignoreSection(info.projectRoot);

      const after = inspectGitignoreHealth(info.rootPath, info.projectRoot, scope);
      remainingIssues += after.issues;

      if (after.issues === 0) {
        log.success(`[${formatScope(scope)}] repaired`);
      } else {
        log.warn(`[${formatScope(scope)}] repairs incomplete`);
        renderHealthReport(scope, info.rootPath, info.projectRoot, after, true);
      }
    }

    console.log();
    if (options.check) {
      if (initialIssues > 0) {
        log.warn(`Found ${initialIssues} issue(s)`);
        process.exit(1);
      }
      log.success("All checked scopes are healthy");
      return;
    }

    if (initialIssues === 0) {
      log.success("All checked scopes are already healthy");
      return;
    }

    if (remainingIssues > 0) {
      log.warn(`Repaired ${initialIssues - remainingIssues} issue(s); ${remainingIssues} remain`);
      process.exit(1);
    }

    log.success(`Repaired ${initialIssues} issue(s)`);
  });
