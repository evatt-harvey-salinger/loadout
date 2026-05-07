/**
 * Parse source configs and loadout definitions
 */

import * as path from "node:path";
import * as yaml from "yaml";
import { readFile, writeFile, fileExists, isDirectory, listFiles } from "../lib/fs.js";
import {
  RootConfigSchema,
  LoadoutDefinitionSchema,
  RuleFrontmatterSchema,
  type RuleFrontmatter,
} from "./schema.js";
import type {
  RootConfig,
  LoadoutDefinition,
  LoadoutRoot,
} from "./types.js";

const ROOT_CONFIG_FILE = "loadout.yaml";
const LOADOUTS_DIR = "loadouts";

/**
 * Parse the root config from a .loadout/ directory.
 * Returns default config if file doesn't exist.
 */
export function parseRootConfig(loadoutRoot: string): RootConfig {
  const configPath = path.join(loadoutRoot, ROOT_CONFIG_FILE);

  if (!fileExists(configPath)) {
    return { version: "1" };
  }

  const content = readFile(configPath);
  const parsed = yaml.parse(content);
  return RootConfigSchema.parse(parsed);
}

/**
 * Parse a loadout definition file.
 */
export function parseLoadoutDefinition(filePath: string): LoadoutDefinition {
  const content = readFile(filePath);
  const parsed = yaml.parse(content);
  return LoadoutDefinitionSchema.parse(parsed);
}

/**
 * List available loadouts in a .loadout/ directory.
 */
export function listLoadouts(loadoutRoot: string): string[] {
  const loadoutsDir = path.join(loadoutRoot, LOADOUTS_DIR);

  if (!isDirectory(loadoutsDir)) {
    return [];
  }

  return listFiles(loadoutsDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => f.replace(/\.ya?ml$/, ""));
}

/**
 * Find a loadout definition by name, searching from nearest root upward.
 */
export function findLoadoutDefinition(
  name: string,
  roots: LoadoutRoot[]
): { definition: LoadoutDefinition; rootPath: string } | null {
  for (const root of roots) {
    const yamlPath = path.join(root.path, LOADOUTS_DIR, `${name}.yaml`);
    const ymlPath = path.join(root.path, LOADOUTS_DIR, `${name}.yml`);

    const filePath = fileExists(yamlPath)
      ? yamlPath
      : fileExists(ymlPath)
        ? ymlPath
        : null;

    if (filePath) {
      return {
        definition: parseLoadoutDefinition(filePath),
        rootPath: root.path,
      };
    }
  }

  return null;
}

/**
 * Parse frontmatter from a markdown file.
 * Returns the frontmatter object and the body content.
 */
export function parseFrontmatter(content: string): {
  frontmatter: RuleFrontmatter;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, frontmatterStr, body] = match;
  const parsed = yaml.parse(frontmatterStr) || {};
  const frontmatter = RuleFrontmatterSchema.parse(parsed);

  return { frontmatter, body };
}

/**
 * Serialize frontmatter and body back to markdown.
 */
export function serializeFrontmatter(
  frontmatter: RuleFrontmatter,
  body: string
): string {
  if (Object.keys(frontmatter).length === 0) {
    return body;
  }

  const frontmatterStr = yaml.stringify(frontmatter).trim();
  return `---\n${frontmatterStr}\n---\n${body}`;
}

/**
 * Sanitize rule frontmatter for maximum cross-tool compatibility.
 * 
 * Required fields for portability:
 * - `description` - Cursor "Apply Intelligently" routing
 * - `paths` - Claude Code file scoping
 * - `globs` - Cursor/OpenCode file scoping
 * 
 * If paths/globs are set, ensures both are present and equal.
 * If description is missing and we have a rule name, generates one.
 */
export function sanitizeRuleFrontmatter(
  frontmatter: RuleFrontmatter,
  ruleName?: string
): RuleFrontmatter {
  const result = { ...frontmatter };

  // Mirror paths <-> globs for Cursor/OpenCode compatibility
  if (result.paths && !result.globs) {
    result.globs = result.paths;
  } else if (result.globs && !result.paths) {
    result.paths = result.globs;
  }

  // Ensure description exists for Cursor "Apply Intelligently" mode
  if (!result.description && ruleName) {
    // Generate a description from the rule name
    const humanName = ruleName
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    result.description = `${humanName} guidelines`;
  }

  return result;
}

/**
 * Check if a rule file needs sanitization.
 * Returns true if the file would be modified by sanitization.
 */
export function ruleNeedsSanitization(filePath: string): boolean {
  const content = readFile(filePath);
  const { frontmatter } = parseFrontmatter(content);
  const ruleName = path.basename(filePath, ".md");
  const sanitized = sanitizeRuleFrontmatter(frontmatter, ruleName);
  
  return JSON.stringify(frontmatter) !== JSON.stringify(sanitized);
}

/**
 * Sanitize a rule file in place.
 * Returns true if the file was modified.
 */
export function sanitizeRuleFile(filePath: string): boolean {
  const content = readFile(filePath);
  const { frontmatter, body } = parseFrontmatter(content);
  const ruleName = path.basename(filePath, ".md");
  
  const sanitized = sanitizeRuleFrontmatter(frontmatter, ruleName);
  
  // Check if anything changed
  const originalStr = JSON.stringify(frontmatter);
  const sanitizedStr = JSON.stringify(sanitized);
  
  if (originalStr === sanitizedStr) {
    return false;
  }
  
  const newContent = serializeFrontmatter(sanitized, body);
  writeFile(filePath, newContent);
  return true;
}

/**
 * Find all rules that need sanitization in a loadout root.
 */
export function findUnsanitizedRules(loadoutRoot: string): string[] {
  const rulesDir = path.join(loadoutRoot, "rules");
  if (!isDirectory(rulesDir)) return [];
  
  const unsanitized: string[] = [];
  for (const file of listFiles(rulesDir)) {
    if (!file.endsWith(".md")) continue;
    const rulePath = path.join(rulesDir, file);
    if (ruleNeedsSanitization(rulePath)) {
      unsanitized.push(file.replace(/\.md$/, ""));
    }
  }
  return unsanitized;
}
