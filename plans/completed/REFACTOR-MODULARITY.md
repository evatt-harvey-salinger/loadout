# Refactor: Modularity & Slimness Pass

**Date:** 2026-05-02
**Scope:** Tighten the global-config implementation. No behavior changes — only structure, duplication, and clarity.
**Target reduction:** ~500 LOC across `src/tools/*` and `src/cli/commands/*` while improving readability.

---

## Goals

1. Eliminate duplication across the 4 tool adapters.
2. Eliminate duplication between project commands and `global` subcommands.
3. Make every command go through a single `CommandContext` discovery path.
4. Remove dead parameters and lookup methods that should be data.
5. Extract the "resolve + attach instruction" pattern that's copy-pasted ~7 times.
6. Keep the public CLI surface (commands, flags, output) **identical**.

Success = `loadout --help`, `loadout global --help`, and a representative apply/diff/status all produce the same output as before, with substantially less code.

---

## Phase 1 — Shared loadout resolution helper

**Problem:** This 10-line block appears in `apply`, `diff`, `info`, `init`, `globalInfo`, `globalDiff` (≈ 7 copies):

```ts
const rootConfig = parseRootConfig(ctx.configPath);
const loadoutName = name || rootConfig.default || "base";
let loadout;
try {
  loadout = resolveLoadout(loadoutName, roots, rootConfig);
} catch (err) { log.error(...); process.exit(1); }
const instructionItem = getInstructionItem(ctx.configPath, loadout.tools);
if (instructionItem) loadout.items.push(instructionItem);
```

**Action:** Add `src/core/resolve.ts`:

```ts
export interface LoadResult {
  loadout: ResolvedLoadout;
  rootConfig: RootConfig;
  loadoutName: string;
}

export async function loadResolvedLoadout(
  ctx: CommandContext,
  name?: string
): Promise<LoadResult>
```

It performs: discover roots (filtered to ctx scope), parse root config, pick name, `resolveLoadout`, attach instruction item. Throws on failure — callers decide whether to `process.exit`.

**Touched:** `core/resolve.ts` (add), `apply.ts`, `diff.ts`, `info.ts`, `init.ts`, `global.ts`.

**Net:** −60 LOC, single source of truth for "what gets applied."

---

## Phase 2 — Adapter factory (`createAdapter`)

**Problem:** `claude.ts`, `cursor.ts`, `opencode.ts`, `codex.ts` repeat:

- The same `outputs()` switch (rule → `{base}/rules/x`, skill → `{base}/skills/x`, instruction → `AGENTS.md`).
- The same scope-aware AGENTS.md target (`scope === "global" ? join(homedir, "AGENTS.md") : "AGENTS.md"`).
- The same render shapes (skill = `{ content: null, hash: hashDir }`, rule = pass-through file, instruction = pass-through file).

**Action:** Add `src/tools/adapter.ts`:

```ts
interface AdapterSpec {
  name: Tool;
  basePath: { global: string; project: string };  // data, not method
  supports: ArtifactKind[];
  rule?: {
    ext?: string;                     // default ".md"
    mode?: OutputMode;                // default "symlink"
    transform?: (raw: string) => string;  // for cursor's frontmatter rewrite
  };
  skill?: { mode?: OutputMode };      // default "symlink"
  instruction?: {
    targetName?: string;              // default "AGENTS.md"
    generate?: (item: ResolvedItem) => string;  // for claude's CLAUDE.md wrapper
    mode?: OutputMode;                // default "symlink"
  };
  validate?: ToolAdapter["validate"];
}

export function createAdapter(spec: AdapterSpec): ToolAdapter;
```

The factory builds `outputs()` and `render()` from the spec. Each tool file collapses to a ~15-line declaration:

```ts
// claude.ts
export const claudeAdapter = createAdapter({
  name: "claude-code",
  basePath: { global: join(homedir(), ".claude"), project: ".claude" },
  supports: ["rule", "skill", "instruction"],
  instruction: {
    generate: () => CLAUDE_WRAPPER,   // emits CLAUDE.md
    targetName: "CLAUDE.md",          // claude wants CLAUDE.md not AGENTS.md? — see note
  },
});
```

