# Loadout Extensibility — Design Plan

**Status:** Proposed
**Last updated:** 2026-05-04
**Owner:** core team
**Supersedes (partial):** the closed `Tool` / `ArtifactKind` unions in `src/core/types.ts`

---

## 1. Goal

Make custom artifact types and tool integrations **first-class extension points**, available without forking. Two layers, both are core capabilities:

1. **Declarative kinds via YAML** — most teams need to map a directory of files to a per-tool output path. They should never write code to do this.
2. **Programmatic plugins via JS/TS modules** — when the YAML model is too thin (custom render logic, conditional transforms, hooks, validators), drop down to code without leaving the framework.

Both layers go through the **same registry** the four built-in tools and three built-in kinds use. There is no second-class extension path.

---

## 2. Design Principles

1. **Eat our own dogfood.** Built-ins (`claude-code`, `cursor`, `opencode`, `codex`, and the `rule` / `skill` / `instruction` kinds) are implemented through the public extension API. If a plugin can't do it, the built-ins also can't — and we'd notice immediately.

2. **YAML before JS.** A team adding a new `prompts/` directory should not need to know TypeScript. The plugin API exists for the long tail.

3. **Open types, validated at runtime.** `Tool` and `ArtifactKind` become opaque strings backed by registries. Schemas are generated from registry contents at startup, so validation stays strict per-run.

4. **Capabilities, not globals.** Plugins receive a `PluginAPI` argument and never reach into module-scope state. This makes plugins testable, sandboxable, and cancellable.

5. **Versioned API.** The plugin contract has an explicit `apiVersion`. We never break v1 silently.

6. **Trust is opt-in.** Project-level plugins are arbitrary code. We require explicit trust before loading.

---

## 3. The Two-Layer Model — Concrete Examples

### 3a. YAML kind (declarative, ~90% of cases)

A team wants to share a `prompts/` directory across all their tools.

**`.loadout/kinds/prompt.yaml`:**

```yaml
id: myteam.prompt
description: Reusable prompt snippets shared across tools.

# How loadout recognizes files of this kind in .loadout/
detect:
  pathPrefix: prompts/

# Default layout: one source file → one output file.
# Alternative: "dir" for skill-style directories.
layout: file

# Per-tool output mapping. Tools not listed simply ignore this kind.
# `{base}` = adapter.basePath[scope]; `{stem}` = filename without ext;
# `{ext}` = source extension (overridable below).
targets:
  claude-code:
    path: "{base}/prompts/{stem}{ext}"
  cursor:
    path: "{base}/prompts/{stem}{ext}"
    ext: .mdc            # cursor wants its own extension
  opencode:
    path: "{base}/prompts/{stem}{ext}"
  # codex omitted → codex doesn't get prompts
```

That's the entire feature. After dropping this file in, `loadout apply` picks up `.loadout/prompts/*.md`, classifies them as `myteam.prompt`, and writes them to `.claude/prompts/`, `.cursor/prompts/` (with `.mdc`), and `.opencode/prompts/`.

A more advanced YAML example (transforms via named, registered transforms):

```yaml
id: myteam.command
detect:
  pathPrefix: commands/
layout: file
targets:
  claude-code:
    path: "{base}/commands/{stem}.md"
    transform: strip-frontmatter   # name resolved via plugin registry
  cursor:
    path: "{base}/commands/{stem}.md"
```

### 3b. JS/TS plugin (fine control)

A team has a tool that writes JSON, needs conditional logic, runs a post-apply hook to invalidate a cache, and registers a custom validator.

**`.loadout/plugins/myteam.ts`:**

