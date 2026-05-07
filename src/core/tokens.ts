/**
 * Token estimation for rendered outputs
 *
 * Uses a simple approximation: ~4 characters per token for English text.
 * This is intentionally rough—good enough to compare loadouts and catch bloat.
 */

import { readFile, isDirectory, listFiles, fileExists } from "../lib/fs.js";
import * as path from "node:path";

const CHARS_PER_TOKEN = 4;

/**
 * Estimate tokens for a string.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for a file.
 */
export function estimateFileTokens(filePath: string): number {
  try {
    const content = readFile(filePath);
    return estimateTokens(content);
  } catch {
    return 0;
  }
}

/**
 * Estimate tokens for a directory (sum of all files).
 */
export function estimateDirTokens(dirPath: string): number {
  let total = 0;

  function walk(dir: string): void {
    const entries = listFiles(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      if (isDirectory(fullPath)) {
        walk(fullPath);
      } else {
        total += estimateFileTokens(fullPath);
      }
    }
  }

  try {
    walk(dirPath);
  } catch {
    // Ignore errors
  }

  return total;
}

/**
 * Format token count for display.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  }
  return `${(tokens / 1000).toFixed(1)}k tokens`;
}

/**
 * Extract frontmatter description from a skill's SKILL.md file.
 * Returns the description string or undefined if not found.
 */
export function extractSkillDescription(skillDirPath: string): string | undefined {
  const skillMdPath = path.join(skillDirPath, "SKILL.md");
  if (!fileExists(skillMdPath)) return undefined;

  try {
    const content = readFile(skillMdPath);
    // Match YAML frontmatter: ---\n...description: ...\n...---
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return undefined;

    const frontmatter = frontmatterMatch[1];
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    return descMatch ? descMatch[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estimate upfront tokens for a skill directory.
 * This is the description that goes into the system prompt by default.
 */
export function estimateSkillUpfrontTokens(skillDirPath: string): number {
  const description = extractSkillDescription(skillDirPath);
  if (!description) return 0;
  
  // Include some overhead for the skill XML wrapper that most harnesses use
  // e.g., <skill><name>...</name><description>...</description>...</skill>
  const overhead = 50; // ~200 chars for XML tags and name
  return estimateTokens(description) + Math.ceil(overhead / CHARS_PER_TOKEN);
}