> **Note re: instruction targets** — current code points all 4 adapters at `AGENTS.md` (claude's render generates a CLAUDE.md wrapper but emits it to `AGENTS.md` target — verify this is intentional during phase). If the wrapper truly belongs at `CLAUDE.md`, this is a latent bug the factory will surface; flag and confirm before "fixing."

**Touched:** `tools/adapter.ts` (new), `tools/claude.ts`, `tools/cursor.ts`, `tools/opencode.ts`, `tools/codex.ts`, `core/types.ts` (drop `getBasePath` method, keep optional for back-compat or remove cleanly).

**Net:** −250 LOC, adding a new tool becomes a ~10-line declaration.

---

## Phase 3 — Demote `getBasePath()` to data

**Problem:** `getBasePath(scope)` is a pure lookup with no logic. It's a method only because it predates `createAdapter`.

**Action:** Replace `getBasePath(scope: Scope): string` on `ToolAdapter` with `basePath: Record<Scope, string>`. The factory in Phase 2 emits this shape automatically. Remove the method from the interface.

Any external readers (`getAdapter(t).getBasePath(scope)`) become `getAdapter(t).basePath[scope]`. Search shows only adapter-internal use today, so churn is contained.

**Touched:** `core/types.ts`, all 4 `tools/*.ts` (handled by Phase 2), any callers (none currently).

**Net:** −10 LOC, simpler `ToolAdapter` contract.

---

## Phase 4 — Scope-parameterized commands; collapse `global.ts`

**Problem:** `global.ts` (358 LOC) re-implements `diff`, `info`, `status`, `clean` with `scope = "global"` baked in. `globalApply` already proves the right pattern (thin wrapper around `executeApply(ctx, …)`).

**Action:** For each duplicated command, extract a scope-agnostic core:

| Command   | Extract                                  | Lives in              |
| --------- | ---------------------------------------- | --------------------- |
| `apply`   | `executeApply(ctx, name, opts)`          | `apply.ts` (✓ exists) |
| `diff`    | `executeDiff(ctx, name)`                 | `diff.ts`             |
| `info`    | `executeInfo(ctx, name)`                 | `info.ts`             |
| `status`  | `executeStatus(ctx)`                     | `status.ts` (already has `showScopeStatus`; rename + export) |
| `clean`   | `executeClean(ctx, name?)`               | new `clean.ts` or in `remove.ts` |
| `list`    | `executeList(ctx)`                       | `list.ts`             |

Then `global.ts` becomes:

```ts
const withGlobal = (fn) => async (...args) => fn(await getContext("global"), ...args);

export const globalCommand = new Command("global")
  .description("Manage global loadouts")
  .addCommand(new Command("list").action(withGlobal(executeList)))
  .addCommand(new Command("info").argument("<name>").action(withGlobal(executeInfo)))
  .addCommand(new Command("diff").argument("<name>").action(withGlobal(executeDiff)))
  .addCommand(new Command("apply").argument("[name]").option("--dry-run").action(withGlobal(executeApply)))
  .addCommand(new Command("clean").argument("[name]").action(withGlobal(executeClean)))
  .addCommand(new Command("status").action(withGlobal(executeStatus)));
```

**Touched:** `cli/commands/global.ts` (rewrite), `apply.ts`, `diff.ts`, `info.ts`, `status.ts`, possibly new `clean.ts`.

**Net:** `global.ts`: 358 → ~50 LOC. Project commands also become testable as pure functions of `ctx`.

---

## Phase 5 — Unify command discovery on `CommandContext`

**Problem:** `info.ts` and `check.ts` still hand-roll `discoverLoadoutRoots + getProjectRoot` instead of using `getContext`.

**Action:** Convert both to:

```ts
const ctx = await getContext("project");
const { loadout, rootConfig, loadoutName } = await loadResolvedLoadout(ctx, name);
```

For `check.ts`, which iterates *all* roots, keep `discoverLoadoutRoots(ctx.projectRoot)` — but route the projectRoot through `ctx`.

**Touched:** `info.ts`, `check.ts`.

**Net:** −15 LOC; one mental model for "where am I."

---

## Phase 6 — Drop dead `mode` parameter from `planRender`

**Problem:** `planRender(loadout, projectRoot, scope, mode)` accepts `mode` but never uses it. `applyPlan` only uses `mode` to write to state; the state already has per-entry mode in `entry.mode`, and the top-level `mode` field is just metadata.

**Action:**
- Remove `mode` parameter from `planRender`. Update the 4 call sites.
- Keep `mode` on `applyPlan` for state metadata, but default it to `rootConfig.mode ?? "symlink"` — and consider deriving it from the plan instead. Punt on full removal; just stop threading it where it's unused.

**Touched:** `core/render.ts`, `apply.ts`, `diff.ts`, `info.ts`, `init.ts`, `global.ts`.

**Net:** −5 LOC, less misleading API.

---

## Execution order

Phases are mostly independent but stack cleanly:

1. **Phase 1** (resolve helper) — small, isolated, immediate payoff in 6 files.
2. **Phase 6** (drop `mode`) — trivial, do alongside Phase 1.
3. **Phase 2 + 3** (adapter factory + basePath as data) — done together; biggest LOC win.
4. **Phase 4** (extract `executeX` + collapse `global.ts`) — depends on Phase 1.
5. **Phase 5** (unify on `CommandContext`) — cleanup pass after 1 + 4.

Each phase ends with `npm run build` (not `npm test` — it hung last time; investigate separately).

---

## Out of scope

- Test changes (no behavior change → tests should still pass; if they don't, it's a regression).
- Changes to YAML schema, state file format, or CLI flags.
- The latent CLAUDE.md vs AGENTS.md target question (flag during Phase 2; do not silently change).
- `manifest.ts`, `tokens.ts`, schema/config parsing — already clean.

---

## Estimated impact

| Area                    | Before | After | Δ      |
| ----------------------- | ------ | ----- | ------ |
| `src/tools/*.ts`        | ~430   | ~180  | −250   |
| `src/cli/commands/global.ts` | 358 | ~50  | −300   |
| Other commands          | ~700   | ~640  | −60    |
| `src/core/render.ts`    | ~210   | ~205  | −5     |
| New: `tools/adapter.ts`, `loadResolvedLoadout` | 0 | ~120 | +120 |
| **Total**               |        |       | **≈ −500** |

Plus: adding a new tool drops from ~120 LOC to ~15 LOC.
