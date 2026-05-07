/**
 * YAML kind loader — reads *.yaml / *.yml files from .loadout/kinds/ directories
 * and registers them as KindSpec entries in the registry.
 *
 * Declarative kind files let teams add new artifact types without writing code.
 * See plans/EXTENSIBILITY.md §3a for the full format.
 *
 * Loading is idempotent: kind IDs already present in the registry are skipped
 * with a warning (built-ins always take precedence over YAML definitions).
 */

import * as path from "node:path";
import * as yaml from "yaml";
import { z } from "zod";
import { readFile, fileExists, isDirectory, listFiles } from "../lib/fs.js";
import { registry, type KindSpec, type OutputMapping, type PathTemplate } from "./registry.js";
import type { LoadoutRoot } from "./types.js";

// ---------------------------------------------------------------------------
// YAML schema
// ---------------------------------------------------------------------------

const YamlOutputMappingSchema = z.object({
  path: z.union([
    z.string(),
    z.object({ project: z.string(), global: z.string() }),
  ]),
  ext: z.string().optional(),
  // "generate" is code-only — YAML kinds cannot generate arbitrary content.
  mode: z.enum(["symlink", "copy"]).optional(),
  // Inline transforms require code; YAML kinds can only reference a named transform.
  transform: z.string().optional(),
});

const YamlKindDetectSchema = z.union([
  z.object({ pathPrefix: z.string() }),
  z.object({ pathExact: z.string() }),
]);

export const YamlKindSchema = z.object({
  /**
   * Unique kind identifier. Convention: namespace with a dot (e.g. "myteam.prompt")
   * to avoid collision with built-ins ("rule", "skill", "instruction") and other teams.
   */
  id: z.string().min(1),
  description: z.string().optional(),
  detect: YamlKindDetectSchema,
  layout: z.enum(["file", "dir"]),
  targets: z.record(z.string(), YamlOutputMappingSchema).optional(),
});

export type YamlKindDefinition = z.infer<typeof YamlKindSchema>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a YAML kind definition file into a KindSpec.
 */
export function parseYamlKind(filePath: string): KindSpec {
  const content = readFile(filePath);
  const raw = yaml.parse(content);
  const def = YamlKindSchema.parse(raw);

  // Build detect predicate from the declarative spec
  const detect = buildDetect(def.detect);

  // Convert targets to OutputMappings
  const defaultTargets: Record<string, OutputMapping> = {};
  for (const [toolName, target] of Object.entries(def.targets ?? {})) {
    const mapping: OutputMapping = {
      path: target.path as PathTemplate,
    };
    if (target.ext !== undefined) mapping.ext = target.ext;
    if (target.mode !== undefined) mapping.mode = target.mode;
    if (target.transform !== undefined) mapping.transform = target.transform;
    defaultTargets[toolName] = mapping;
  }

  return {
    id: def.id,
    description: def.description,
    detect,
    layout: def.layout,
    defaultTargets,
  };
}

function buildDetect(
  spec: z.infer<typeof YamlKindDetectSchema>
): (relativePath: string) => boolean {
  if ("pathPrefix" in spec) {
    const prefix = spec.pathPrefix;
    return (rel) => rel.startsWith(prefix);
  }
  if ("pathExact" in spec) {
    const exact = spec.pathExact;
    return (rel) => rel === exact;
  }
  // TypeScript exhaustiveness guard
  throw new Error("Invalid detect spec");
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load all YAML kinds from the `kinds/` subdirectory of each discovered root
 * and register them into the global registry.
 *
 * Already-registered IDs are skipped with a warning (built-ins win).
 * Parse errors are reported but do not abort loading.
 *
 * This is called synchronously from `resolveLoadout` after root discovery,
 * so YAML kinds are available for `inferKind()` during item resolution.
 */
export function loadYamlKindsFromRoots(roots: LoadoutRoot[]): void {
  for (const root of roots) {
    const kindsDir = path.join(root.path, "kinds");
    if (!isDirectory(kindsDir)) continue;

    const files = listFiles(kindsDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml")
    );

    for (const file of files) {
      const filePath = path.join(kindsDir, file);
      if (!fileExists(filePath)) continue;

      try {
        const kind = parseYamlKind(filePath);

        // Warn if ID looks like a built-in or has no namespace separator
        if (!kind.id.includes(".")) {
          console.warn(
            `[loadout] Warning: custom kind "${kind.id}" in ${filePath} ` +
              `has no namespace (e.g. "myteam.${kind.id}"). ` +
              `Dot-namespaced IDs are recommended to avoid collisions with built-ins.`
          );
        }

        registry.registerKind(kind);
      } catch (err) {
        if (err instanceof Error && err.message.includes("already registered")) {
          console.warn(
            `[loadout] Warning: kind from ${filePath} was skipped — ` +
              `"${extractId(err.message)}" is already registered (built-in takes precedence).`
          );
        } else {
          console.warn(
            `[loadout] Warning: could not load kind from ${filePath}: ` +
              (err instanceof Error ? err.message : String(err))
          );
        }
      }
    }
  }
}

function extractId(errMsg: string): string {
  const m = errMsg.match(/Kind "([^"]+)"/);
  return m ? m[1] : "unknown";
}