```ts
import type { Plugin } from "loadout/plugin";

export default {
  apiVersion: 1,
  name: "myteam-internal",

  register(api) {
    // 1. Add a new tool
    api.registerTool({
      name: "internal-agent",
      basePath: {
        global: "~/.internal-agent",
        project: ".internal-agent",
      },
      supports: ["rule", "instruction", "myteam.prompt"],

      // Per-kind output overrides. Falls back to the kind's default targets.
      targets: {
        rule: { path: "{base}/rules/{stem}.json", transform: mdToJson },
        instruction: { path: "{base}/system.json", transform: mdToJson },
      },

      validate: async (scope) => ({
        valid: true,
        warnings: [],
        errors: [],
      }),
    });

    // 2. Register a transform that YAML kinds can reference by name
    api.registerTransform("strip-frontmatter", (raw) =>
      raw.replace(/^---\n[\s\S]*?\n---\n/, "")
    );

    // 3. Hook into the lifecycle
    api.registerHook("post-apply", async (ctx, plan) => {
      if (plan.outputs.some((o) => o.spec.tool === "internal-agent")) {
        await invalidateAgentCache();
      }
    });
  },
} satisfies Plugin;

function mdToJson(raw: string) { /* ... */ }
async function invalidateAgentCache() { /* ... */ }
```

---

## 4. Core Primitives

The whole system rests on three registries and a small public API.

### 4.1 The registries

```ts
// src/core/registry.ts (new file)

export interface KindSpec {
  id: string;                              // "rule", "myteam.prompt"
  description?: string;
  detect: (relativePath: string) => boolean;
  layout: "file" | "dir";
  defaultTargets?: Record<string, OutputMapping>;  // by tool name
}

export interface OutputMapping {
  path: string;                            // template string
  ext?: string;                            // overrides source ext
  mode?: OutputMode;
  transform?: string | TransformFn;        // name (registered) or inline fn
  generate?: GenerateFn;                   // mutually exclusive with transform
}

export interface ToolSpec {
  name: string;
  basePath: Record<Scope, string>;
  supports: string[];                      // kind ids
  targets?: Record<string, OutputMapping>; // tool-specific overrides
  validate?: (scope: Scope) => Promise<ValidationResult>;
}

export type TransformFn = (raw: string, ctx: TransformContext) => string;
export type GenerateFn = (item: ResolvedItem, ctx: GenerateContext) => string;
export type HookFn = (ctx: CommandContext, plan: RenderPlan) => Promise<void>;

export class Registry {
  registerTool(spec: ToolSpec): void;
  registerKind(spec: KindSpec): void;
  registerTransform(name: string, fn: TransformFn): void;
  registerHook(event: HookEvent, fn: HookFn): void;

  getTool(name: string): ToolSpec | undefined;
  getKind(id: string): KindSpec | undefined;
  getTransform(name: string): TransformFn | undefined;
  hooks(event: HookEvent): HookFn[];

  inferKind(relativePath: string): string | undefined;
  resolveMapping(toolName: string, kindId: string): OutputMapping | undefined;
}
```

The registry is **the single source of truth at runtime**. Built-ins, YAML kinds, and JS plugins all populate the same instance.

### 4.2 The plugin contract

```ts
// src/core/plugin.ts (new file, exported as `loadout/plugin`)

export interface Plugin {
  apiVersion: 1;
  name: string;
  register(api: PluginAPI): void | Promise<void>;
}

export interface PluginAPI {
  registerTool(spec: ToolSpec): void;
  registerKind(spec: KindSpec): void;
  registerTransform(name: string, fn: TransformFn): void;
  registerHook(event: HookEvent, fn: HookFn): void;

  // Read-only views — useful for plugins that extend other plugins.
  getKind(id: string): KindSpec | undefined;
  getTool(name: string): ToolSpec | undefined;

  // Stable utility surface so plugins don't reach into private modules.
  utils: {
    readFile, hashContent, hashDir, parseFrontmatter, /* ... */
  };
}

export type HookEvent =
  | "pre-apply" | "post-apply"
  | "pre-render" | "post-render"
  | "pre-clean" | "post-clean";
```

### 4.3 Open types

```ts
// src/core/types.ts — diff
- export type Tool = "claude-code" | "cursor" | "opencode" | "codex";
+ export type Tool = string & { readonly __brand: "Tool" };

- export type ArtifactKind = "rule" | "skill" | "instruction";
+ export type ArtifactKind = string & { readonly __brand: "ArtifactKind" };
```

Branded strings give us call-site type safety without enumeration. Validation moves to the registry.

### 4.4 Path templates

A tiny template engine, no dependency. Variables:

