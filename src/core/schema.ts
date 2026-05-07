/**
 * Zod schemas for config file validation.
 *
 * Tool and ArtifactKind are open strings (any registered value is valid).
 * Runtime registry validation happens separately in the render pipeline;
 * these schemas focus on structural correctness of config files.
 */

import { z } from "zod";

// Tool and kind are open strings — new tools/kinds registered via plugins
// are automatically accepted without schema changes.
export const ToolSchema = z.string().min(1);
export const ArtifactKindSchema = z.string().min(1);

export const OutputModeSchema = z.enum(["symlink", "copy", "generate"]);

// Source reference — path to another .loadout/ directory
export const SourceRefSchema = z.string();

export const RootConfigSchema = z.object({
  version: z.literal("1"),
  default: z.string().optional(),
  mode: OutputModeSchema.optional(),
  tools: z.array(ToolSchema).optional(),
  sources: z.array(SourceRefSchema).optional(),
});

export const LoadoutIncludeSchema = z.union([
  z.string(),
  z.object({
    path: z.string(),
    tools: z.array(ToolSchema).optional(),
  }),
]);

export const LoadoutDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tools: z.array(ToolSchema).optional(),
  include: z.array(LoadoutIncludeSchema),
});

export const ManifestEntrySchema = z.object({
  tool: ToolSchema,
  kind: ArtifactKindSchema,
  sourcePath: z.string(),
  targetPath: z.string(),
  mode: OutputModeSchema,
  renderedHash: z.string(),
});

export const ShadowedEntrySchema = z.object({
  tool: ToolSchema,
  kind: ArtifactKindSchema,
  sourcePath: z.string(),
  targetPath: z.string(),
});

export const AppliedStateSchema = z.object({
  active: z.array(z.string()),  // Set of active loadout names
  mode: OutputModeSchema,
  appliedAt: z.string(),
  entries: z.array(ManifestEntrySchema),
  shadowed: z.array(ShadowedEntrySchema).default([]),
});

// Legacy schema for migration from single-loadout format
export const LegacyAppliedStateSchema = z.object({
  loadout: z.string(),
  mode: OutputModeSchema,
  appliedAt: z.string(),
  entries: z.array(ManifestEntrySchema),
  shadowed: z.array(ShadowedEntrySchema).default([]),
});

// Rule frontmatter
export const RuleFrontmatterSchema = z.object({
  description: z.string().optional(),
  paths: z.array(z.string()).optional(),
  globs: z.array(z.string()).optional(),
  alwaysApply: z.boolean().optional(),
});

export type RuleFrontmatter = z.infer<typeof RuleFrontmatterSchema>;
