import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { discoverImportableArtifacts } from "./import-discovery.js";
import { registry } from "./registry.js";
import { createPluginAPI } from "./plugin.js";
import { registerBuiltins } from "../builtins/index.js";

const FIXTURES_DIR = path.join(process.cwd(), "test-fixtures", "import-discovery");
const CUSTOM_KIND_ID = "test.import-snippet";
const CUSTOM_TOOL = "testscope";

function setupFixture(structure: Record<string, string | null>): void {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }

  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(FIXTURES_DIR, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (content !== null) {
      fs.writeFileSync(fullPath, content);
    }
  }
}

function cleanupFixture(): void {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }
}

describe("discoverImportableArtifacts", () => {
  beforeAll(() => {
    if (registry.allToolNames().length === 0) {
      registerBuiltins(createPluginAPI(registry));
    }

    if (!registry.getKind(CUSTOM_KIND_ID)) {
      registry.registerKind({
        id: CUSTOM_KIND_ID,
        description: "Test import snippets",
        layout: "file",
        detect: (rel) => rel.startsWith("snippets/") && rel.endsWith(".txt"),
        defaultTargets: {
          opencode: { path: "{base}/snippets/{stem}.txt" },
        },
      });
    }

    if (!registry.getTool(CUSTOM_TOOL)) {
      registry.registerTool({
        name: CUSTOM_TOOL,
        basePath: {
          project: ".testscope",
          global: ".testscope-global",
        },
        supports: [CUSTOM_KIND_ID],
        targets: {
          [CUSTOM_KIND_ID]: { path: "{base}/snippets/{stem}.txt" },
        },
      });
    }
  });

  beforeEach(() => {
    cleanupFixture();
  });

  afterEach(() => {
    cleanupFixture();
  });

  it("discovers built-in opencode plugin and config artifacts via templates", () => {
    setupFixture({
      "project/opencode.jsonc": '{"$schema":"https://opencode.ai/config.json"}\n',
      "project/.opencode/plugins/notify.ts": "export default {};\n",
    });

    const projectRoot = path.join(FIXTURES_DIR, "project");
    const result = discoverImportableArtifacts(projectRoot, {
      tools: ["opencode"],
      kinds: ["opencode-config", "opencode-plugin"],
    });

    expect(result.warnings).toEqual([]);
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts.map((a) => a.destPath).sort()).toEqual([
      "opencode/opencode.jsonc",
      "opencode/plugins/notify.ts",
    ]);
  });

  it("discovers custom registered kinds through registry mappings", () => {
    setupFixture({
      "project/.opencode/snippets/hello.txt": "hello\n",
    });

    const projectRoot = path.join(FIXTURES_DIR, "project");
    const result = discoverImportableArtifacts(projectRoot, {
      tools: ["opencode"],
      kinds: [CUSTOM_KIND_ID],
    });

    expect(result.warnings).toEqual([]);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe(CUSTOM_KIND_ID);
    expect(result.artifacts[0].destPath).toBe("snippets/hello.txt");
  });

  it("filters already-imported custom artifacts when loadout path is provided", () => {
    setupFixture({
      "project/.opencode/snippets/hello.txt": "hello\n",
      "project/.loadouts/snippets/hello.txt": "hello\n",
    });

    const projectRoot = path.join(FIXTURES_DIR, "project");
    const loadoutPath = path.join(projectRoot, ".loadouts");
    const result = discoverImportableArtifacts(projectRoot, {
      tools: ["opencode"],
      kinds: [CUSTOM_KIND_ID],
      loadoutPath,
    });

    expect(result.artifacts).toHaveLength(0);
  });

  it("discovers global-scope artifacts using the same registry logic", () => {
    setupFixture({
      "home/.testscope-global/snippets/global.txt": "global\n",
    });

    const homeRoot = path.join(FIXTURES_DIR, "home");
    const result = discoverImportableArtifacts(homeRoot, {
      scope: "global",
      tools: [CUSTOM_TOOL],
      kinds: [CUSTOM_KIND_ID],
    });

    expect(result.warnings).toEqual([]);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].displayPath).toBe(".testscope-global/snippets/global.txt");
    expect(result.artifacts[0].destPath).toBe("snippets/global.txt");
  });
});