| Token | Meaning |
|---|---|
| `{base}` | `tool.basePath[scope]` |
| `{root}` | project root or `$HOME` (depending on scope) |
| `{relative}` | source path relative to `.loadout/` |
| `{stem}` | basename without extension |
| `{ext}` | mapping ext or source ext, with the dot |
| `{name}` | basename including extension |
| `{kind}` | kind id |

Fail loud on unknown tokens. ~30 LOC implementation.

---

## 5. How Built-ins Use This (Dogfooding)

Today, `src/tools/{claude,cursor,opencode,codex}.ts` plus `src/tools/adapter.ts` is the closed system. After this plan:

```
src/builtins/
  kinds/
    rule.ts         # registers the "rule" kind
    skill.ts        # registers the "skill" kind
    instruction.ts  # registers the "instruction" kind
  tools/
    claude-code.ts  # registers the "claude-code" tool
    cursor.ts
    opencode.ts
    codex.ts
  index.ts          # default export: a Plugin that registers all of them
```

`src/builtins/index.ts` is itself a `Plugin`. The CLI bootstrap:

```ts
const registry = new Registry();
await loadPlugin(registry, builtinsPlugin);          // built-ins
await loadYamlKinds(registry, ".loadout/kinds/");    // declarative
await loadPlugins(registry, ".loadout/plugins/");    // user code (with trust)
```

**`src/tools/adapter.ts` and the per-tool files go away.** The factory's logic moves into the renderer, which now consults the registry per `(tool, kind)` pair.

---

## 6. Plugin Discovery, Loading, and Trust

### Discovery order
1. Built-ins (`src/builtins/`)
2. YAML kinds in `<scope-root>/.loadout/kinds/*.yaml`
3. JS/TS plugins in `<scope-root>/.loadout/plugins/*.{js,mjs,ts}`

For project scope, also walk up the directory tree (matching the existing loadout root discovery).

### Trust model

JS/TS plugins are arbitrary code. Two-stage trust:

1. **First-load gate.** On first encounter, `loadout` shows the plugin path + checksum and asks the user to trust. Trust is recorded in `~/.config/loadout/trusted-plugins.json` keyed by `(absolute path, content hash)`.

2. **CI / scripted use.** A `--trust-plugins` flag bypasses the prompt; intended for environments where the repo is already vetted (post-checkout in CI). A `--no-plugins` flag disables the third tier entirely.

Commands:
- `loadout plugins list` — show registered plugins, source, trust status
- `loadout plugins trust <path>` — pre-trust
- `loadout plugins untrust <path>`

YAML kinds are **not** code and don't go through the trust gate. They're validated by zod at load time.

### TS support

Two options, decide at implementation time:

- **(A) Pre-compile.** Plugins must ship as `.js` or `.mjs`. Simplest; matches Node's native loader. Teams who write TS use their own build step.
- **(B) Runtime transpile via `tsx` or `jiti`.** Adds a dependency but lets teams ship `.ts` directly. Better DX.

Recommendation: **(A) for v1**, with a clear migration path to (B) if it becomes friction.

---

## 7. Hooks

Hooks let plugins observe and react without expanding the kind/tool model. Six events cover everything:

| Event | When | Use case |
|---|---|---|
| `pre-apply` | Before any output is written | Validation, dependency checks |
| `post-apply` | After all outputs written, state saved | Cache invalidation, notifications |
| `pre-render` | Per-output, before render | Conditional skip, telemetry |
| `post-render` | Per-output, after render | Linting rendered content |
| `pre-clean` | Before `remove`/`global clean` | Backup |
| `post-clean` | After cleanup | Telemetry |

Hooks are async, run in registration order, errors abort the operation (configurable later).

---

## 8. Schemas Become Dynamic

Today: `core/schema.ts` hardcodes `z.enum(["claude-code", "cursor", ...])`.

After: schemas are constructed from the registry at startup:

```ts
// src/core/schema.ts (new shape)
export function buildSchemas(registry: Registry) {
  const ToolSchema = z.string().refine(
    (s) => registry.getTool(s) !== undefined,
    { message: "Unknown tool. Register it via plugin or built-in." },
  );
  const KindSchema = z.string().refine(
    (s) => registry.getKind(s) !== undefined,
    { message: "Unknown artifact kind." },
  );
  return { ToolSchema, KindSchema, /* ... composed schemas ... */ };
}
```

