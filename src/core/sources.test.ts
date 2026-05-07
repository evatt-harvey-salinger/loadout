/**
 * Integration tests for sources and nested loadout resolution.
 * 
 * Tests the full flow of:
 * - Source discovery and resolution
 * - Artifact availability from source roots
 * - Warning generation for missing sources
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { registry } from "./registry.js";
import { createPluginAPI } from "./plugin.js";
import { registerBuiltins } from "../builtins/index.js";
import { collectRootsWithSources } from "./discovery.js";
import { loadResolvedLoadout, resolveLoadout } from "./resolve.js";
import { listLoadouts, findLoadoutDefinition } from "./config.js";
import type { LoadoutRoot, CommandContext } from "./types.js";

// Initialize builtins once for all tests
beforeAll(() => {
  if (registry.allToolNames().length === 0) {
    const api = createPluginAPI(registry);
    registerBuiltins(api);
  }
});

const FIXTURES_DIR = path.join(process.cwd(), "test-fixtures", "nested-sources");

// Helper to create a directory structure from a flat object
function setupFixture(structure: Record<string, string>): void {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }

  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(FIXTURES_DIR, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  
  // Initialize git repo at monorepo root (needed for git root detection)
  const monorepoRoot = path.join(FIXTURES_DIR, "monorepo");
  if (fs.existsSync(monorepoRoot)) {
    fs.mkdirSync(path.join(monorepoRoot, ".git"), { recursive: true });
  }
}

function cleanupFixture(): void {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }
}

// Standard monorepo fixture used by most tests
function setupMonorepoFixture(): void {
  setupFixture({
    // Root level .loadout/
    "monorepo/.loadout/loadout.yaml": `
version: "1"
default: base
`,
    "monorepo/.loadout/loadouts/base.yaml": `
name: base
description: Monorepo base configuration
include:
  - rules/shared-style.md
  - skills/debugging
`,
    "monorepo/.loadout/loadouts/common.yaml": `
name: common
description: Common utilities
include:
  - rules/logging.md
`,
    "monorepo/.loadout/rules/shared-style.md": `---
description: Shared code style
---
# Shared Style Guide
`,
    "monorepo/.loadout/rules/logging.md": `---
description: Logging standards
---
# Logging Guide
`,
    "monorepo/.loadout/skills/debugging/SKILL.md": `---
name: debugging
description: Debugging utilities
---
# Debugging Skill
`,
    "monorepo/.loadout/AGENTS.md": `# Monorepo Instructions
`,

    // packages/api/.loadout/ with source to parent
    "monorepo/packages/api/.loadout/loadout.yaml": `
version: "1"
default: api
sources:
  - ../..
`,
    "monorepo/packages/api/.loadout/loadouts/api.yaml": `
name: api
description: API package configuration
include:
  - rules/api-endpoints.md
`,
    "monorepo/packages/api/.loadout/rules/api-endpoints.md": `---
description: API endpoint conventions
---
# API Endpoints
`,
    "monorepo/packages/api/.loadout/AGENTS.md": `# API Package Instructions
`,

    // packages/web/.loadout/ with source to parent
    "monorepo/packages/web/.loadout/loadout.yaml": `
version: "1"
default: web
sources:
  - ../..
`,
    "monorepo/packages/web/.loadout/loadouts/web.yaml": `
name: web
description: Web package configuration
include:
  - rules/components.md
`,
    "monorepo/packages/web/.loadout/rules/components.md": `---
description: Component guidelines
---
# Components
`,
  });
}

describe("Sources: Root Collection", () => {
  beforeEach(setupMonorepoFixture);
  afterEach(cleanupFixture);

  it("discovers source roots from loadout.yaml", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots, warnings } = collectRootsWithSources(primaryRoot, false);

    expect(warnings).toHaveLength(0);
    expect(roots).toHaveLength(2); // primary + parent source
    expect(roots[0].level).toBe("project");
    expect(roots[1].level).toBe("source");
    expect(roots[1].path).toContain("monorepo/.loadout");
  });

  it("makes loadouts from sources available", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);

    // Should be able to find 'base' which is defined in the parent source
    const baseDef = findLoadoutDefinition("base", roots);
    expect(baseDef).not.toBeNull();
    expect(baseDef?.definition.name).toBe("base");
    expect(baseDef?.rootPath).toContain("monorepo/.loadout");
  });

  it("returns warnings for missing sources", () => {
    // Add a missing source reference
    const configPath = path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout/loadout.yaml");
    fs.writeFileSync(configPath, `
version: "1"
default: api
sources:
  - ../..
  - ../missing-package
`);

    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots, warnings } = collectRootsWithSources(primaryRoot, false);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("../missing-package");
    // Should still have the valid roots
    expect(roots.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Sources: Loadout Resolution", () => {
  beforeEach(setupMonorepoFixture);
  afterEach(cleanupFixture);

  it("resolves local loadout with local artifacts", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    const loadout = resolveLoadout("api", roots);

    expect(loadout.name).toBe("api");
    expect(loadout.description).toBe("API package configuration");
    
    const relativePaths = loadout.items.map(i => i.relativePath);
    expect(relativePaths).toContain("rules/api-endpoints.md");
  });

  it("resolves loadout from source root", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    
    // 'base' is defined in the parent monorepo source, not locally
    const loadout = resolveLoadout("base", roots);

    expect(loadout.name).toBe("base");
    expect(loadout.description).toBe("Monorepo base configuration");
    
    const relativePaths = loadout.items.map(i => i.relativePath);
    expect(relativePaths).toContain("rules/shared-style.md");
    expect(relativePaths).toContain("skills/debugging");
  });

  it("artifacts point to their source root", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    const loadout = resolveLoadout("base", roots);

    const sharedStyle = loadout.items.find(i => i.relativePath === "rules/shared-style.md");
    
    // Artifact should point to monorepo .loadout/, not api .loadout/
    expect(sharedStyle?.sourcePath).toContain("monorepo/.loadout");
    expect(sharedStyle?.sourcePath).not.toContain("packages/api");
  });
});

describe("Sources: Full Context Resolution", () => {
  beforeEach(setupMonorepoFixture);
  afterEach(cleanupFixture);

  it("loadResolvedLoadout integrates sources correctly", async () => {
    const ctx: CommandContext = {
      scope: "project",
      configPath: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      statePath: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout/.state.json"),
      projectRoot: path.join(FIXTURES_DIR, "monorepo/packages/api"),
    };

    const { loadout, roots, sourceWarnings } = await loadResolvedLoadout(ctx, "api");

    expect(sourceWarnings).toHaveLength(0);
    expect(roots.some(r => r.level === "source")).toBe(true);
    
    // Should have local artifacts
    const relativePaths = loadout.items.map(i => i.relativePath);
    expect(relativePaths).toContain("rules/api-endpoints.md");
  });

  it("can resolve loadouts defined in sources", async () => {
    const ctx: CommandContext = {
      scope: "project",
      configPath: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      statePath: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout/.state.json"),
      projectRoot: path.join(FIXTURES_DIR, "monorepo/packages/api"),
    };

    // 'base' is defined in the parent source
    const { loadout } = await loadResolvedLoadout(ctx, "base");

    expect(loadout.name).toBe("base");
    expect(loadout.items.some(i => i.relativePath === "rules/shared-style.md")).toBe(true);
  });

  it("returns source warnings for missing sources", async () => {
    // Add a missing source reference
    const configPath = path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout/loadout.yaml");
    fs.writeFileSync(configPath, `
version: "1"
default: api
sources:
  - ../..
  - ../missing-package
`);

    const ctx: CommandContext = {
      scope: "project",
      configPath: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      statePath: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout/.state.json"),
      projectRoot: path.join(FIXTURES_DIR, "monorepo/packages/api"),
    };

    const { sourceWarnings } = await loadResolvedLoadout(ctx, "api");

    expect(sourceWarnings).toHaveLength(1);
    expect(sourceWarnings[0]).toContain("../missing-package");
  });
});
