# Implementation Plan: Target-Scoped Gitignores

## Overview

Transition from a single project-root `.gitignore` with fully-qualified paths to per-target `.gitignore` files with relative paths. This enables gitignore support for both global and project scopes using a unified mechanism.

### Current State

- All gitignore entries go to `<projectRoot>/.gitignore`
- Global scope has **no gitignore support** (explicit guards everywhere)
- Paths are fully qualified: `.claude/rules/my-rule.md`, `.cursor/rules/my-rule.mdc`
- Gitignore updates on every `sync`/`activate` based on currently active artifacts

### Target State

**Project scope:**
```
.claude/.gitignore       → rules/my-rule.md, skills/my-skill/
.cursor/.gitignore       → rules/my-rule.mdc, skills/my-skill/
.opencode/.gitignore     → rules/my-rule.md, skills/my-skill/
.loadouts/.gitignore     → .state.json, .fallback-applied
```

**Global scope:**
```
~/.claude/.gitignore            → rules/my-rule.md, skills/my-skill/
~/.config/opencode/.gitignore   → rules/my-rule.md, skills/my-skill/
```

**Key behavior change:** Gitignore contains paths for **all existing artifacts**, not just active ones. This makes gitignore stable across activation cycles.

---

## Design Decisions

| Decision | Choice |
|----------|--------|
| Where do `.loadouts/.state.json` and `.loadouts/.fallback-applied` live? | `.loadouts/.gitignore` |
| Keep root `.gitignore` entry? | No — artifact paths move entirely to target dirs |
| Same managed section marker format? | Yes — `# <loadouts>` / `# </loadouts>` |
| Rollout strategy | Automatic migration during `loadouts update` |
| When does gitignore update? | Artifact lifecycle only (add/delete/import), not render |

---

## When Gitignore Updates

| Event | Updates gitignore? | Notes |
|-------|-------------------|-------|
| `rule add` | Yes | Adds paths for new artifact |
| `rule delete` | Yes | Removes paths for deleted artifact |
| `rule import` | Yes | Adds paths for imported artifact |
| `skill add` | Yes | Adds paths for new artifact |
| `skill delete` | Yes | Removes paths for deleted artifact |
| `skill import` | Yes | Adds paths for imported artifact |
| `init` | Yes | After scaffold, compute all paths |
| `update` | Yes | Migration from old format |
| `activate` | **No** | Artifacts already covered |
| `deactivate` | **No** | Artifacts stay ignored |
| `sync` | **No** | Artifacts already covered |

---

## Implementation Phases

### Phase 1: Core Gitignore Module Rewrite

**File:** `src/lib/gitignore.ts`

#### 1.1 New Function: `updateTargetGitignore`

Replace `updateGitignore(projectRoot, managedPaths)` with:

```typescript
/**
 * Update .gitignore within a specific target directory.
 * 
 * @param targetDir - Absolute path to the target directory (e.g., /project/.claude or ~/.claude)
 * @param relativePaths - Paths relative to targetDir (e.g., ["rules/foo.md", "skills/bar/"])
 */
export function updateTargetGitignore(
  targetDir: string,
  relativePaths: string[]
): void
```

- Same marker format (`# <loadouts>` / `# </loadouts>`)
- Same deduplication and sorting logic
- No "always include" entries (those move to `.loadouts/.gitignore`)
- Creates `.gitignore` if it doesn't exist
- Preserves user content outside markers
- Empty array removes the managed section entirely

#### 1.2 New Function: `updateLoadoutsGitignore`

Dedicated function for `.loadouts/.gitignore`:

```typescript
/**
 * Update .loadouts/.gitignore with state file entries.
 * Always includes .state.json and .fallback-applied.
 */
export function updateLoadoutsGitignore(loadoutsDir: string): void
```

#### 1.3 New Return Type: `computeArtifactGitignorePaths`

Change from flat `string[]` to grouped by target:

```typescript
interface TargetGitignorePaths {
  /** Map of targetDir (relative for project, absolute for global) → relative paths within that dir */
  byTarget: Map<string, string[]>;
}

export function computeArtifactGitignorePaths(
  kindId: string,
  artifactName: string,
  scope: Scope
): TargetGitignorePaths
```

Implementation notes:
- Iterate all registered tools that support this kind
- For each tool, get `tool.basePath[scope]`
- Compute relative path within target (e.g., `rules/my-rule.md`)
- Group paths by target directory

#### 1.4 New Function: `rebuildAllGitignores`

