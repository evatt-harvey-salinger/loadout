/**
 * Plugin API — the public surface through which built-ins, YAML kinds, and
 * future JS plugins register capabilities into the registry.
 *
 * External plugins import from "loadout/plugin" (see package.json exports).
 * The `apiVersion` field guards against breaking API changes.
 */

import type { Registry, KindSpec, ToolSpec, TransformFn, HookEvent, HookFn } from "./registry.js";

/** Versioned plugin API passed to each plugin's register() function. */
export interface PluginAPI {
  readonly apiVersion: 1;
  registerKind(spec: KindSpec): void;
  registerTool(spec: ToolSpec): void;
  registerTransform(name: string, fn: TransformFn): void;
  registerHook(event: HookEvent, fn: HookFn): void;
  /** Read-only access — useful for plugins that extend or inspect others. */
  getKind(id: string): KindSpec | undefined;
  getTool(name: string): ToolSpec | undefined;
}

/** Create a PluginAPI that delegates to the given registry. */
export function createPluginAPI(reg: Registry): PluginAPI {
  return {
    apiVersion: 1,
    registerKind: (spec) => reg.registerKind(spec),
    registerTool: (spec) => reg.registerTool(spec),
    registerTransform: (name, fn) => reg.registerTransform(name, fn),
    registerHook: (event, fn) => reg.registerHook(event, fn),
    getKind: (id) => reg.getKind(id),
    getTool: (name) => reg.getTool(name),
  };
}
