import { Command } from "commander";
import { createRequire } from "module";
import { execSync } from "child_process";
import { heading, log } from "../../lib/output.js";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json");

export const updateCommand = new Command("update")
  .description("Update loadout to the latest version")
  .option("--check", "Check for updates without installing")
  .action(async (opts) => {
    heading("Update");

    const currentVersion = pkg.version;
    log.info(`Current version: ${currentVersion}`);

    // Fetch latest version from npm
    let latestVersion: string;
    try {
      latestVersion = execSync(`npm view ${pkg.name} version`, {
        encoding: "utf-8",
      }).trim();
    } catch {
      log.error("Failed to check for updates. Are you online?");
      process.exit(1);
    }

    if (currentVersion === latestVersion) {
      log.success(`Already on latest version (${currentVersion})`);
      return;
    }

    log.info(`Latest version:  ${latestVersion}`);

    if (opts.check) {
      log.plain(`\nRun 'loadout update' to install the update.`);
      return;
    }

    // Perform the update
    log.info(`\nUpdating ${currentVersion} → ${latestVersion}...`);
    try {
      execSync(`npm install -g ${pkg.name}@latest`, {
        stdio: "inherit",
      });
      log.success(`Updated to ${latestVersion}`);
    } catch {
      log.error("Update failed. Try running manually:");
      log.plain(`  npm install -g ${pkg.name}@latest`);
      process.exit(1);
    }
  });
