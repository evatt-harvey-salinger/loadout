/**
 * Built-in plugin — registers the three core kinds, four core tools, and
 * all named transforms. Called once at CLI startup before any command runs.
 *
 * Built-ins use the same PluginAPI as external plugins; there is no
 * privileged code path.
 */

import { parseFrontmatter, serializeFrontmatter } from "../core/config.js";
import type { PluginAPI } from "../core/plugin.js";
import { ruleKind } from "./kinds/rule.js";
import { skillKind } from "./kinds/skill.js";
import { instructionKind } from "./kinds/instruction.js";
import { promptKind } from "./kinds/prompt.js";
import { extensionKind } from "./kinds/extension.js";
import { themeKind } from "./kinds/theme.js";
import { claudeCodeTool } from "./tools/claude-code.js";
import { cursorTool } from "./tools/cursor.js";
import { opencodeTool } from "./tools/opencode.js";
import { codexTool } from "./tools/codex.js";
import { piTool } from "./tools/pi.js";

/** Names of the built-in tools, for use in defaults and display. */
export const BUILTIN_TOOL_NAMES = [
  "claude-code",
  "cursor",
  "opencode",
  "codex",
  "pi",
] as const;

export type BuiltInToolName = (typeof BUILTIN_TOOL_NAMES)[number];

/**
 * Mirror Cursor's `paths` ↔ `globs` frontmatter keys so authors can use
 * either convention. Registered as the "cursor-frontmatter" transform.
 */
function mirrorPathsAndGlobs(raw: string): string {
  const { frontmatter, body } = parseFrontmatter(raw);
  if (frontmatter.paths && !frontmatter.globs) frontmatter.globs = frontmatter.paths;
  if (frontmatter.globs && !frontmatter.paths) frontmatter.paths = frontmatter.globs;
  return serializeFrontmatter(frontmatter, body);
}

/** Register all built-ins into the given PluginAPI. */
export function registerBuiltins(api: PluginAPI): void {
  // Kinds first — tools reference kind IDs in their `supports` arrays.
  api.registerKind(ruleKind);
  api.registerKind(skillKind);
  api.registerKind(instructionKind);
  api.registerKind(promptKind);
  api.registerKind(extensionKind);
  api.registerKind(themeKind);

  // Named transforms — referenced by name in tool target specs.
  api.registerTransform("cursor-frontmatter", mirrorPathsAndGlobs);

  // Tools
  api.registerTool(claudeCodeTool);
  api.registerTool(cursorTool);
  api.registerTool(opencodeTool);
  api.registerTool(codexTool);
  api.registerTool(piTool);
}
