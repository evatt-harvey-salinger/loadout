/**
 * Path template engine.
 *
 * Expands {token} placeholders in an OutputMapping path template.
 * Unknown tokens throw at expansion time so misconfiguration is caught early.
 *
 * Supported tokens:
 *   {base}     — tool.basePath[scope]  (e.g. ".claude" or "/Users/you/.claude")
 *   {home}     — os.homedir()          (always absolute; scope-independent)
 *   {stem}     — source basename without extension
 *   {ext}      — extension with dot (mapping.ext override or source extension)
 *   {name}     — source basename including extension
 *   {relative} — item.relativePath     (e.g. "rules/foo.md")
 *   {kind}     — kind id               (e.g. "rule")
 */

import * as path from "node:path";
import type { PathTemplate } from "./registry.js";
import type { Scope } from "./types.js";

export interface TemplateVars {
  base: string;
  home: string;
  stem: string;
  ext: string;
  name: string;
  relative: string;
  kind: string;
}

/**
 * Expand a path template for the given scope and variables.
 * Returns a normalized path (collapses `.` segments, etc.).
 */
export function expandTemplate(
  template: PathTemplate,
  scope: Scope,
  vars: TemplateVars
): string {
  const tpl = typeof template === "string" ? template : template[scope];

  const expanded = tpl.replace(/\{(\w+)\}/g, (match, key) => {
    if (key in vars) return vars[key as keyof TemplateVars];
    throw new Error(
      `Unknown path template token: {${key}} in "${tpl}". ` +
        `Valid tokens: ${Object.keys(vars).map((k) => `{${k}}`).join(", ")}`
    );
  });

  // Normalize to clean up "./" prefixes without changing absolute paths
  return path.normalize(expanded);
}
