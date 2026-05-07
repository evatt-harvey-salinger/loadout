import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { estimateTokens, formatTokens, extractSkillDescription, estimateSkillUpfrontTokens } from "./tokens.js";

const FIXTURES = path.join(process.cwd(), "test-fixtures");

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    const text = "Hello, world!"; // 13 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBe(4); // ceil(13/4) = 4
  });

  it("handles empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles long text", () => {
    const text = "a".repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });
});

describe("formatTokens", () => {
  it("formats small numbers", () => {
    expect(formatTokens(500)).toBe("500 tokens");
  });

  it("formats thousands with k suffix", () => {
    expect(formatTokens(2500)).toBe("2.5k tokens");
  });

  it("formats large numbers", () => {
    expect(formatTokens(10000)).toBe("10.0k tokens");
  });
});

describe("extractSkillDescription", () => {
  it("extracts description from SKILL.md frontmatter", () => {
    const skillDir = path.join(FIXTURES, "skills", "test-skill");
    const desc = extractSkillDescription(skillDir);
    expect(desc).toBe("A test skill for unit testing the token estimation functions.");
  });

  it("returns undefined for missing SKILL.md", () => {
    const desc = extractSkillDescription("/nonexistent/path");
    expect(desc).toBeUndefined();
  });

  it("returns undefined for SKILL.md without description", () => {
    // skills/test-skill has description, so test a non-existent skill
    const desc = extractSkillDescription(FIXTURES);
    expect(desc).toBeUndefined();
  });
});

describe("estimateSkillUpfrontTokens", () => {
  it("estimates tokens for skill description + overhead", () => {
    const skillDir = path.join(FIXTURES, "skills", "test-skill");
    const tokens = estimateSkillUpfrontTokens(skillDir);
    // Description is ~63 chars = ~16 tokens, plus ~13 overhead tokens
    expect(tokens).toBeGreaterThan(15);
    expect(tokens).toBeLessThan(50);
  });

  it("returns 0 for missing skill", () => {
    const tokens = estimateSkillUpfrontTokens("/nonexistent/path");
    expect(tokens).toBe(0);
  });
});
