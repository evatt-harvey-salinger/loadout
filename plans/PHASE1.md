# Phase 1: Foundation — Implementation Plan

**Parent:** [VISION.md](./VISION.md)  
**Version:** 0.1  
**Last Updated:** 2026-05-02

---

## Goal

Safe apply/remove workflow on top of one generic resolver and renderer. At the end of Phase 1 you can: resolve a loadout, preview changes, apply it safely (symlink or copy), and remove only owned outputs.

**Exit criteria from VISION.md:**
> Can resolve a loadout, preview changes, apply it safely, and remove only owned outputs.

---

## Stack Decisions

These decisions are locked in for Phase 1. Rationale is inline.

| Category | Choice | Why |
|----------|--------|-----|
| Language | TypeScript (strict, ESM) | Type safety, ecosystem, Zod integration |
| Runtime | Bun (dev + binary), Node 20+ (npm package) | Bun binary is primary distribution; npm package for ecosystem reach |
| Package manager | Bun | Fast installs, native to our primary target |
| CLI framework | **Commander** | Handles nested subcommands well, lightweight, well-known |
| Testing | **Vitest** | Better DX than bun test — snapshots, mocking, watch mode |
| Build (npm) | **tsup** | Single-command CLI builds, handles CJS/ESM |
| Build (binary) | **bun build --compile** | Zero-dependency standalone binary |
| Schema validation | **Zod** | Ecosystem standard, excellent for YAML config validation |
| YAML parsing | **yaml** (npm: `yaml`) | YAML 1.2, well-typed, actively maintained |
| Frontmatter | **gray-matter** | Battle-tested, handles edge cases |
| Terminal output | **picocolors** | 14x smaller than chalk, sufficient API for our needs |
| Hashing | **Node crypto** (built-in) | SHA-256, no dependency needed |
| Token estimation | **Chars/4 heuristic** | Lightweight, no WASM (tiktoken has bun compile issues), "close enough" per VISION |
| Error handling | **Result types** in core, thrown errors at CLI boundary | Composable pipeline, clean testing, simple CLI surface |

### Distribution Model

1. **npm package** — `npm i -g loadout` or `npx loadout`
2. **Bun binary** — standalone executables via GitHub Releases (primary)
3. Binary built with `bun build src/index.ts --compile --minify --sourcemap --outfile dist/loadout`

### Key Conventions

