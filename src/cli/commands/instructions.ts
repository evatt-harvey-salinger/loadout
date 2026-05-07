/**
 * loadout instructions - Manage AGENTS.md
 */

import { Command } from "commander";
import * as path from "node:path";
import { findNearestLoadoutRoot, getProjectRoot } from "../../core/discovery.js";
import { writeFile, readFile, fileExists, removeFile, copyFile } from "../../lib/fs.js";
import { log } from "../../lib/output.js";
import { spawn } from "node:child_process";

const INSTRUCTIONS_FILE = "AGENTS.md";

export const instructionsCommand = new Command("instructions").description(
  "Manage project instructions (AGENTS.md)"
);

// loadout instructions init
instructionsCommand
  .command("init")
  .description("Create AGENTS.md if it doesn't exist")
  .option("-f, --force", "Overwrite existing file")
  .action(async (options) => {
    const nearestRoot = await findNearestLoadoutRoot(process.cwd());

    if (!nearestRoot) {
      log.error("No .loadout/ directory found. Run 'loadout init' first.");
      process.exit(1);
    }

    const filePath = path.join(nearestRoot.path, INSTRUCTIONS_FILE);

    if (fileExists(filePath) && !options.force) {
      log.warn(`AGENTS.md already exists: ${filePath}`);
      log.dim("Edit it with: loadout instructions edit");
      log.dim("Or overwrite with: loadout instructions init --force");
      process.exit(1);
    }

    const content = `# Project Instructions

> These instructions are always included for AI coding agents.

## Quick Reference

- Build: \`npm run build\`
- Test: \`npm test\`
- Lint: \`npm run lint\`

## Project Overview

Describe your project here.

## Guidelines

### Code Style

- Prefer descriptive names over comments
- Keep functions small and focused
- Write tests for new functionality

### Architecture

Describe key architectural decisions.

## Done Means

When completing a task:

- [ ] Code compiles without errors
- [ ] Tests pass
- [ ] No lint warnings
- [ ] Changes are documented if needed
`;

    writeFile(filePath, content);
    log.success(`Created: ${filePath}`);
    log.info("Edit with: loadout instructions edit");
  });

// loadout instructions edit
instructionsCommand
  .command("edit")
  .description("Edit AGENTS.md in $EDITOR")
  .action(async () => {
    const nearestRoot = await findNearestLoadoutRoot(process.cwd());

    if (!nearestRoot) {
      log.error("No .loadout/ directory found.");
      process.exit(1);
    }

    const filePath = path.join(nearestRoot.path, INSTRUCTIONS_FILE);

    if (!fileExists(filePath)) {
      log.error("AGENTS.md not found. Run 'loadout instructions init' first.");
      process.exit(1);
    }

    const editor = process.env.EDITOR || "vim";

    const child = spawn(editor, [filePath], {
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        log.success("Edited AGENTS.md");
      }
    });
  });

// loadout instructions import [path]
instructionsCommand
  .command("import")
  .description("Import an existing instruction file into loadout")
  .argument("[path]", "Path to existing file (defaults to ./AGENTS.md or ./CLAUDE.md)")
  .option("--keep", "Keep original file (don't delete after import)")
  .option("-f, --force", "Overwrite existing .loadout/AGENTS.md")
  .action(async (filePath, options) => {
    const cwd = process.cwd();
    const projectRoot = await getProjectRoot(cwd);
    const nearestRoot = await findNearestLoadoutRoot(cwd);

    if (!nearestRoot) {
      log.error("No .loadout/ directory found. Run 'loadout init' first.");
      process.exit(1);
    }

    // Auto-detect source if not provided
    let sourcePath: string;
    if (filePath) {
      sourcePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(cwd, filePath);
    } else {
      // Try AGENTS.md first, then CLAUDE.md
      const agentsPath = path.join(projectRoot, "AGENTS.md");
      const claudePath = path.join(projectRoot, "CLAUDE.md");

      if (fileExists(agentsPath)) {
        sourcePath = agentsPath;
      } else if (fileExists(claudePath)) {
        sourcePath = claudePath;
      } else {
        log.error("No AGENTS.md or CLAUDE.md found in project root.");
        log.dim("Specify a path: loadout instructions install <path>");
        process.exit(1);
      }
    }

    if (!fileExists(sourcePath)) {
      log.error(`File not found: ${sourcePath}`);
      process.exit(1);
    }

    const destPath = path.join(nearestRoot.path, INSTRUCTIONS_FILE);

    if (fileExists(destPath) && !options.force) {
      log.error("AGENTS.md already exists in .loadout/");
      log.dim("Use --force to overwrite it with the imported file.");
      process.exit(1);
    }

    // Copy the file
    copyFile(sourcePath, destPath);

    // Remove original if not --keep
    if (!options.keep) {
      removeFile(sourcePath);
      log.dim(`Removed original: ${sourcePath}`);
    }

    log.success("Imported instructions");
    log.dim(`  ${destPath}`);
    log.info("Run 'loadout apply' to link outputs.");
  });
