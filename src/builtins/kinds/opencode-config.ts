import type { KindSpec } from "../../core/registry.js";

export const opencodeConfigKind: KindSpec = {
  id: "opencode-config",
  description: "Whole-file OpenCode runtime configuration.",
  detect: (rel) =>
    rel === "opencode/opencode.json" || rel === "opencode/opencode.jsonc",
  layout: "file",
  defaultTargets: {},
};
