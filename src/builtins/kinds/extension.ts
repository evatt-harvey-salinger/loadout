import type { KindSpec } from "../../core/registry.js";

export const extensionKind: KindSpec = {
  id: "extension",
  description: "TypeScript runtime extensions.",
  detect: (rel) =>
    rel.startsWith("extensions/") &&
    (rel.endsWith(".ts") || rel.endsWith(".js")),
  layout: "file",
  defaultTargets: {},
};
