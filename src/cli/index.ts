/**
 * CLI setup with Commander
 *
 * All commands support scope flags:
 *   -l / --local   → project scope
 *   -g / --global  → global scope
 *   -a / --all     → both scopes (default for status/list/sync/clear)
 */

import { Command, Help } from "commander";
import { initCommand } from "./commands/init.js";
import { activateCommand } from "./commands/activate.js";
import { deactivateCommand } from "./commands/deactivate.js";
import { syncCommand } from "./commands/sync.js";
import { clearCommand } from "./commands/clear.js";
import { removeCommand } from "./commands/remove.js";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { checkCommand } from "./commands/check.js";
import { statusCommand } from "./commands/status.js";
import { ruleCommand } from "./commands/rule.js";
import { skillCommand } from "./commands/skill.js";
import { instructionsCommand } from "./commands/instructions.js";
import { infoCommand } from "./commands/info.js";
import { diffCommand } from "./commands/diff.js";
import { editCommand } from "./commands/edit.js";
import { kindsCommand } from "./commands/kinds.js";
import { docsCommand } from "./commands/docs.js";
import { sanitizeCommand } from "./commands/sanitize.js";
import { fallbackCommand } from "./commands/fallback.js";

// ---------------------------------------------------------------------------
// Command groups — controls help output order and section headers
// ---------------------------------------------------------------------------
const COMMAND_GROUPS: Array<{ title: string; commands: Command[] }> = [
  {
    title: "Active Configuration",
    commands: [
      infoCommand,
      activateCommand,
      deactivateCommand,
      clearCommand,
      statusCommand,
      syncCommand,
      sanitizeCommand,
    ],
  },
  {
    title: "Loadout Management",
    commands: [
      initCommand,
      createCommand,
      editCommand,
      removeCommand,
      listCommand,
      checkCommand,
      diffCommand,
      fallbackCommand,
    ],
  },
  {
    title: "Artifact Authoring",
    commands: [
      ruleCommand,
      skillCommand,
      instructionsCommand,
      kindsCommand,
    ],
  },
  {
    title: "Help",
    commands: [
      docsCommand,
    ],
  },
];

export const cli = new Command()
  .name("loadout")
  .description("Composable configuration bundles for AI coding agents")
  .version("0.1.0");

for (const group of COMMAND_GROUPS) {
  for (const cmd of group.commands) {
    cli.addCommand(cmd);
  }
}

// ---------------------------------------------------------------------------
// Custom help formatter — renders commands in labeled sections
// ---------------------------------------------------------------------------
cli.configureHelp({
  formatHelp(cmd: Command, helper: Help): string {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = (helper.helpWidth as number) || 80;
    const indent = 2;
    const sep = 2;

    function formatItem(term: string, description: string): string {
      if (description) {
        const fullText = `${term.padEnd(termWidth + sep)}${description}`;
        return helper.wrap(fullText, helpWidth - indent, termWidth + sep);
      }
      return term;
    }

    function formatList(items: string[]): string {
      return items.join("\n").replace(/^/gm, " ".repeat(indent));
    }

    let output: string[] = [`Usage: ${helper.commandUsage(cmd)}`, ""];

    const desc = helper.commandDescription(cmd);
    if (desc) output = output.concat([helper.wrap(desc, helpWidth, 0), ""]);

    // Grouped commands — build a lookup by command name for membership
    const allGrouped = new Set(
      COMMAND_GROUPS.flatMap((g) => g.commands.map((c) => c.name()))
    );
    const visibleCmds = helper.visibleCommands(cmd);

    for (const group of COMMAND_GROUPS) {
      const groupNames = new Set(group.commands.map((c) => c.name()));
      const items = visibleCmds
        .filter((c) => groupNames.has(c.name()))
        .map((c) =>
          formatItem(
            helper.subcommandTerm(c).replace(/\s*\[options\]/, ""),
            helper.subcommandDescription(c)
          )
        );
      if (items.length > 0) {
        output = output.concat([`${group.title}:`, formatList(items), ""]);
      }
    }



    // Options (at the bottom — commands are the primary interface)
    const optionList = helper.visibleOptions(cmd).map((opt) =>
      formatItem(helper.optionTerm(opt), helper.optionDescription(opt))
    );
    if (optionList.length > 0) {
      output = output.concat(["Options:", formatList(optionList), ""]);
    }

    return output.join("\n");
  },
});
