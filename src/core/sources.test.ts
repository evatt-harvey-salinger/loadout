/**
 * Integration tests for sources and nested loadout resolution.
 * 
 * Tests the full flow of:
 * - Source discovery and resolution
 * - Cross-root `extends` chains
 * - Artifact inheritance from parent sources
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
extends: base
include:
  - rules/api-endpoints.md
`,
    "monorepo/packages/api/.loadout/loadouts/api-strict.yaml": `
name: api-strict
description: Strict API configuration
extends: api
include:
  - rules/strict-validation.md
`,
    "monorepo/packages/api/.loadout/rules/api-endpoints.md": `---
description: API endpoint conventions
---
# API Endpoints
`,
    "monorepo/packages/api/.loadout/rules/strict-validation.md": `---
description: Strict validation rules
---
# Strict Validation
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
extends: base
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

describe("Sources: Extends Resolution", () => {
  beforeEach(setupMonorepoFixture);
  afterEach(cleanupFixture);

  it("resolves extends chain across source boundaries", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    const loadout = resolveLoadout("api", roots);

    // api extends base, which is in the parent source
    expect(loadout.extendsChain).toEqual(["api", "base"]);
    expect(loadout.description).toBe("API package configuration");
  });

  it("resolves multi-level extends chain", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    const loadout = resolveLoadout("api-strict", roots);

    // api-strict -> api -> base
    expect(loadout.extendsChain).toEqual(["api-strict", "api", "base"]);
  });
});

describe("Sources: Artifact Resolution", () => {
  beforeEach(setupMonorepoFixture);
  afterEach(cleanupFixture);

  it("includes artifacts from parent source via extends", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    const loadout = resolveLoadout("api", roots);

    const relativePaths = loadout.items.map(i => i.relativePath);

    // Should have local artifact
    expect(relativePaths).toContain("rules/api-endpoints.md");
    
    // Should have inherited artifacts from base (in parent source)
    expect(relativePaths).toContain("rules/shared-style.md");
    expect(relativePaths).toContain("skills/debugging");
  });

  it("artifacts point to correct source paths", () => {
    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    const loadout = resolveLoadout("api", roots);

    const apiEndpoints = loadout.items.find(i => i.relativePath === "rules/api-endpoints.md");
    const sharedStyle = loadout.items.find(i => i.relativePath === "rules/shared-style.md");
    const debugging = loadout.items.find(i => i.relativePath === "skills/debugging");

    // Local artifact should point to local .loadout/
    expect(apiEndpoints?.sourcePath).toContain("packages/api/.loadout");
    
    // Inherited artifacts should point to parent .loadout/
    expect(sharedStyle?.sourcePath).toContain("monorepo/.loadout");
    expect(sharedStyle?.sourcePath).not.toContain("packages/api");
    
    expect(debugging?.sourcePath).toContain("monorepo/.loadout");
  });

  it("deduplicates artifacts with same relative path (base wins)", () => {
    // Add a shared-style.md to the API package
    const apiStylePath = path.join(
      FIXTURES_DIR,
      "monorepo/packages/api/.loadout/rules/shared-style.md"
    );
    fs.mkdirSync(path.dirname(apiStylePath), { recursive: true });
    fs.writeFileSync(apiStylePath, "# Local version\n");

    // Update api.yaml to include a duplicate of what base already has
    const apiYamlPath = path.join(
      FIXTURES_DIR,
      "monorepo/packages/api/.loadout/loadouts/api.yaml"
    );
    fs.writeFileSync(apiYamlPath, `
name: api
extends: base
include:
  - rules/shared-style.md
  - rules/api-endpoints.md
`);

    const primaryRoot: LoadoutRoot = {
      path: path.join(FIXTURES_DIR, "monorepo/packages/api/.loadout"),
      level: "project",
      depth: 0,
    };

    const { roots } = collectRootsWithSources(primaryRoot, false);
    const loadout = resolveLoadout("api", roots);

    // Should only have one shared-style.md (deduplicated)
    const sharedStyles = loadout.items.filter(i => i.relativePath === "rules/shared-style.md");
    expect(sharedStyles).toHaveLength(1);
    
    // Current behavior: base's version wins (processed first in reverse order)
    // This matches "extends" semantics where base provides defaults
    expect(sharedStyles[0].sourcePath).toContain("monorepo/.loadout");
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
    
    // Should have items from both local and source
    const relativePaths = loadout.items.map(i => i.relativePath);
    expect(relativePaths).toContain("rules/api-endpoints.md");
    expect(relativePaths).toContain("rules/shared-style.md");
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