Recompute gitignore for all existing artifacts:

```typescript
/**
 * Rebuild gitignore entries for all artifacts in the loadouts directory.
 * Called after artifact add/delete to ensure all artifacts are covered.
 * 
 * @param loadoutsDir - Path to .loadouts/ or ~/.config/loadouts/
 * @param projectRoot - Project root (for resolving relative target paths)
 * @param scope - "project" or "global"
 */
export function rebuildAllGitignores(
  loadoutsDir: string,
  projectRoot: string,
  scope: Scope
): void
```

This scans all artifacts in `loadoutsDir` and writes per-target `.gitignore` files with all possible paths. This ensures:
- All artifacts are ignored regardless of activation state
- Adding/removing one artifact rebuilds the complete picture

#### 1.5 Update `addArtifactToGitignore` / `removeArtifactFromGitignore`

Simplify to just call `rebuildAllGitignores`:

```typescript
export function addArtifactToGitignore(
  loadoutsDir: string,
  projectRoot: string,
  scope: Scope
): void {
  rebuildAllGitignores(loadoutsDir, projectRoot, scope);
}

export function removeArtifactFromGitignore(
  loadoutsDir: string,
  projectRoot: string,
  scope: Scope
): void {
  rebuildAllGitignores(loadoutsDir, projectRoot, scope);
}
```

Or rename to a single `syncGitignores(loadoutsDir, projectRoot, scope)` function.

#### 1.6 New Helper: `getManagedPathsFromTarget`

Read managed paths from a specific target's `.gitignore`:

```typescript
export function getManagedPathsFromTarget(targetDir: string): string[]
```

#### 1.7 Migration Helper: `removeLegacyRootGitignoreSection`

For the migration step:

```typescript
/**
 * Remove the legacy loadouts-managed section from the project root .gitignore.
 * Handles both old (# <loadout>) and current (# <loadouts>) markers.
 */
export function removeLegacyRootGitignoreSection(projectRoot: string): void
```

#### 1.8 Deprecate Legacy Functions

- Mark `updateGitignore` as deprecated (keep for reference during transition)
- Mark `getManagedPaths` as deprecated
- Remove `removeGitignoreSection`

---

### Phase 2: Remove Gitignore from Render Pipeline

**File:** `src/core/render.ts`

Remove all gitignore logic from the render pipeline:

#### 2.1 Remove `computeGitignorePaths` function (lines 296-304)

#### 2.2 Remove gitignore call from `applyPlan` (lines 398-403)

```typescript
// DELETE THIS BLOCK
if (scope === "project") {
  const managedPaths = computeGitignorePaths(plan.outputs);
  updateGitignore(projectRoot, managedPaths);
}
```

#### 2.3 Remove gitignore call from `applyMultiPlan` (lines 544-551)

```typescript
// DELETE THIS BLOCK
if (scope === "project") {
  const managedPaths = computeGitignorePaths(
    mergedOutputs.map((o) => ({ spec: o.output.spec }))
  );
  updateGitignore(projectRoot, managedPaths);
}
```

#### 2.4 Remove gitignore call from `removeManaged` (lines 615-618)

```typescript
// DELETE THIS BLOCK
if (scope === "project") {
  removeGitignoreSection(projectRoot);
}
```

#### 2.5 Remove `gitignorePath` from `OutputSpec` interface

The `gitignorePath` field in `OutputSpec` and `resolveExpandedOutputSpec` is no longer needed.

---

### Phase 3: CLI Artifact Command Updates

Update artifact lifecycle commands to use the new gitignore functions.

#### 3.1 `src/cli/commands/rule.ts`

**Line 128-132 (`rule add`):**
Remove scope guard, call new function:

```typescript
// Before
if (scope === "project") {
  addArtifactToGitignore(projectRoot, "rule", name, scope);
}

// After
rebuildAllGitignores(loadoutsDir, projectRoot, scope);
```

Same pattern for:
- Line 297-301 (`rule delete`)
- Line 374-379 (`rule import`)

#### 3.2 `src/cli/commands/skill.ts`

Same pattern at:
- Line 140-144 (`skill add`)
- Line 319-323 (`skill delete`)
- Line 459-463 (`skill import`)

#### 3.3 `src/cli/commands/install.ts`

**Line 656-659:**
Update to call `rebuildAllGitignores` after all artifacts are imported.

#### 3.4 `src/cli/commands/init.ts`

After project scaffold completes, call:
```typescript
rebuildAllGitignores(loadoutsDir, projectRoot, "project");
updateLoadoutsGitignore(loadoutsDir);
```

