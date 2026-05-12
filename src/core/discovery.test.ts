/**
 * Tests for source resolution in discovery.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  resolveSourcePath,
  collectRootsWithSources,
  collectCatalogRoots,
} from "./discovery.js";
import type { LoadoutRoot } from "./types.js";

// Test fixtures directory
const FIXTURES_DIR = path.join(process.cwd(), "test-fixtures", "sources");

function setupFixture(structure: Record<string, string | null>): void {
  // Clean up first
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }

  // Create structure
  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(FIXTURES_DIR, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    if (content !== null) {
      fs.writeFileSync(fullPath, content);
    }
  }
}

function cleanupFixture(): void {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }
}

describe("resolveSourcePath", () => {
  beforeEach(() => {
    setupFixture({
      "project/.loadouts/loadouts.yaml": "version: '1'",
      "parent/.loadouts/loadouts.yaml": "version: '1'",
      "sibling/configs/.loadouts/loadouts.yaml": "version: '1'",
    });
  });

  afterEach(cleanupFixture);

  it("resolves relative path to parent .loadouts/", () => {
    const fromDir = path.join(FIXTURES_DIR, "project/.loadouts");
    const result = resolveSourcePath("../parent", fromDir);
    expect(result).toBe(path.join(FIXTURES_DIR, "parent/.loadouts"));
  });

  it("resolves relative path to sibling", () => {
    const fromDir = path.join(FIXTURES_DIR, "project/.loadouts");
    const result = resolveSourcePath("../sibling/configs", fromDir);
    expect(result).toBe(path.join(FIXTURES_DIR, "sibling/configs/.loadouts"));
  });

  it("returns null for non-existent source", () => {
    const fromDir = path.join(FIXTURES_DIR, "project/.loadouts");
    const result = resolveSourcePath("../nonexistent", fromDir);
    expect(result).toBeNull();
  });

  it("handles direct .loadouts/ path", () => {
    const fromDir = path.join(FIXTURES_DIR, "project/.loadouts");
    const result = resolveSourcePath("../parent/.loadouts", fromDir);
    expect(result).toBe(path.join(FIXTURES_DIR, "parent/.loadouts"));
  });

  it("expands ~ to home directory", () => {
    const fromDir = path.join(FIXTURES_DIR, "project/.loadouts");
    // This won't resolve unless there's a ~/.loadouts, so we just check it doesn't crash
    const result = resolveSourcePath("~/nonexistent-loadout-test", fromDir);
    expect(result).toBeNull();
  });
});

describe("collectRootsWithSources", () => {
  beforeEach(() => {
    setupFixture({
      // Primary project
      "project/.loadouts/loadouts.yaml": `
version: "1"
sources:
  - ../parent
`,
      // Parent with its own source
      "parent/.loadouts/loadouts.yaml": `
version: "1"
sources:
  - ../shared
`,
      "parent/.loadouts/rules/parent-rule.md": "# Parent rule",
      // Shared (grandparent in source chain)
      "shared/.loadouts/loadouts.yaml": "version: '1'",
      "shared/.loadouts/rules/shared-rule.md": "# Shared rule",
    });
  });

  afterEach(cleanupFixture);

  it("collects primary root first", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "project/.loadouts"),
      level: "project",
      depth: 0,
    };

    const { roots, warnings } = collectRootsWithSources(primaryRoot, false, false);

    expect(warnings).toHaveLength(0);
    expect(roots[0]).toEqual(primaryRoot);
  });

  it("follows sources transitively", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "project/.loadouts"),
      level: "project",
      depth: 0,
    };

    const { roots, warnings } = collectRootsWithSources(primaryRoot, false, false);

    expect(warnings).toHaveLength(0);
    expect(roots).toHaveLength(3); // project, parent, shared

    // Check order and levels
    expect(roots[0].level).toBe("project");
    expect(roots[1].level).toBe("source");
    expect(roots[1].sourceRef).toBe("../parent");
    expect(roots[2].level).toBe("source");
    expect(roots[2].sourceRef).toBe("../shared");
  });

  it("detects cycles silently", () => {
    // Add a cycle: shared sources back to project
    setupFixture({
      "project/.loadouts/loadouts.yaml": `
version: "1"
sources:
  - ../parent
`,
      "parent/.loadouts/loadouts.yaml": `
version: "1"
sources:
  - ../project
`,
    });

    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "project/.loadouts"),
      level: "project",
      depth: 0,
    };

    const { roots, warnings } = collectRootsWithSources(primaryRoot, false, false);

    expect(warnings).toHaveLength(0);
    expect(roots).toHaveLength(2); // project, parent (cycle skipped)
  });

  it("warns on missing source but continues", () => {
    setupFixture({
      "project/.loadouts/loadouts.yaml": `
version: "1"
sources:
  - ../nonexistent
`,
    });

    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "project/.loadouts"),
      level: "project",
      depth: 0,
    };

    const { roots, warnings } = collectRootsWithSources(primaryRoot, false, false);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Source not found");
    expect(warnings[0]).toContain("../nonexistent");
    expect(roots).toHaveLength(1); // Just the primary, continues despite warning
  });
});

describe("collectCatalogRoots", () => {
  it("always includes bundled roots for catalog discovery", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "loadouts-catalog-"));
    try {
      const { entries } = await collectCatalogRoots(tempDir);
      expect(entries.some((entry) => entry.owner === "bundled")).toBe(true);
      expect(entries.some((entry) => entry.root.level === "bundled")).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps project roots ahead of bundled roots", async () => {
    setupFixture({
      "project/.loadouts/loadouts.yaml": "version: '1'",
    });

    try {
      const cwd = path.join(FIXTURES_DIR, "project");
      const { entries } = await collectCatalogRoots(cwd);

      const projectIndex = entries.findIndex((entry) => entry.owner === "project");
      const bundledIndex = entries.findIndex((entry) => entry.owner === "bundled");

      expect(projectIndex).toBeGreaterThanOrEqual(0);
      expect(bundledIndex).toBeGreaterThanOrEqual(0);
      expect(projectIndex).toBeLessThan(bundledIndex);
    } finally {
      cleanupFixture();
    }
  });
});
