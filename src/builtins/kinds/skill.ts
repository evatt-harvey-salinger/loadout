import type { KindSpec } from "../../core/registry.js";

export const skillKind: KindSpec = {
  id: "skill",
  description: "AgentSkill directories (reusable sub-agents).",
  detect: (rel) => rel.startsWith("skills/"),
  layout: "dir",
  defaultTargets: {},
};
