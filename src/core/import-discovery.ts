/**
 * Import Discovery — scan tool directories for existing configurations
 * that can be imported into loadout.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { registry } from "./registry.js";
import { fileExists, isDirectory, isSymlink, listFiles, listFilesWithExtension } from "../lib/fs.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportableKind = "rule" | "skill" | "instruction";

export interface DiscoveredArtifact {
  /** Artifact kind */
  kind: ImportableKind;
  /** Suggested name in .loadout/ (without extension for rules) */
  name: string;
  /** Absolute path to source file/directory */
  sourcePath: string;
  /** Display path relative to project root */
  displayPath: string;
  /** Which tool directory it came from */
  tool: string;
  /** File size in bytes (for files) or total size (for directories) */
  size: number;
  /** Last modification time */
  mtime: Date;
  /** Destination path in .loadout/ */
  destPath: string;
}

export interface DiscoveryResult {
  /** All discovered artifacts */
  artifacts: DiscoveredArtifact[];
  /** Artifacts grouped by name that conflict */
  conflicts: Map<string, DiscoveredArtifact[]>;
  /** Any warnings during discovery */
  warnings: string[];
}

export interface DiscoveryOptions {
  /** Filter to specific tools */
  tools?: string[];
  /** Filter to specific kinds */
  kinds?: ImportableKind[];
  /** Path to .loadout/ directory (to check for existing artifacts) */
  loadoutPath?: string;
}

// ---------------------------------------------------------------------------
// Tool artifact locations
// ---------------------------------------------------------------------------

interface ToolArtifactLocations {
  rules?: { dir: string; ext: string };
  skills?: { dir: string };
}

const TOOL_LOCATIONS: Record<string, ToolArtifactLocations> = {
  "claude-code": {
    rules: { dir: ".claude/rules", ext: ".md" },
    skills: { dir: ".claude/skills" },
  },
  cursor: {
    rules: { dir: ".cursor/rules", ext: ".mdc" },
    skills: { dir: ".cursor/skills" },
  },
  opencode: {
    rules: { dir: ".opencode/rules", ext: ".md" },
    skills: { dir: ".opencode/skills" },
  },
  codex: {
    // codex doesn't support rules
    skills: { dir: ".agents/skills" },
  },
  pi: {
    // pi doesn't have native rules support
    skills: { dir: ".pi/skills" },
  },
};

// Instruction file locations to check (in priority order)
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];

// ---------------------------------------------------------------------------
// Discovery functions
// ---------------------------------------------------------------------------

/**
 * Get file/directory size.
 */
function getSize(filePath: string): number {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    let total = 0;
    const entries = fs.readdirSync(filePath, { withFileTypes: true });
    for (const entry of entries) {
      total += getSize(path.join(filePath, entry.name));
    }
    return total;
  }
  return stat.size;
}

/**
 * Get modification time.
 */
function getMtime(filePath: string): Date {
  return fs.statSync(filePath).mtime;
}

/**
 * Discover rules in a tool directory.
 */
function discoverRules(
  projectRoot: string,
  tool: string,
  locations: ToolArtifactLocations
): DiscoveredArtifact[] {
  if (!locations.rules) return [];

  const rulesDir = path.join(projectRoot, locations.rules.dir);
  if (!isDirectory(rulesDir)) return [];

  const artifacts: DiscoveredArtifact[] = [];
  const files = listFilesWithExtension(rulesDir, locations.rules.ext);

  for (const file of files) {
    const sourcePath = path.join(rulesDir, file);
    const name = file.replace(/\.(md|mdc)$/, "");
    
    artifacts.push({
      kind: "rule",
      name,
      sourcePath,
      displayPath: path.join(locations.rules.dir, file),
      tool,
      size: getSize(sourcePath),
      mtime: getMtime(sourcePath),
      destPath: `rules/${name}.md`,
    });
  }

  return artifacts;
}

/**
 * Discover skills in a tool directory.
 */
function discoverSkills(
  projectRoot: string,
  tool: string,
  locations: ToolArtifactLocations
): DiscoveredArtifact[] {
  if (!locations.skills) return [];

  const skillsDir = path.join(projectRoot, locations.skills.dir);
  if (!isDirectory(skillsDir)) return [];

  const artifacts: DiscoveredArtifact[] = [];
  const entries = listFiles(skillsDir);

  for (const entry of entries) {
    const skillPath = path.join(skillsDir, entry);
    if (!isDirectory(skillPath)) continue;

    // Check for SKILL.md to confirm it's a valid skill
    const skillMdPath = path.join(skillPath, "SKILL.md");
    if (!fileExists(skillMdPath)) continue;

    artifacts.push({
      kind: "skill",
      name: entry,
      sourcePath: skillPath,
      displayPath: path.join(locations.skills.dir, entry),
      tool,
      size: getSize(skillPath),
      mtime: getMtime(skillPath),
      destPath: `skills/${entry}`,
    });
  }

  return artifacts;
}

