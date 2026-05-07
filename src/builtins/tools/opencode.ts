import * as path from "node:path";
import * as os from "node:os";
import type { ToolSpec } from "../../core/registry.js";
import type { Scope, ValidationResult } from "../../core/types.js";
import { readFile, fileExists } from "../../lib/fs.js";

async function validate(scope: Scope): Promise<ValidationResult> {
  const projectRoot = scope === "global" ? os.homedir() : process.cwd();
  const configPath = path.join(projectRoot, "opencode.json");
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!fileExists(configPath)) {
    warnings.push(
      "opencode.json not found. OpenCode rules require the opencode-rules plugin."
    );
  } else {
    try {
      const config = JSON.parse(readFile(configPath));
      const hasPlugin =
        config.plugins?.includes("opencode-rules") ||
        config.plugins?.some(
          (p: unknown) =>
            typeof p === "object" &&
            p !== null &&
            (p as { name?: string }).name === "opencode-rules"
        );
      if (!hasPlugin) {
        warnings.push(
          'opencode-rules plugin not configured. Add "opencode-rules" to plugins in opencode.json.'
        );
      }
    } catch {
      warnings.push("Could not parse opencode.json to check for rules plugin.");
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}

export const opencodeTool: ToolSpec = {
  name: "opencode",
  basePath: {
    global: path.join(os.homedir(), ".config", "opencode"),
    project: ".opencode",
  },
  supports: ["rule", "skill", "instruction"],
  targets: {
    rule: { path: "{base}/rules/{stem}.md" },
    skill: { path: "{base}/skills/{name}" },
    instruction: {
      path: { project: "AGENTS.md", global: "{home}/AGENTS.md" },
    },
  },
  validate,
};
