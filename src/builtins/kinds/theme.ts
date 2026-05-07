import type { KindSpec } from "../../core/registry.js";

export const themeKind: KindSpec = {
  id: "theme",
  description: "TUI color themes (JSON).",
  detect: (rel) => rel.startsWith("themes/") && rel.endsWith(".json"),
  layout: "file",
  defaultTargets: {},
};