---

### Phase 4: Migration in `update` Command

**File:** `src/cli/commands/update.ts`

Add migration logic that runs automatically after a successful npm update:

#### 4.1 Migration Function

```typescript
async function migrateGitignore(): Promise<void> {
  const projectRoot = process.cwd();
  const loadoutsDir = path.join(projectRoot, ".loadouts");
  
  // Check if this is a loadouts project
  if (!fileExists(loadoutsDir)) return;
  
  // Check if migration is needed (old root .gitignore has managed section)
  const oldPaths = getManagedPaths(projectRoot);
  if (oldPaths.length === 0) return;
  
  log.info("Migrating gitignore to per-target format...");
  
  // Rebuild all gitignores based on current artifacts
  rebuildAllGitignores(loadoutsDir, projectRoot, "project");
  updateLoadoutsGitignore(loadoutsDir);
  
  // Remove old section from root .gitignore
  removeLegacyRootGitignoreSection(projectRoot);
  
  log.success("Gitignore migration complete");
}
```

#### 4.2 Call Migration After Update

In the `updateCommand` action, after successful npm update:

```typescript
log.success(`Updated to ${latestVersion}`);

// Run migrations for the new version
await migrateGitignore();
```

---

### Phase 5: Test Updates

**File:** `src/lib/gitignore.test.ts`

#### 5.1 New Test Suites

```typescript
describe("updateTargetGitignore", () => {
  it("creates .gitignore in target directory");
  it("handles relative paths within target");
  it("preserves user content outside markers");
  it("removes section when paths array is empty");
  it("creates parent directories if needed");
});

describe("updateLoadoutsGitignore", () => {
  it("always includes .state.json and .fallback-applied");
  it("creates .loadouts/.gitignore if missing");
});

describe("computeArtifactGitignorePaths - grouped", () => {
  it("groups paths by target directory");
  it("handles project scope with relative base paths");
  it("handles global scope with absolute base paths");
  it("returns relative paths within each target");
});

describe("rebuildAllGitignores", () => {
  it("writes gitignore for all existing artifacts");
  it("handles mixed rules and skills");
  it("works for project scope");
  it("works for global scope");
});

describe("removeLegacyRootGitignoreSection", () => {
  it("removes # <loadouts> section from root");
  it("removes # <loadout> (old) section from root");
  it("preserves user content");
  it("handles file with no managed section");
});
```

#### 5.2 Remove Old Tests

- Remove tests for `updateGitignore`
- Remove tests for `removeGitignoreSection`
- Update tests for changed `computeArtifactGitignorePaths` return type

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/lib/gitignore.ts` | Major rewrite — new functions, grouped return types, migration helpers |
| `src/core/render.ts` | **Remove** gitignore logic entirely (3 call sites + helper function) |
| `src/cli/commands/rule.ts` | Update 3 call sites, remove scope guards |
| `src/cli/commands/skill.ts` | Update 3 call sites, remove scope guards |
| `src/cli/commands/install.ts` | Update to use `rebuildAllGitignores` |
| `src/cli/commands/init.ts` | Add gitignore setup after scaffold |
| `src/cli/commands/update.ts` | Add migration logic |
| `src/lib/gitignore.test.ts` | Major rewrite for new API |

---

## Rollout Checklist

1. [ ] Implement Phase 1 (core module rewrite)
2. [ ] Implement Phase 2 (remove from render pipeline)
3. [ ] Implement Phase 3 (CLI artifact commands)
4. [ ] Implement Phase 4 (migration in update)
5. [ ] Implement Phase 5 (tests)
6. [ ] Manual testing: fresh project
7. [ ] Manual testing: existing project migration via `update`
8. [ ] Manual testing: global scope

---

## Edge Cases to Handle

1. **Target directory doesn't exist yet** — `updateTargetGitignore` should create parent dirs
2. **Global paths with `~`** — Already expanded via `os.homedir()` in tool basePath
3. **Mixed old/new markers in root** — Migration handles both `# <loadout>` and `# <loadouts>`
4. **Empty loadouts directory** — `rebuildAllGitignores` writes empty sections (or skips)
5. **Instruction artifacts** — These go to `CLAUDE.md`, `AGENTS.md` at project root, not target dirs — excluded from per-target gitignore (may need separate handling or can be ignored since they're generated files)
6. **User runs old version after new version** — Old version would try to write root `.gitignore`, new version would clean it up on next artifact change. Acceptable.