- **ESM-only** — no CJS in source. tsup handles CJS output for npm if needed.
- **No Bun-specific APIs** — write standard Node-compatible TypeScript so the npm package works on Node 20+.
- **Relative symlinks** — more portable across machines than absolute paths.
- **`src/adapters/`** not `src/tools/` — the VISION calls them "tool adapters" throughout; the directory name should match the concept. (Deviation from VISION's directory listing, noted here.)

---

## Directory Structure

```
loadout/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── AGENTS.md                    # Project-level agent instructions
├── MEMORY.md                    # Project engineering context
├── plans/
│   ├── VISION.md
│   └── PHASE1.md                # This document
├── src/
│   ├── index.ts                 # CLI entry point (bin target)
│   ├── core/
│   │   ├── types.ts             # Core type definitions
│   │   ├── result.ts            # Result<T, E> type + helpers
│   │   ├── errors.ts            # Typed error codes and constructors
│   │   ├── schema.ts            # Zod schemas for all config formats
│   │   ├── discovery.ts         # Find .loadout/ dirs (cwd → git root)
│   │   ├── config.ts            # Parse loadout.yaml and loadout definitions
│   │   ├── resolve.ts           # Resolve loadout graph (extends, includes)
│   │   ├── render.ts            # Generic render pipeline
│   │   ├── manifest.ts          # Ownership state (.state.json) and drift
│   │   └── tokens.ts            # Token estimation (chars/4 heuristic)
│   ├── adapters/
│   │   ├── types.ts             # Adapter interface definition
│   │   ├── registry.ts          # Adapter registry + lookup
│   │   ├── claude.ts            # Claude Code adapter
│   │   ├── cursor.ts            # Cursor adapter
│   │   ├── opencode.ts          # OpenCode adapter
│   │   └── codex.ts             # Codex adapter
│   ├── cli/
│   │   ├── index.ts             # Commander program setup
│   │   └── commands/
│   │       ├── init.ts
│   │       ├── apply.ts
│   │       ├── remove.ts
│   │       ├── create.ts
│   │       ├── list.ts
│   │       └── check.ts
│   └── lib/
│       ├── fs.ts                # FS helpers (relative symlinks, safe write)
│       ├── git.ts               # Git root detection
│       └── output.ts            # Terminal output helpers (picocolors)
├── tests/
│   ├── core/
│   │   ├── discovery.test.ts
│   │   ├── config.test.ts
│   │   ├── resolve.test.ts
│   │   ├── render.test.ts
│   │   ├── manifest.test.ts
│   │   └── tokens.test.ts
│   ├── adapters/
│   │   ├── claude.test.ts
│   │   ├── cursor.test.ts
│   │   ├── opencode.test.ts
│   │   └── codex.test.ts
│   ├── cli/
│   │   └── integration.test.ts  # End-to-end CLI tests
│   └── fixtures/
│       └── ...                  # .loadout/ dirs for testing
└── .loadout/                    # Dogfooding: loadout uses itself (Phase 2+)
```

---

## Implementation Steps

Each step is designed to be independently testable. Steps within a group can often be parallelized by separate agents.

### Step 0: Project Bootstrap

**Creates:** `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `AGENTS.md`

**Details:**

- `bun init` then customize `package.json`:
  - `"name": "loadout"`, `"type": "module"`, `"bin": { "loadout": "./dist/index.js" }`
  - Scripts: `build` (tsup), `build:binary` (bun compile), `dev` (tsx watch), `test` (vitest), `typecheck` (tsc --noEmit)
- `tsconfig.json`: strict, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`
- `tsup.config.ts`: entry `src/index.ts`, format `esm`, target `node20`, clean, dts
- `vitest.config.ts`: basic setup
- `.gitignore`: `node_modules/`, `dist/`, `.loadout/.state.json`
- Install deps: `commander`, `zod`, `yaml`, `gray-matter`, `picocolors`
- Install dev deps: `typescript`, `tsup`, `vitest`, `@types/node`
- Create `AGENTS.md` with project-specific coding conventions

**Verify:** `bun install && bun run typecheck` succeeds. `bun run build` produces `dist/index.js`.

---

### Step 1: Result Type and Error System

**Creates:** `src/core/result.ts`, `src/core/errors.ts`

**Details:**

`result.ts` — A simple discriminated union with helpers:

```typescript
type Result<T, E = LoadoutError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never>;
function err<E>(error: E): Result<never, E>;
function fromThrowable<T>(fn: () => T): Result<T, LoadoutError>;
```

`errors.ts` — Typed error codes for every failure mode Phase 1 needs:

```typescript
type ErrorCode =
  | "COLLISION"          // unmanaged file would be overwritten
  | "MISSING_SOURCE"     // referenced file doesn't exist
  | "CIRCULAR_EXTENDS"   // loadout extends chain has a cycle
  | "INVALID_CONFIG"     // YAML/schema validation failed
  | "NO_GIT_ROOT"        // not in a git repository
  | "NO_LOADOUT"         // no .loadout/ directory found
  | "ALREADY_APPLIED"    // a loadout is already active
  | "NOTHING_APPLIED"    // no loadout to remove
  | "UNKNOWN_TOOL"       // unrecognized tool name
  | "UNKNOWN_LOADOUT"    // loadout name not found
  | "ADAPTER_ERROR";     // tool adapter reported an error

interface LoadoutError {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}
```

**Verify:** Unit tests for `ok()`, `err()`, `fromThrowable()`.

---

### Step 2: Core Types and Schemas

**Creates:** `src/core/types.ts`, `src/core/schema.ts`

**Details:**

`types.ts` — TypeScript interfaces for every data model in the VISION:

```typescript
// Tool identifiers
type ToolName = "claude-code" | "cursor" | "opencode" | "codex";

// Artifact classes
type ArtifactKind = "rule" | "skill" | "instruction";

// Root config (.loadout/loadout.yaml)
interface LoadoutConfig {
  version: string;
  default?: string;
  mode: "symlink" | "copy";
  tools: ToolName[];
}

// Loadout definition (.loadout/loadouts/<name>.yaml)
interface LoadoutDefinition {
  name: string;
  description?: string;
  extends?: string;
  tools?: ToolName[];
  include: IncludeItem[];
}

// Include item — either a simple path string or an object with tool filters
type IncludeItem = string | { path: string; tools?: ToolName[] };

// Resolved item ready for rendering
interface ResolvedItem {
  kind: ArtifactKind;
  sourcePath: string;          // relative to .loadout/
  absoluteSourcePath: string;  // fully resolved
  tools: ToolName[];           // which tools to render for
  content: string;             // raw source content
  frontmatter?: Record<string, unknown>;
}

// Output spec from an adapter
interface OutputSpec {
  tool: ToolName;
  kind: ArtifactKind;
  sourcePath: string;
  targetPath: string;          // relative to project root
  mode: "symlink" | "copy" | "generate";
  content?: string;            // only for copy/generate modes
}

// Applied state entry
interface ManifestEntry {
  tool: ToolName;
  kind: ArtifactKind;
  sourcePath: string;
  targetPath: string;
  mode: "symlink" | "copy" | "generate";
  renderedHash: string;
}

// Full manifest (.loadout/.state.json)
interface Manifest {
  loadout: string;
  mode: "symlink" | "copy";
  appliedAt: string;
  entries: ManifestEntry[];
}

// Discovered .loadout/ root
interface LoadoutRoot {
  path: string;       // absolute path to .loadout/ directory
  level: "project" | "package" | "global";
}
```

`schema.ts` — Zod schemas that validate parsed YAML against these types:

- `LoadoutConfigSchema` — validates `loadout.yaml`
- `LoadoutDefinitionSchema` — validates `loadouts/<name>.yaml`
- `RuleFrontmatterSchema` — validates rule file frontmatter (description, paths, globs)
- Apply reasonable defaults (e.g., `mode: "symlink"`, `tools: ["claude-code", "cursor", "opencode", "codex"]`)

**Verify:** Unit tests — valid configs parse, invalid configs fail with descriptive errors.

---

### Step 3: Library Utilities

**Creates:** `src/lib/git.ts`, `src/lib/fs.ts`, `src/lib/output.ts`

**Details:**

`git.ts`:
- `findGitRoot(from: string): Result<string>` — walk up from `from` looking for `.git/` directory. Return error if not found.

`fs.ts`:
- `createRelativeSymlink(source: string, target: string): Result<void>` — create symlink at `target` pointing to `source` using a relative path. Create parent dirs as needed.
- `safeWrite(path: string, content: string): Result<void>` — write file, creating parent dirs as needed.
- `safeRemove(path: string): Result<void>` — remove file. No error if missing.
- `fileHash(path: string): string` — SHA-256 of file content.
- `isOwnedByManifest(path: string, manifest: Manifest): boolean` — check if a path is in the manifest.

`output.ts`:
- Thin wrappers around picocolors for consistent output: `info()`, `success()`, `warn()`, `error()`, `dim()`.
- `printTable(rows)` — simple aligned column output for `list` command.

**Verify:** Unit tests for git root detection, symlink creation (in a temp dir), hashing.

---

### Step 4: Discovery

**Creates:** `src/core/discovery.ts`

**Details:**

- `discoverLoadoutRoots(cwd: string): Result<LoadoutRoot[]>` — walk from `cwd` up to git root. At each level, check for `.loadout/` directory. Also check `~/.config/loadout/` for global. Return ordered list (nearest first).
- Handle edge case: no git root (return error with `NO_GIT_ROOT`).
- Handle edge case: no `.loadout/` found anywhere (return error with `NO_LOADOUT`).
- Each root gets a `level` tag: `"package"` if below git root, `"project"` if at git root, `"global"` for `~/.config/loadout/`.

**Verify:** Unit tests with temp directory trees. Test cases:
1. Single .loadout/ at git root
2. Nested .loadout/ in monorepo
3. No .loadout/ found
4. No git root found

---

### Step 5: Config Parsing

**Creates:** `src/core/config.ts`

**Details:**

- `parseRootConfig(rootPath: string): Result<LoadoutConfig>` — read and parse `loadout.yaml` from a `.loadout/` directory. Validate with Zod schema. Apply defaults.
- `parseLoadoutDefinition(defPath: string): Result<LoadoutDefinition>` — read and parse a loadout definition YAML. Validate with schema.
- `parseRuleFrontmatter(filePath: string): Result<{ frontmatter, content }>` — read a rule markdown file, extract frontmatter with gray-matter, validate.
- `listAvailableLoadouts(rootPath: string): Result<LoadoutDefinition[]>` — scan `loadouts/` directory and parse all definitions.

**Verify:** Unit tests with fixture files — valid configs, missing fields (defaults applied), invalid fields (schema errors).

---

### Step 6: Loadout Resolution

**Creates:** `src/core/resolve.ts`

**Details:**

- `resolveLoadout(name: string, roots: LoadoutRoot[]): Result<ResolvedItem[]>` — the main resolver:

  1. **Find the loadout definition** — scan roots nearest-first for `loadouts/<name>.yaml`
  2. **Resolve extends chain** — if `extends: base`, find `base` in same root first, then walk up. Detect cycles (track visited names).
  3. **Collect include items** — merge includes from the full extends chain (child overrides parent for same-path items)
  4. **Classify artifacts** — determine `ArtifactKind` from path:
     - `rules/*.md` → `rule`
     - `skills/*/` → `skill`
     - `AGENTS.md` → `instruction`
  5. **Resolve file contents** — read each source file, parse frontmatter for rules
  6. **Determine tool targets** — per-item `tools` override loadout-level `tools` override config-level `tools`
  7. **Return `ResolvedItem[]`**

- Also handle the singleton instruction: if `.loadout/AGENTS.md` exists, always include it.

**Verify:** Unit tests with fixture `.loadout/` directories. Test cases:
1. Simple loadout with no extends
2. Single extends chain (child → base)
3. Two-level extends (child → mid → base)
4. Circular extends (should error)
5. Missing referenced source file (should error)
6. Per-item tool override
7. AGENTS.md auto-inclusion

---

### Step 7: Adapter Interface and Implementations

**Creates:** `src/adapters/types.ts`, `src/adapters/registry.ts`, `src/adapters/claude.ts`, `src/adapters/cursor.ts`, `src/adapters/opencode.ts`, `src/adapters/codex.ts`

**Details:**

`types.ts` — The adapter contract:

```typescript
interface ToolAdapter {
  name: ToolName;
  supports(kind: ArtifactKind): boolean;
  outputs(item: ResolvedItem, projectRoot: string): OutputSpec[];
  render(item: ResolvedItem, spec: OutputSpec): Result<string>;
  validate?(projectRoot: string): Result<void>;
}
```

`registry.ts`:
- `getAdapter(tool: ToolName): ToolAdapter`
- `getAllAdapters(): ToolAdapter[]`
- `getAdaptersForItem(item: ResolvedItem): ToolAdapter[]`

**Adapter implementations:**

| Adapter | Rules | Skills | Instructions | Key transforms |
|---------|-------|--------|-------------|----------------|
| `claude.ts` | `.claude/rules/<name>.md` (symlink) | `.claude/skills/<name>/` (symlink dir) | Generate `CLAUDE.md` wrapper that imports AGENTS.md | No frontmatter changes needed |
| `cursor.ts` | `.cursor/rules/<name>.mdc` (copy) | `.cursor/skills/<name>/` (symlink dir) | Copy `AGENTS.md` to project root | Rename `.md` → `.mdc`; ensure both `paths:` and `globs:` in frontmatter |
| `opencode.ts` | `.opencode/rules/<name>.md` (symlink) | `.opencode/skills/<name>/` (symlink dir) | Copy `AGENTS.md` to project root | `validate()` checks for `opencode-rules` plugin in `opencode.json` (warn, don't block) |
| `codex.ts` | Not supported (`supports("rule")` → false) | `.agents/skills/<name>/` (symlink dir) | Copy `AGENTS.md` to project root | Skills only + instructions |

**Key details:**
- Cursor rules are always `copy` mode (requires `.mdc` extension and potentially modified frontmatter — can't be a symlink to a `.md` file)
- Claude Code instructions generate a `CLAUDE.md` that contains an import/include of `AGENTS.md` rather than duplicating content
- OpenCode `validate()` is a warning, not a blocker — the user might configure the plugin themselves
- Skill directories are symlinked as directories (the entire `skills/<name>/` dir)

**Verify:** Unit tests per adapter — given a ResolvedItem, assert correct OutputSpec and rendered content. Test Cursor frontmatter transform specifically.

---

### Step 8: Render Pipeline

**Creates:** `src/core/render.ts`

**Details:**

- `renderLoadout(items: ResolvedItem[], projectRoot: string, config: LoadoutConfig): Result<OutputSpec[]>` — the main pipeline:

  1. For each item, get applicable adapters (filtered by item's tools list)
  2. For each adapter, call `outputs()` to get OutputSpecs
  3. For each OutputSpec, call `render()` to produce final content
  4. Populate `content` field on each OutputSpec (for copy/generate modes)
  5. Compute `renderedHash` for each output
  6. Return the full list of OutputSpecs

- This is a pure function over the resolved items — no filesystem writes.

**Verify:** Unit tests — resolve + render a fixture loadout, assert output specs are correct for all tools.

---

### Step 9: Token Estimation

**Creates:** `src/core/tokens.ts`

**Details:**

- `estimateTokens(text: string): number` — chars / 4, rounded up. Simple and fast.
- `estimateOutputTokens(specs: OutputSpec[]): Map<ToolName, number>` — group specs by tool, sum token estimates for each tool's rendered content.
- Used by `list` and `info` commands (Phase 2 for full display, but the function exists now).

**Verify:** Unit test — known string → expected estimate. Verify grouping by tool.

---

### Step 10: Ownership Manifest

**Creates:** `src/core/manifest.ts`

**Details:**

- `readManifest(loadoutRoot: string): Result<Manifest | null>` — read `.loadout/.state.json`. Return null if not found.
- `writeManifest(loadoutRoot: string, manifest: Manifest): Result<void>` — write `.state.json`.
- `deleteManifest(loadoutRoot: string): Result<void>` — remove `.state.json`.
- `checkCollisions(specs: OutputSpec[], manifest: Manifest | null, projectRoot: string): Result<void>` — for each spec, check if the target path exists AND is not in the current manifest. If so, return `COLLISION` error listing all conflicting paths.
- `detectDrift(manifest: Manifest, projectRoot: string): DriftReport` — check each manifest entry: does the file exist? Does its hash match? Report missing, modified, and clean entries.

**Verify:** Unit tests in temp dirs — write manifest, read it back, check collision detection, detect drift after modifying a file.

---

### Step 11: Apply and Remove Operations

**Creates:** `src/core/apply.ts` (new file, not in original VISION structure but the render.ts scope would be too large otherwise)

**Details:**

`applyLoadout(specs: OutputSpec[], manifest: Manifest | null, projectRoot: string, loadoutRoot: string, config: LoadoutConfig, loadoutName: string): Result<Manifest>`:

1. Run `checkCollisions()` — abort if any collisions
2. If a manifest exists (switching loadouts), remove old entries first
3. For each OutputSpec:
   - `symlink` → create relative symlink from target to source
   - `copy` → write rendered content to target
   - `generate` → write generated content to target
4. Build new manifest from successful writes
5. Write manifest to `.state.json`
6. Return new manifest

`removeLoadout(manifest: Manifest, projectRoot: string, loadoutRoot: string): Result<void>`:

1. For each manifest entry, remove the target file
2. Clean up empty parent directories (e.g., `.claude/rules/` if now empty)
3. Delete the manifest file

**Verify:** Integration tests in temp dirs:
1. Apply creates expected files (symlinks, copies)
2. Apply refuses on collision
3. Remove deletes only owned files
4. Remove cleans empty directories
5. Re-apply (switch loadouts) removes old, applies new

---

### Step 12: CLI Commands

**Creates:** `src/index.ts`, `src/cli/index.ts`, `src/cli/commands/init.ts`, `apply.ts`, `remove.ts`, `create.ts`, `list.ts`, `check.ts`

**Details:**

`src/index.ts` — Entry point:
```typescript
#!/usr/bin/env node
import { run } from "./cli/index.js";
run(process.argv);
```

`src/cli/index.ts` — Commander program:
```typescript
import { Command } from "commander";
// Register all subcommands
```

**Commands:**

#### `loadout init`
- Create `.loadout/` directory with:
  - `loadout.yaml` (default config)
  - `loadouts/` directory
  - `rules/` directory
  - `skills/` directory
- If `.loadout/` already exists, warn and exit
- Print success message with next steps

#### `loadout apply [name]`
- Discover roots, resolve loadout (default if no name), render, check collisions, apply
- `--dry-run` flag: print what would happen, don't write
- Print summary: files created, symlinks made, token estimate
- Error on collision with clear message showing which files conflict

#### `loadout remove`
- Read manifest, remove owned files, delete manifest
- Error if nothing applied
- Print summary: files removed

#### `loadout create <name>`
- Create `loadouts/<name>.yaml` with scaffold
- Prompt (or accept flags) for: description, extends, included files
- For v1, non-interactive is fine: `loadout create backend --extends base --include "rules/go.md,rules/db.md"`

#### `loadout list`
- List all available loadouts across discovered roots
- Show: name, description, item count, extends chain, token estimate
- Mark currently applied loadout

#### `loadout check`
- Validate all config files (YAML syntax, schema)
- Check all referenced source files exist
- Detect circular extends
- Dry-run collision check
- Print pass/fail for each check

**CLI error boundary:** Each command wraps its core logic in a try/catch that converts `Result` errors into user-friendly messages with exit code 1.

**Verify:** Integration tests that invoke the CLI as a subprocess and assert stdout/stderr/exit codes.

---

### Step 13: Testing and Fixtures

**Creates:** Full test suite and fixture directories

**Details:**

**Fixtures** (`tests/fixtures/`):
- `simple-project/` — git repo with single `.loadout/`, one loadout, a few rules
- `monorepo/` — git repo with root `.loadout/` and nested package `.loadout/`
- `collision-project/` — project with pre-existing `.claude/rules/` files (for collision testing)

**Test categories:**
1. **Unit tests** — each core module independently (Steps 1–10 each have their own tests)
2. **Adapter tests** — each adapter's output specs and render transforms
3. **Integration tests** — full workflows:
   - `init` → `create` → `apply` → `remove` cycle
   - Apply with dry-run
   - Collision detection
   - Monorepo discovery
   - Loadout switching (apply A, then apply B)
   - Check validation

**Verify:** `bun run test` — all green. `bun run typecheck` — no errors.

---

## Implementation Order and Dependencies

```
Step 0: Bootstrap ─────────────────────────────────────────────────────┐
  │                                                                    │
  ├─→ Step 1: Result + Errors ──┐                                     │
  │                              │                                     │
  ├─→ Step 3: Lib Utilities ────┤  (parallel group A)                 │
  │                              │                                     │
  │   Step 2: Types + Schemas ──┘                                     │
  │     │                                                              │
  │     ├─→ Step 4: Discovery ──┐                                     │
  │     │                        │  (parallel group B)                 │
  │     ├─→ Step 5: Config ─────┤                                     │
  │     │                        │                                     │
  │     └─→ Step 9: Tokens ─────┘                                     │
  │           │                                                        │
  │     Step 6: Resolution ──────────→ Step 7: Adapters               │
  │                                       │                            │
  │                                  Step 8: Render Pipeline           │
  │                                       │                            │
  │                                  Step 10: Manifest                 │
  │                                       │                            │
  │                                  Step 11: Apply/Remove             │
  │                                       │                            │
  │                                  Step 12: CLI Commands ────────────┘
  │                                       │
  └──────────────────────────────── Step 13: Testing + Fixtures
```

**Critical path:** Bootstrap → Types/Schemas → Resolution → Adapters → Render → Manifest → Apply → CLI

**Parallelizable:**
- Steps 1, 2, 3 can be done simultaneously after bootstrap
- Steps 4, 5, 9 can be done simultaneously after types/schemas
- Adapter implementations (claude, cursor, opencode, codex) can be done in parallel

---

## Scope Boundaries

### In scope for Phase 1
- `init`, `apply`, `remove`, `create`, `list`, `check` commands
- All four adapters (Claude Code, Cursor, OpenCode, Codex)
- Symlink and copy output modes
- Hierarchical discovery (cwd → git root)
- Extends resolution with cycle detection
- Collision detection (abort on unmanaged files)
- Ownership manifest for safe removal
- `--dry-run` on apply
- Token estimation function (used by list, available for info later)

### Explicitly deferred to Phase 2+
- `rule`, `skill`, `instructions` subcommand groups (authoring)
- `info`, `status`, `diff` commands (diagnostics)
- User-global loadout (`~/.config/loadout/`)
- Overlay support
- Import/adopt workflows
- Interactive prompts
- `loadout sync` for copy mode refresh

### Open question resolved for Phase 1
- **Q2 (OpenCode prerequisites):** Validate-and-warn only. Don't manage `opencode.json`.
- **Symlink strategy:** Relative symlinks, confirmed.
- **Token estimation:** Chars/4 heuristic, no tiktoken.

---

## Risk Notes

1. **Gray-matter + bun compile** — gray-matter uses some dynamic requires internally. Test early that it bundles correctly with `bun build --compile`. Fallback: use a simpler frontmatter parser (regex-based, ~30 lines).

2. **Directory symlinks** — skill directories are symlinked as whole directories. On Windows, directory symlinks require elevated permissions. This is a known limitation for v1 (can note in docs).

3. **CLAUDE.md generation** — The "wrapper that imports AGENTS.md" depends on how Claude Code handles includes. If it doesn't support `@import` or similar, the wrapper may need to be a full copy with a header comment noting it's generated. Research Claude Code's current include mechanism before implementing.

4. **Cursor .mdc format** — Verify current Cursor .mdc expectations. The format may have evolved. Check if frontmatter keys beyond `description`, `paths`, `globs` are needed.
