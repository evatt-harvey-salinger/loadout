import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "./config.js";

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter", () => {
    const content = `---
description: Test rule
paths: ["**/*.ts"]
---

Body content here.
`;
    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter.description).toBe("Test rule");
    expect(frontmatter.paths).toEqual(["**/*.ts"]);
    expect(body).toBe("\nBody content here.\n");
  });

  it("handles missing frontmatter", () => {
    const content = "Just body content.";
    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toEqual({});
    expect(body).toBe("Just body content.");
  });
});

describe("serializeFrontmatter", () => {
  it("serializes frontmatter and body", () => {
    const frontmatter = { description: "Test", paths: ["**/*.ts"] };
    const body = "\nBody content.\n";

    const result = serializeFrontmatter(frontmatter, body);

    expect(result).toContain("description: Test");
    expect(result).toContain("Body content.");
  });

  it("returns body only when frontmatter is empty", () => {
    const result = serializeFrontmatter({}, "Body only.");
    expect(result).toBe("Body only.");
  });
});