Validation stays strict for any given run; the universe is just no longer compile-time fixed.

---

## 9. Migration Roadmap

Five phases, each independently shippable. **No behavior change before phase 4.**

### Phase 1 — Internalize the registry (no API exposure yet)
- Add `core/registry.ts` with `Registry`, `KindSpec`, `ToolSpec`, `OutputMapping`.
- Move the four tool adapters and three implicit kinds into `src/builtins/`, registering through the new registry.
- Renderer/resolver consult the registry instead of importing tool modules directly.
- `Tool` and `ArtifactKind` types remain string-literal unions (compile-time same).
- **Deliverable:** identical CLI behavior, all logic flows through registry. ~1 day.

### Phase 2 — Open the types
- Convert `Tool` / `ArtifactKind` to branded strings.
- Convert `core/schema.ts` to the dynamic builder.
- Add `inferKind(relativePath)` driven by registered kinds' `detect` predicates instead of the hardcoded `inferArtifactKind`.
- **Deliverable:** unions are no longer the gating mechanism; only the registry is. ~half day.

### Phase 3 — Path templates + per-(tool, kind) mapping resolution
- Implement the template engine.
- Move output path construction out of the per-kind switch in `adapter.ts` and into a generic `resolveOutput(toolSpec, kindSpec, item)`.
- Built-ins now declare their mappings as data, not code.
- **Deliverable:** zero per-kind switch statements remain anywhere outside built-in declarations. ~1 day.

### Phase 4 — YAML kinds
- Add `core/kindLoader.ts` reading `<root>/.loadout/kinds/*.yaml`.
- Zod schema for the YAML format.
- Wire into bootstrap.
- New CLI: `loadout kinds list`.
- **Deliverable:** shippable v1 of declarative custom kinds. ~1 day.

### Phase 5 — JS plugins + trust + hooks
- Add `core/pluginLoader.ts`, `PluginAPI`, dynamic import.
- Trust storage + prompts + `loadout plugins` subcommand.
- Hook dispatch in renderer/applier.
- Document the public `loadout/plugin` entry point in `package.json` exports.
- **Deliverable:** shippable v1 of code plugins. ~2 days.

**Total estimate:** ~5 working days for the full system, but each phase is independently valuable. Phases 1–3 are pure refactor and can land before any external API commitment.

---

## 10. Tradeoffs and Explicit Non-Goals

### Tradeoffs we accept
- **Compile-time loss of `Tool`/`ArtifactKind` enums.** In exchange for openness, the TS compiler no longer catches typos in tool/kind names. Mitigated by runtime registry validation and good error messages.
- **A small template engine.** Doesn't justify a dependency, but is one more thing to maintain.
- **Trust prompt friction.** First-time UX cost for every project with plugins. Mitigated by `--trust-plugins` for CI and per-repo trust persistence.

### Non-goals (v1)
- **Sandboxing plugin code.** Node has no real sandbox; pretending otherwise is worse than honesty. Trust gate + checksum + `--no-plugins` is the safety story for v1.
- **A plugin marketplace / registry server.** Out of scope. Plugins ship in repos or via `npm install`.
- **Hot reload.** Plugins load once per command invocation.
- **Plugin-to-plugin dependencies.** A plugin can read other registered tools/kinds (already in API), but we won't build a dependency graph or load-order arbitration in v1. First-registered wins; conflicts are warnings.

---

## 11. Open Questions

1. **TS plugins — pre-compile or runtime transpile?** (See §6. Default: pre-compile.)
2. **Plugin scope — per-loadout or per-root?** Currently designed as per-root. A plugin loaded at `.loadout/plugins/x.ts` registers globally for that root. Alternative: loadout YAML files could opt into specific plugins. Defer until needed.
3. **Hook error policy.** Abort vs. continue-with-warning vs. configurable per hook. Default: abort, escalate to configurable when the first user complains.
4. **Built-in kind extensibility.** Should a plugin be able to *modify* the built-in `rule` kind (e.g., add a new tool target)? Yes via `registerTool(... targets: { rule: ... })`. Should it be able to *replace* the built-in kind? No — register a new kind id instead.
5. **Naming.** `myteam.prompt` (dot-namespaced) is convention but not enforced. Should we enforce a namespace pattern to avoid collisions? Lean yes; warn on unnamespaced custom kinds, error on collision with built-ins.
6. **`apiVersion` evolution.** When v2 ships, do we keep loading v1 plugins? Yes for at least one major version. Document a deprecation policy when v2 appears.

