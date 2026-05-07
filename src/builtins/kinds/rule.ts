import type { KindSpec } from "../../core/registry.js";

export const ruleKind: KindSpec = {
  id: "rule",
  description: "Scoped advisory rules for AI coding agents.",
  detect: (rel) => rel.startsWith("rules/"),
  layout: "file",
  // defaultTargets intentionally empty — each built-in tool defines its own
  // mapping via targets.rule so it can customise extension and transform.
  defaultTargets: {},
};