/**
 * Check if a file at project root is managed by loadout.
 * A file is managed if it's a symlink pointing into .loadout/.
 */
function isManagedByLoadout(filePath: string, loadoutPath: string | undefined): boolean {
  if (!loadoutPath) return false;
  if (!isSymlink(filePath)) return false;
  
  try {
    const target = fs.readlinkSync(filePath);
    const absoluteTarget = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(filePath), target);
    return absoluteTarget.startsWith(loadoutPath);
  } catch {
    return false;
  }
}

/**
 * Check if a file is the auto-generated CLAUDE.md wrapper.
 */
function isClaudeWrapper(filePath: string): boolean {
  if (!fileExists(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.includes("auto-generated by Loadout");
  } catch {
    return false;
  }
}

/**
 * Discover instruction files at project root.
 * Only discovers files that are NOT managed by loadout.
 */
function discoverInstructions(
  projectRoot: string,
  loadoutPath: string | undefined
): DiscoveredArtifact[] {
  const artifacts: DiscoveredArtifact[] = [];

  for (const filename of INSTRUCTION_FILES) {
    const filePath = path.join(projectRoot, filename);
    if (!fileExists(filePath)) continue;
    
    // Skip if this file is managed by loadout (symlink to .loadout/)
    if (isManagedByLoadout(filePath, loadoutPath)) continue;
    
    // Skip auto-generated CLAUDE.md wrapper
    if (filename === "CLAUDE.md" && isClaudeWrapper(filePath)) continue;

    artifacts.push({
      kind: "instruction",
      name: "AGENTS.md",
      sourcePath: filePath,
      displayPath: filename,
      tool: "project-root",
      size: getSize(filePath),
      mtime: getMtime(filePath),
      destPath: "instructions/AGENTS.base.md",  // Will be updated by install based on target loadout
    });
  }

  return artifacts;
}

/**
 * Check if an artifact already exists in .loadout/.
 * For instructions, we DON'T filter them out since unmanaged files at project root
 * should be offered for import (to replace the template).
 */
function artifactExistsInLoadout(
  loadoutPath: string,
  artifact: DiscoveredArtifact
): boolean {
  // Instructions at project root are already filtered by discoverInstructions
  // if they're managed. If they reach here, they're unmanaged and should be imported.
  if (artifact.kind === "instruction") {
    return false; // Always offer to import unmanaged instruction files
  }
  
  const destPath = path.join(loadoutPath, artifact.destPath);
  return artifact.kind === "skill" ? isDirectory(destPath) : fileExists(destPath);
}

/**
 * Discover all importable artifacts in a project.
 */
export function discoverImportableArtifacts(
  projectRoot: string,
  options: DiscoveryOptions = {}
): DiscoveryResult {
  const artifacts: DiscoveredArtifact[] = [];
  const warnings: string[] = [];
  const { tools, kinds, loadoutPath } = options;

  // Filter tools if specified
  const toolsToScan = tools
    ? Object.keys(TOOL_LOCATIONS).filter((t) => tools.includes(t))
    : Object.keys(TOOL_LOCATIONS);

  // Discover from each tool directory
  for (const tool of toolsToScan) {
    const locations = TOOL_LOCATIONS[tool];

    // Rules
    if (!kinds || kinds.includes("rule")) {
      artifacts.push(...discoverRules(projectRoot, tool, locations));
    }

    // Skills
    if (!kinds || kinds.includes("skill")) {
      artifacts.push(...discoverSkills(projectRoot, tool, locations));
    }
  }

  // Instructions (not tool-specific)
  if (!kinds || kinds.includes("instruction")) {
    artifacts.push(...discoverInstructions(projectRoot, loadoutPath));
  }

  // Filter out artifacts that already exist in .loadout/
  const filteredArtifacts = loadoutPath
    ? artifacts.filter((a) => !artifactExistsInLoadout(loadoutPath, a))
    : artifacts;

  // Detect conflicts (same name from different tools)
  const byName = new Map<string, DiscoveredArtifact[]>();
  for (const artifact of filteredArtifacts) {
    const key = `${artifact.kind}:${artifact.name}`;
    const existing = byName.get(key) || [];
    existing.push(artifact);
    byName.set(key, existing);
  }

  const conflicts = new Map<string, DiscoveredArtifact[]>();
  for (const [key, items] of byName) {
    if (items.length > 1) {
      conflicts.set(key, items);
    }
  }

  return { artifacts: filteredArtifacts, conflicts, warnings };
}

/**
 * Group artifacts by kind for display.
 */
export function groupByKind(
  artifacts: DiscoveredArtifact[]
): Record<ImportableKind, DiscoveredArtifact[]> {
  const groups: Record<ImportableKind, DiscoveredArtifact[]> = {
    instruction: [],
    rule: [],
    skill: [],
  };

  for (const artifact of artifacts) {
    groups[artifact.kind].push(artifact);
  }

  return groups;
}

/**
 * Format file size for display.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format relative time for display.
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