---

## 12. Decision Log (to be filled as we build)

- [x] Registry data model approved
- [x] `Tool`/`ArtifactKind` open-typed
- [x] Path template tokens finalized
- [x] YAML kind schema frozen
- [ ] Plugin API v1 frozen
- [ ] Trust storage format frozen
- [ ] Hook events frozen

---

## 13. Testing & Verification

### Unit Tests

The YAML kind loader has comprehensive test coverage in `src/core/kindLoader.test.ts`:

- **Parsing**: Valid YAML, invalid YAML, missing fields, schema validation
- **Detection**: `pathPrefix` and `pathExact` matching logic
- **Template variables**: `{base}`, `{stem}`, `{ext}` expansion
- **Multi-tool support**: Different paths/extensions per tool
- **Loading**: Multiple kinds, error recovery, non-YAML file skipping
- **Registry integration**: Kind registration, duplicate handling

Run with: `npm run test:run`

### Manual Verification

#### 1. Check registered kinds

```bash
# List all kinds (custom kinds tagged with "(custom)")
loadout kinds

# Show detailed info including targets
loadout kinds --verbose
```

Expected output for a custom kind:
```
myteam.prompt (custom)
  Reusable prompt snippets shared across tools.
  layout: file
  tools: claude-code, cursor, opencode
  defaultTargets:
    claude-code: {base}/prompts/{stem}{ext}
    cursor: {base}/prompts/{stem}.mdc
    opencode: {base}/prompts/{stem}{ext}
```

#### 2. Test end-to-end with a real artifact

```bash
# Create a custom kind
cat > .loadout/kinds/snippet.yaml << 'EOF'
id: myteam.snippet
description: Code snippets for quick reference
detect:
  pathPrefix: snippets/
layout: file
targets:
  claude-code:
    path: "{base}/snippets/{stem}.md"
  cursor:
    path: "{base}/snippets/{stem}.mdc"
    ext: .mdc
EOF

# Create a test snippet
mkdir -p .loadout/snippets
echo "# Helper Function" > .loadout/snippets/helper.md

# Apply
loadout apply --tool claude-code --scope project

# Verify output
cat .claude/snippets/helper.md
```

#### 3. Test with cursor (extension override)

```bash
loadout apply --tool cursor --scope project

# Should have .mdc extension
cat .cursor/snippets/helper.mdc
```

### Common Issues

**Kind not appearing in `loadout kinds`**
- Check YAML syntax (use `yamllint` or a YAML validator)
- Ensure file has `.yaml` or `.yml` extension
- Check console for parse errors

**Files not being detected**
- Verify `pathPrefix` or `pathExact` matches your source files
- Path must be relative to `.loadout/` directory
- Use `loadout kinds --verbose` to see detection rules

**Wrong output path**
- Review template variables in `path` field
- Check tool's `basePath` configuration
- Verify scope (project vs global)

**Collision warnings**
- Dot-namespaced IDs (`myteam.prompt`) are recommended
- Built-in kinds (`rule`, `skill`, `instruction`) always take precedence
- Non-namespaced custom kinds trigger a warning

### Smoke Test Checklist

- [ ] Unit tests pass (`npm run test:run`)
- [ ] Custom kinds appear in `loadout kinds` with "(custom)" tag
- [ ] `loadout kinds --verbose` shows targets correctly
- [ ] Files matching `detect` rules are classified correctly
- [ ] `loadout apply` creates outputs in correct locations
- [ ] Per-tool customization (paths, extensions) works
- [ ] Extension override (`ext: .mdc`) changes output extension
- [ ] Invalid YAML shows clear error messages
- [ ] Parse errors don't crash the loader
- [ ] Multiple kinds in one project load successfully
