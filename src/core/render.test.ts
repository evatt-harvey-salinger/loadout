import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyPlan, applyMultiPlan, removeManaged } from "./render.js";
import { detectDrift, loadState } from "./manifest.js";
import { hashContent } from "../lib/fs.js";
import type { RenderPlan, ResolvedItem, ResolvedLoadout } from "./types.js";

interface SymlinkFixture {
  tmpDir: string;
  projectRoot: string;
  loadoutRoot: string;
  sourcePath: string;
  baseLink: string;
  dotfilesBase: string;
}

const TARGET_PATH = ".opencode/skills/grill-me/SKILL.md";

function createFixture(): SymlinkFixture {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loadout-render-test-"));
  const projectRoot = path.join(tmpDir, "project");
  const loadoutRoot = path.join(projectRoot, ".loadouts");
  const sourcePath = path.join(tmpDir, "source", "SKILL.md");
  const baseLink = path.join(projectRoot, ".opencode");
  const dotfilesBase = path.join(tmpDir, "dotfiles", "opencode");

  fs.mkdirSync(loadoutRoot, { recursive: true });
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(dotfilesBase, { recursive: true });

  fs.writeFileSync(sourcePath, "# Grill me\n", "utf-8");
  fs.writeFileSync(path.join(dotfilesBase, "opencode.jsonc"), "{}\n", "utf-8");
  fs.symlinkSync(dotfilesBase, baseLink, "dir");

  return { tmpDir, projectRoot, loadoutRoot, sourcePath, baseLink, dotfilesBase };
}

function createLoadoutAndPlan(
  sourcePath: string,
  loadoutRoot: string
): { loadout: ResolvedLoadout; plan: RenderPlan } {
  const item: ResolvedItem = {
    kind: "skill",
    sourcePath,
    relativePath: "skills/grill-me/SKILL.md",
    tools: ["opencode"],
  };

  const plan: RenderPlan = {
    outputs: [
      {
        spec: {
          tool: "opencode",
          kind: "skill",
          sourcePath,
          targetPath: TARGET_PATH,
          mode: "symlink",
        },
        item,
        hash: hashContent(fs.readFileSync(sourcePath, "utf-8")),
      },
    ],
    errors: [],
    shadowed: [],
  };

  const loadout: ResolvedLoadout = {
    name: "test",
    description: "",
    tools: ["opencode"],
    items: [item],
    rootPath: loadoutRoot,
  };

  return { loadout, plan };
}

describe("render symlinked base path safety", () => {
  let fixture: SymlinkFixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fs.rmSync(fixture.tmpDir, { recursive: true, force: true });
  });

  it("applyPlan preserves symlinked base path and writes through it", async () => {
    const { loadout, plan } = createLoadoutAndPlan(
      fixture.sourcePath,
      fixture.loadoutRoot
    );

    await applyPlan(plan, loadout, fixture.projectRoot, "symlink", "project");
    await applyPlan(plan, loadout, fixture.projectRoot, "symlink", "project");

    expect(fs.lstatSync(fixture.baseLink).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(fixture.baseLink, "opencode.jsonc"))).toBe(true);

    const outputPath = path.join(fixture.projectRoot, TARGET_PATH);
    expect(fs.lstatSync(outputPath).isSymbolicLink()).toBe(true);
    expect(
      fs.existsSync(path.join(fixture.dotfilesBase, "skills", "grill-me", "SKILL.md"))
    ).toBe(true);
  });

  it("applyMultiPlan preserves symlinked base path and stays idempotent", async () => {
    const { loadout, plan } = createLoadoutAndPlan(
      fixture.sourcePath,
      fixture.loadoutRoot
    );

    await applyMultiPlan(
      [{ loadout, plan }],
      fixture.loadoutRoot,
      fixture.projectRoot,
      "symlink",
      "project"
    );

    const second = await applyMultiPlan(
      [{ loadout, plan }],
      fixture.loadoutRoot,
      fixture.projectRoot,
      "symlink",
      "project"
    );

    expect(fs.lstatSync(fixture.baseLink).isSymbolicLink()).toBe(true);
    expect(second.changes.added).toHaveLength(0);
    expect(second.changes.updated).toHaveLength(0);
  });

  it("removeManaged removes managed outputs but keeps base symlink and config", async () => {
    const { loadout, plan } = createLoadoutAndPlan(
      fixture.sourcePath,
      fixture.loadoutRoot
    );

    await applyPlan(plan, loadout, fixture.projectRoot, "symlink", "project");
    const result = await removeManaged(
      fixture.loadoutRoot,
      fixture.projectRoot,
      "project"
    );

    expect(result.removed).toContain(TARGET_PATH);
    expect(fs.existsSync(path.join(fixture.projectRoot, TARGET_PATH))).toBe(false);
    expect(fs.lstatSync(fixture.baseLink).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(fixture.baseLink, "opencode.jsonc"))).toBe(true);
  });

  it("detectDrift treats outputs under symlinked parents as ok", async () => {
    const { loadout, plan } = createLoadoutAndPlan(
      fixture.sourcePath,
      fixture.loadoutRoot
    );

    await applyPlan(plan, loadout, fixture.projectRoot, "symlink", "project");

    const state = loadState(fixture.loadoutRoot);
    expect(state).not.toBeNull();

    const drift = detectDrift(state!, fixture.projectRoot);
    expect(drift).toHaveLength(1);
    expect(drift[0].status).toBe("ok");
  });
});
