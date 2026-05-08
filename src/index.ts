#!/usr/bin/env node

/**
 * Loadout CLI entry point.
 *
 * Bootstrap order:
 *   1. Check for updates (non-blocking background check).
 *   2. Register built-in kinds, transforms, and tools.
 *   3. (Phase 4+) YAML kinds loaded per-command after root discovery.
 *   4. Parse and dispatch CLI commands.
 */

import { createRequire } from "module";
import updateNotifier from "update-notifier";
import { registry } from "./core/registry.js";
import { createPluginAPI } from "./core/plugin.js";
import { registerBuiltins } from "./builtins/index.js";
import { cli } from "./cli/index.js";

// Check for updates in background (cached, checks at most once per day)
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
updateNotifier({ pkg }).notify();

const api = createPluginAPI(registry);
registerBuiltins(api);

cli.parse();
