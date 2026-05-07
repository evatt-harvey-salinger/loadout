/**
 * loadout kinds - List registered artifact kinds
 */

import { Command } from "commander";
import { registry } from "../../core/registry.js";
import { discoverLoadoutRoots } from "../../core/discovery.js";
import { loadYamlKindsFromRoots } from "../../core/kindLoader.js";
import { log, heading } from "../../lib/output.js";

export const kindsCommand = new Command("kinds")
  .description("List registered artifact kinds")
  .option("-v, --verbose", "Show detection rules and per-tool targets")
  .action(async (options) => {
    // Load project-local YAML kinds so the list reflects what's actually available.
    try {
      const roots = await discoverLoadoutRoots(process.cwd());
      loadYamlKindsFromRoots(roots);
    } catch {
      // Not inside a loadout project — built-ins only, that's fine.
    }

    const kinds = registry.allKinds();

    heading("Registered artifact kinds");
    console.log();

    for (const kind of kinds) {
      const isBuiltin = ["rule", "skill", "instruction"].includes(kind.id);
      const tag = isBuiltin ? "" : " (custom)";

      console.log(`  ${kind.id}${tag}`);
      if (kind.description) log.dim(`    ${kind.description}`);
      log.dim(`    layout: ${kind.layout}`);

      if (options.verbose) {
        // Show which tools have a mapping for this kind (either via tool.targets or kind.defaultTargets)
        const supportedTools = registry
          .allTools()
          .filter((t) => registry.resolveMapping(t.name, kind.id))
          .map((t) => t.name);

        if (supportedTools.length > 0) {
          log.dim(`    tools: ${supportedTools.join(", ")}`);
        } else {
          log.dim(`    tools: (none registered)`);
        }

        if (kind.defaultTargets && Object.keys(kind.defaultTargets).length > 0) {
          log.dim(`    defaultTargets:`);
          for (const [toolName, mapping] of Object.entries(kind.defaultTargets)) {
            const pathStr =
              typeof mapping.path === "string"
                ? mapping.path
                : `project: ${mapping.path.project}, global: ${mapping.path.global}`;
            log.dim(`      ${toolName}: ${pathStr}`);
          }
        }
      }

      console.log();
    }

    if (kinds.length === 0) {
      log.warn("No kinds registered. This shouldn't happen — check bootstrap.");
    }
  });
