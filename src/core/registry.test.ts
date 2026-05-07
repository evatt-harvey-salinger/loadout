import { describe, it, expect, beforeEach } from "vitest";
import { Registry } from "./registry.js";
import { ruleKind } from "../builtins/kinds/rule.js";
import { skillKind } from "../builtins/kinds/skill.js";
import { instructionKind } from "../builtins/kinds/instruction.js";
import { claudeCodeTool } from "../builtins/tools/claude-code.js";
import { cursorTool } from "../builtins/tools/cursor.js";

let reg: Registry;

beforeEach(() => {
  reg = new Registry();
  reg.registerKind(ruleKind);
  reg.registerKind(skillKind);
  reg.registerKind(instructionKind);
});

describe("Registry.inferKind", () => {
  it("infers rule kind", () => {
    expect(reg.inferKind("rules/typescript.md")).toBe("rule");
  });

  it("infers skill kind", () => {
    expect(reg.inferKind("skills/deploy")).toBe("skill");
  });

  it("infers instruction kind", () => {
    expect(reg.inferKind("AGENTS.md")).toBe("instruction");
  });

  it("returns undefined for unknown path", () => {
    expect(reg.inferKind("unknown/path.md")).toBeUndefined();
  });
});

describe("Registry.resolveMapping", () => {
  beforeEach(() => {
    reg.registerTool(claudeCodeTool);
    reg.registerTool(cursorTool);
  });

  it("resolves claude-code rule mapping", () => {
    const m = reg.resolveMapping("claude-code", "rule");
    expect(m).toBeDefined();
    expect(m!.path).toBe("{base}/rules/{stem}.md");
  });

  it("resolves cursor rule mapping with mdc extension", () => {
    const m = reg.resolveMapping("cursor", "rule");
    expect(m).toBeDefined();
    expect(m!.path).toBe("{base}/rules/{stem}.mdc");
    expect(m!.transform).toBe("cursor-frontmatter");
  });

  it("returns undefined when tool doesn't support kind", () => {
    // claude-code supports rule, skill, instruction — not a custom kind
    const m = reg.resolveMapping("claude-code", "unknown-kind");
    expect(m).toBeUndefined();
  });

  it("throws on duplicate kind registration", () => {
    expect(() => reg.registerKind(ruleKind)).toThrow(/already registered/);
  });

  it("throws on duplicate tool registration", () => {
    expect(() => reg.registerTool(claudeCodeTool)).toThrow(/already registered/);
  });
});

describe("Registry.resolveMapping — defaultTargets fallback", () => {
  it("falls back to kind.defaultTargets when tool has no override", () => {
    const customKind = {
      id: "myteam.prompt",
      detect: (rel: string) => rel.startsWith("prompts/"),
      layout: "file" as const,
      defaultTargets: {
        "claude-code": { path: "{base}/prompts/{stem}.md" },
      },
    };
    reg.registerKind(customKind);

    // Register a tool that supports the custom kind but has no target override
    reg.registerTool({
      name: "claude-code",
      basePath: { global: "/tmp/global", project: ".claude" },
      supports: ["rule", "skill", "instruction", "myteam.prompt"],
    });

    const m = reg.resolveMapping("claude-code", "myteam.prompt");
    expect(m).toBeDefined();
    expect(m!.path).toBe("{base}/prompts/{stem}.md");
  });
});
