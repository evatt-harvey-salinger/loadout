/**
 * loadout docs — Display documentation.
 *
 * Opens the documentation in a pager or prints to stdout.
 */

import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the docs file. Tries multiple locations:
 * 1. Relative to the CLI source (development)
 * 2. Relative to the installed package (production)
 */
function findDocsPath(): string | null {
  const candidates = [
    // Development: relative to src/cli/commands/
    path.resolve(__dirname, "../../../docs/LOADOUT.md"),
    // Production: relative to dist/cli/commands/
    path.resolve(__dirname, "../../../docs/LOADOUT.md"),
    // Fallback: look in package root
    path.resolve(__dirname, "../../docs/LOADOUT.md"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export const docsCommand = new Command("docs")
  .description("Display documentation")
  .option("--raw", "Print raw markdown without pager")
  .action(async (options: { raw?: boolean }) => {
    const docsPath = findDocsPath();

    if (!docsPath) {
      console.error("Documentation file not found.");
      console.error("Visit: https://github.com/your-repo/loadout");
      process.exit(1);
    }

    const content = fs.readFileSync(docsPath, "utf-8");

    if (options.raw || !process.stdout.isTTY) {
      // Print directly if --raw or piped
      console.log(content);
      return;
    }

    // Use less or more as pager
    const pager = process.env.PAGER || "less";
    const pagerArgs = pager === "less" ? ["-R"] : [];

    const child = spawn(pager, pagerArgs, {
      stdio: ["pipe", "inherit", "inherit"],
    });

    child.stdin.write(content);
    child.stdin.end();

    child.on("error", () => {
      // Pager not found, print directly
      console.log(content);
    });
  });
