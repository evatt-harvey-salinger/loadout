import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { 
  updateGitignore, 
  getManagedPaths, 
  removeGitignoreSection,
  computeArtifactGitignorePaths,
  addArtifactToGitignore,
  removeArtifactFromGitignore,
} from "./gitignore.js";
import { registry } from "../core/registry.js";
import { registerBuiltins } from "../builtins/index.js";

// Register built-in kinds and tools for tests
registerBuiltins({ 
  registerKind: (k) => registry.registerKind(k),
  registerTool: (t) => registry.registerTool(t),
  registerTransform: (n, f) => registry.registerTransform(n, f),
  registerHook: () => {},
});

describe("gitignore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loadout-gitignore-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("updateGitignore", () => {
    it("creates .gitignore with managed section", () => {
      updateGitignore(tmpDir, [".cursor/rules/test.mdc"]);

      const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(content).toContain("# <loadouts>");
      expect(content).toContain(".cursor/rules/test.mdc");
      expect(content).toContain("# </loadouts>");
    });

    it("handles directory paths with trailing slashes", () => {
      updateGitignore(tmpDir, [
        ".cursor/skills/my-skill/",
        ".claude/skills/my-skill/",
      ]);

      const paths = getManagedPaths(tmpDir);
      expect(paths).toContain(".cursor/skills/my-skill/");
      expect(paths).toContain(".claude/skills/my-skill/");
    });

    it("deduplicates paths", () => {
      updateGitignore(tmpDir, [
        ".cursor/skills/a/",
        ".cursor/skills/a/",
        ".cursor/skills/b/",
      ]);

      const paths = getManagedPaths(tmpDir);
      expect(paths.filter((p) => p === ".cursor/skills/a/")).toHaveLength(1);
      expect(paths).toContain(".cursor/skills/b/");
    });

    it("preserves existing user content", () => {
      const userContent = "node_modules/\n*.log\n";
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), userContent);

      updateGitignore(tmpDir, [".cursor/skills/test/"]);

      const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(content).toContain("node_modules/");
      expect(content).toContain("*.log");
      expect(content).toContain(".cursor/skills/test/");
    });

    it("updates existing managed section without duplicating", () => {
      // First update
      updateGitignore(tmpDir, [".cursor/skills/a/"]);
      // Second update with different paths
      updateGitignore(tmpDir, [".cursor/skills/b/"]);

      const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      const matches = content.match(/# <loadouts>/g);
      expect(matches).toHaveLength(1);
      expect(content).not.toContain(".cursor/skills/a/");
      expect(content).toContain(".cursor/skills/b/");
    });
  });

  describe("getManagedPaths", () => {
    it("returns empty array when no .gitignore", () => {
      expect(getManagedPaths(tmpDir)).toEqual([]);
    });

    it("returns empty array when no managed section", () => {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/\n");
      expect(getManagedPaths(tmpDir)).toEqual([]);
    });

    it("extracts paths from managed section", () => {
      updateGitignore(tmpDir, [
        ".cursor/skills/foo/",
        ".opencode/rules/bar.md",
      ]);

      const paths = getManagedPaths(tmpDir);
      expect(paths).toContain(".cursor/skills/foo/");
      expect(paths).toContain(".opencode/rules/bar.md");
      // Should also include state files
      expect(paths).toContain(".loadouts/.state.json");
    });
  });

  describe("removeGitignoreSection", () => {
    it("removes managed artifact paths but keeps state files", () => {
      const userContent = "node_modules/\n";
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), userContent);
      updateGitignore(tmpDir, [".cursor/skills/test/"]);

      removeGitignoreSection(tmpDir);

      const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      // Artifact paths are removed
      expect(content).not.toContain(".cursor/skills/test/");
      // User content is preserved
      expect(content).toContain("node_modules/");
      // State files are always kept
      expect(content).toContain(".loadouts/.state.json");
    });
  });

  describe("computeArtifactGitignorePaths", () => {
    it("computes paths for skills with trailing slashes", () => {
      const paths = computeArtifactGitignorePaths("skill", "my-skill");
      
      // Should include paths for all tools that support skills
      expect(paths).toContain(".claude/skills/my-skill/");
      expect(paths).toContain(".cursor/skills/my-skill/");
      expect(paths).toContain(".opencode/skills/my-skill/");
      expect(paths).toContain(".pi/skills/my-skill/");
      
      // All skill paths should end with trailing slash
      for (const p of paths) {
        expect(p.endsWith("/")).toBe(true);
      }
    });

    it("computes paths for rules without trailing slashes", () => {
      const paths = computeArtifactGitignorePaths("rule", "my-rule");
      
      // Should include paths for all tools that support rules
      expect(paths.some(p => p.includes(".claude/rules/"))).toBe(true);
      expect(paths.some(p => p.includes(".cursor/rules/"))).toBe(true);
      
      // Rule paths should not end with trailing slash
      for (const p of paths) {
        expect(p.endsWith("/")).toBe(false);
      }
    });

    it("returns empty array for unknown kind", () => {
      const paths = computeArtifactGitignorePaths("unknown-kind", "test");
      expect(paths).toEqual([]);
    });
  });

  describe("addArtifactToGitignore", () => {
    it("adds artifact paths to gitignore", () => {
      addArtifactToGitignore(tmpDir, "skill", "test-skill");
      
      const paths = getManagedPaths(tmpDir);
      expect(paths).toContain(".claude/skills/test-skill/");
      expect(paths).toContain(".cursor/skills/test-skill/");
    });

    it("merges with existing paths", () => {
      // Add first artifact
      addArtifactToGitignore(tmpDir, "skill", "skill-a");
      // Add second artifact
      addArtifactToGitignore(tmpDir, "skill", "skill-b");
      
      const paths = getManagedPaths(tmpDir);
      expect(paths).toContain(".claude/skills/skill-a/");
      expect(paths).toContain(".claude/skills/skill-b/");
    });
  });

  describe("removeArtifactFromGitignore", () => {
    it("removes artifact paths from gitignore", () => {
      // Add two artifacts
      addArtifactToGitignore(tmpDir, "skill", "skill-a");
      addArtifactToGitignore(tmpDir, "skill", "skill-b");
      
      // Remove one
      removeArtifactFromGitignore(tmpDir, "skill", "skill-a");
      
      const paths = getManagedPaths(tmpDir);
      expect(paths).not.toContain(".claude/skills/skill-a/");
      expect(paths).toContain(".claude/skills/skill-b/");
    });
  });
});
