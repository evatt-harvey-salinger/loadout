import type { KindSpec } from "../../core/registry.js";

export const promptKind: KindSpec = {
  id: "prompt",
  description: "Prompt templates that expand via /name commands.",
  detect: (rel) => rel.startsWith("prompts/") && rel.endsWith(".md"),
  layout: "file",
  defaultTargets: {},
};
