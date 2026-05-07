import type { KindSpec } from "../../core/registry.js";

export const instructionKind: KindSpec = {
  id: "instruction",
  description: "Always-on project instructions (AGENTS.md).",
  detect: (rel) => rel.startsWith("instructions/AGENTS.") && rel.endsWith(".md"),
  layout: "file",
  defaultTargets: {},
};
