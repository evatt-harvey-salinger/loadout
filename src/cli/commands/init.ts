/**
 * loadout init — Initialize a loadout.
 *
 * Scope:
 *   -l / --local   → init in current directory (default)
 *   -g / --global  → init at ~/.config/loadout
 *
 * Unlike other commands, init defaults to local (most common use case).
 */

import { Command } from "commander";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "yaml";
import { ensureDir, writeFile, fileExists } from "../../lib/fs.js";
import { writeFallbackScripts, ENVRC_LINES } from "../../core/fallback.js";
import { getContext, getGlobalConfigPath } from "../../core/discovery.js";
import { loadResolvedLoadout } from "../../core/resolve.js";
import { planRender, applyPlan } from "../../core/render.js";
import { log, heading, list } from "../../lib/output.js";
import type { RootConfig, Scope } from "../../core/types.js";

async function initLoadout(
  scope: Scope,
  options: { force?: boolean }
): Promise<void> {
  const loadoutPath =
    scope === "global"
      ? getGlobalConfigPath()
      : path.join(process.cwd(), ".loadout");

  const scopeLabel = scope === "global" ? "global" : "project";

  if (fileExists(loadoutPath) && !options.force) {
    log.error(
      `${scopeLabel === "global" ? "~/.config/loadout" : ".loadout/"} already exists. Use --force to reinitialize.`
    );
    process.exit(1);
  }

  // Create directory structure
  ensureDir(path.join(loadoutPath, "rules"));
  ensureDir(path.join(loadoutPath, "skills"));
  ensureDir(path.join(loadoutPath, "loadouts"));

  // Create root config
  const rootConfig: RootConfig = {
    version: "1",
  };
  writeFile(
    path.join(loadoutPath, "loadout.yaml"),
    yaml.stringify(rootConfig)
  );

  // Create base loadout
  const defaultLoadout = {
    name: "base",
    description: `Base ${scopeLabel} loadout`,
    include: [] as string[],
  };
  writeFile(
    path.join(loadoutPath, "loadouts", "base.yaml"),
    yaml.stringify(defaultLoadout)
  );

  // Create placeholder AGENTS.md (project only)
  if (scope === "project") {
    const agentsContent = `# Project Instructions

> Edit this file to provide always-on instructions for AI coding agents.

## Quick Reference

- Build: \`npm run build\`
- Test: \`npm test\`

## Guidelines

Add your project-specific guidelines here.
`;
    writeFile(path.join(loadoutPath, "AGENTS.md"), agentsContent);

    // Create fallback scripts and git hooks
    writeFallbackScripts(loadoutPath);

    // Append to .envrc for direnv users
    const projectRoot = process.cwd();
    const envrcPath = path.join(projectRoot, ".envrc");
    
    if (fileExists(envrcPath)) {
      const existingContent = await import("node:fs").then(fs => fs.readFileSync(envrcPath, "utf-8"));
      if (!existingContent.includes("sync-fallback.sh")) {
        writeFile(envrcPath, existingContent + ENVRC_LINES);
      }
    } else {
      writeFile(envrcPath, ENVRC_LINES.trim() + "\n");
    }
  }

  const displayPath = scope === "global" ? "~/.config/loadout" : ".loadout/";
  heading(`Initialized ${displayPath}`);
  log.success(`Created ${displayPath}loadout.yaml`);
  log.success(`Created ${displayPath}loadouts/base.yaml`);
  if (scope === "project") {
    log.success(`Created ${displayPath}AGENTS.md`);
  }
  log.success(`Created ${displayPath}rules/`);
  log.success(`Created ${displayPath}skills/`);
  if (scope === "project") {
    log.success(`Created ${displayPath}sync-fallback.sh`);
    log.success(`Created ${displayPath}hooks/ (git hooks)`);
    log.success(`Updated .envrc (direnv integration)`);
  }
  console.log();

  // Auto-apply the base loadout
  log.info("Applying base loadout...");
  try {
    const cwd = scope === "global" ? os.homedir() : process.cwd();
    const ctx = await getContext(scope, cwd);
    const { loadout, rootConfig: resolvedRootConfig } = await loadResolvedLoadout(ctx, "base");
    const plan = await planRender(loadout, ctx.projectRoot, ctx.scope);

    if (plan.errors.length > 0) {
      log.warn("Could not apply loadout:");
      list(plan.errors);
    } else {
      await applyPlan(plan, loadout, ctx.projectRoot, resolvedRootConfig.mode, ctx.scope);
      log.success(`${plan.outputs.length} outputs written`);

      if (plan.shadowed.length > 0) {
        console.log();
        log.warn(`${plan.shadowed.length} outputs shadowed by existing unmanaged files:`);
        for (const s of plan.shadowed) {
          log.dim(`  ${s.targetPath}  (${s.tool})`);
        }
        log.dim("These take precedence. Import them to bring under loadout management.");
      }
    }
  } catch (err) {
    log.warn(`Auto-apply failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log();
  log.info("Next steps:");
  if (scope === "project") {
    log.dim("  • Edit .loadout/AGENTS.md with your project instructions");
    log.dim("  • Add rules with: loadout rule add <name>");
    log.dim("  • Run 'loadout sync' to re-sync after changes");
    console.log();
    log.info("Team setup (choose one):");
    log.dim("  • Git hooks: git config core.hooksPath .loadout/hooks");
    log.dim("  • Direnv:    direnv allow");
  } else {
    log.dim("  • Add rules with: loadout rule add <name> -g");
    log.dim("  • Add skills with: loadout skill add <name> -g");
    log.dim("  • Run 'loadout sync -g' to re-sync after changes");
  }
}

export const initCommand = new Command("init")
  .description("Initialize a loadout")
  .option("-l, --local", "Initialize in current directory (default)")
  .option("-g, --global", "Initialize at ~/.config/loadout")
  .option("--force", "Overwrite existing loadout")
  .action(async (options: { local?: boolean; global?: boolean; force?: boolean }) => {
    // Require explicit scope or default to local
    const scope: Scope = options.global ? "global" : "project";
    await initLoadout(scope, options);
  });
