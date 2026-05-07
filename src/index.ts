#!/usr/bin/env node

/**
 * Loadout CLI entry point.
 *
 * Bootstrap order:
 *   1. Register built-in kinds, transforms, and tools.
 *   2. (Phase 4+) YAML kinds loaded per-command after root discovery.
 *   3. Parse and dispatch CLI commands.
 */

import { registry } from "./core/registry.js";
import { createPluginAPI } from "./core/plugin.js";
import { registerBuiltins } from "./builtins/index.js";
import { cli } from "./cli/index.js";

const api = createPluginAPI(registry);
registerBuiltins(api);

cli.parse();
