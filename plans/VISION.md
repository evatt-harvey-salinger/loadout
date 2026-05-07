# Loadout: Vision and Plan

**Version:** 0.1 (Foundation)  
**Last Updated:** 2026-05-02

---

## Problem Statement

AI coding agents (Claude Code, Cursor, OpenCode, Codex) rely on configuration files—rules, skills, commands, agent definitions, instruction files—to work effectively. Managing these configurations has several pain points:

1. **Cross-tool fragmentation.** Each tool has its own config location and format quirks. Maintaining the same config across tools requires manual symlinks, dual frontmatter (`paths:` vs `globs:`), and careful file placement.

2. **Context cost opacity.** There's no way to know how many tokens a configuration costs. Configs accumulate and bloat context without visibility.

3. **Hierarchical inconsistency.** Tools handle nested configs differently. Monorepos struggle: either rules live at the top (missing package-specific context) or at package level (missing repo-wide context).

4. **No portability.** You can't easily take a project's agent config and use it elsewhere without copying files or polluting global config.

5. **No composition.** You can't say "apply the backend loadout" vs "apply the ML loadout" and have the right rules/skills activate.

---

## Vision

**Loadout** is a CLI tool for managing portable agentic coding configurations across a small set of well-supported tools first, with a simple adapter model for adding more later.

```
┌─────────────────────────────────────────────────────────────┐
│                        .loadout/                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────────────┐             │
│  │  rules  │  │ skills  │  │    AGENTS.md    │             │
│  └─────────┘  └─────────┘  └─────────────────┘             │
│                            │                                │
│              ┌─────────────┴─────────────┐                  │
│              │   loadouts/backend.yaml   │                  │
│              │   (named bundle)          │                  │
│              └─────────────┬─────────────┘                  │
└────────────────────────────┼────────────────────────────────┘
                             │
                    loadout apply backend
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   .claude/rules/      .cursor/rules/      .opencode/rules/
   .claude/skills/     .cursor/skills/     .opencode/skills/
   CLAUDE.md           AGENTS.md           AGENTS.md
```

**Core value propositions:**

1. **Single source of truth.** Write configs once in `.loadout/`, apply everywhere.
2. **Automatic portability.** Loadout translates frontmatter and file formats for each tool.
3. **Named bundles.** Group configs into loadouts that can be applied/removed atomically.
4. **Token visibility.** Estimate rendered token cost per tool before applying.
5. **Hierarchical composition.** Layer loadouts from global → repo → package levels.

### Design Principles

- **Small core.** One resolver, one renderer, one ownership manifest.
- **Thin adapters.** Tool-specific code should only describe capabilities, paths, and transforms.
- **Safe defaults.** Abort on ambiguous merges or unmanaged file collisions.
- **Portable sources.** Source files stay generic; rendering handles target quirks.
- **Honor real portability boundaries.** Share artifacts only where tools are actually compatible.

---

## Core Concepts

### The `.loadout/` Directory

A `.loadout/` directory contains:
- **Portable source artifacts**:
  - `rules/` for scoped advisory rules
  - `skills/` for AgentSkills directories
  - `AGENTS.md` as the canonical always-on instruction file
- **Loadout definitions** in `loadouts/` that bundle configs into named sets
- **Root config** (`loadout.yaml`) with global settings

### Loadout Definition

A loadout is a named bundle of configs. Loadouts can extend other loadouts.

```yaml
# .loadout/loadouts/backend.yaml
name: backend
description: "Backend development configuration"
extends: base

include:
  - rules/go.md
  - rules/database.md
  - skills/deploy
```

### Hierarchical Discovery

Loadout walks from the current directory up to the git root, collecting all `.loadout/` folders. Closer folders take precedence on conflicts (nearest wins).

```
~/code/monorepo/              # git root
├── .loadout/                 # repo-level loadout
│   └── loadouts/base.yaml
├── packages/
│   └── api/
│       └── .loadout/         # package-level loadout
│           └── loadouts/api.yaml (extends: base)
```

A user-global loadout lives at `~/.config/loadout/`.

### Application Modes

Loadout writes outputs per target, not per loadout. Each adapter decides whether an output is:

- **Symlink:** Target points at a portable source unchanged
- **Copy:** Target is a byte-for-byte managed copy
- **Generate:** Target is rendered or wrapped for that tool

---

## Architecture Decisions

### AD-1: Loadout owns canonical sources

**Decision:** Portable source artifacts live in `.loadout/`. Tool-specific locations (`.claude/rules/`, `.agents/skills/`, root `CLAUDE.md`, etc.) are managed outputs.

**Rationale:** Single source of truth. Edits happen in one place. Tool folders become outputs, not sources.

**Trade-off:** Users must learn to edit in `.loadout/`, not in tool folders.

---

### AD-2: Three artifact classes share one pipeline

**Decision:** V1 supports three artifact classes:

1. `rule` - portable markdown content rendered per tool
2. `skill` - portable AgentSkills directories, with optional tool sidecars
3. `instruction` - one canonical `.loadout/AGENTS.md`

These all use the same pipeline stages:

1. discover `.loadout/` roots
2. resolve the loadout graph
3. materialize included items
4. render each item through a tool adapter
5. write outputs and record ownership

However, each class has **class-specific behaviors** at each stage. For example, instructions use hierarchical file discovery (tools walk up the tree for `AGENTS.md`), while rules are placed in tool-specific folders. The pipeline is shared; the semantics differ.

**Rationale:** The project should stay small. New tools should plug into a shared framework instead of creating parallel code paths per category. Acknowledging class-specific behaviors keeps the model honest about real portability boundaries.

**Implementation:** Each tool adapter declares:
- supported artifact classes
- output specs for each artifact
- required content or metadata transforms
- prerequisite checks
- optional sidecar files

Frontmatter translation is one adapter transform. A generated `CLAUDE.md` wrapper is another.

---

### AD-3: Hierarchical lookup is lexical and local-first

**Decision:** Loadout names are resolved from the current directory upward. `apply api` finds the nearest `loadouts/api.yaml`. `extends: base` resolves `base` relative to the current loadout's `.loadout/` first, then walks upward, then falls back to the user-global config.

**Rationale:** This preserves local intent without inventing a global merge system. The lookup rule is simple enough to explain and implement.

**Conflict rule:** Nearest wins for lookup. Same-named loadouts do not merge.

---

### AD-4: Ownership manifest is the source of truth

**Decision:** `.loadout/.state.json` stores the active loadout, apply mode, and a manifest of every output path Loadout owns.

**Rationale:** This keeps `remove`, `status`, `diff`, and copy mode safe. Symlinks help with inspection, but ownership must be explicit.

**State file:** `.loadout/.state.json` is gitignored because applied state is machine-local.

---

### AD-5: Abort on unmanaged target collisions

**Decision:** `loadout apply` refuses to overwrite files it does not already own.

**Rationale:** Safe behavior matters more than convenience in v1. Silent adoption or overwrite makes the tool untrustworthy.

**Future option:** `import` or `--adopt` can be added later as explicit workflows.

---

### AD-6: Instructions are a singleton source

**Decision:** `.loadout/AGENTS.md` is the only instruction source in v1. If present, it is always rendered for all selected tools. Loadout does not support multiple instruction files or per-loadout instruction selection.

**Rationale:** This is simpler than modeling instructions as a category. Most projects want one canonical instruction source anyway.

---

### AD-7: Token accounting uses rendered outputs

**Decision:** `loadout info` reports token estimates for rendered outputs per tool. Skill `references/` are excluded initially unless explicitly included as loadout items.

**Rationale:** This matches what tools actually ingest more closely than counting source files alone, while keeping the first implementation small.

---

### AD-8: XDG-compliant global location

**Decision:** User-global loadout lives at `~/.config/loadout/`.

**Rationale:** XDG compliance. Consistent with other tools. Falls back gracefully.

---

## Data Models

### Root Config: `loadout.yaml`

```yaml
# .loadout/loadout.yaml
version: "1"
default: base              # Default loadout to apply
mode: symlink              # Default for outputs that can be shared directly
tools:                     # Tools to target (default: all)
  - claude-code
  - cursor
  - opencode
  - codex
```

### Loadout Definition: `loadouts/<name>.yaml`

```yaml
name: backend
description: "Backend development configuration"
extends: base              # Optional: inherit from another loadout
tools:                     # Optional: override default tools
  - opencode
  - claude-code

include:
  - rules/go.md
  - rules/database.md
  - skills/deploy
  - path: rules/cursor-only.md
    tools: [cursor]
  - path: skills/release
    tools: [claude-code, cursor, opencode, codex]
```

### Applied State: `.state.json`

```json
{
  "loadout": "backend",
  "mode": "symlink",
  "appliedAt": "2026-05-02T15:30:00Z",
  "entries": [
    {
      "tool": "cursor",
      "kind": "rule",
      "sourcePath": ".loadout/rules/go.md",
      "targetPath": ".cursor/rules/go.mdc",
      "mode": "copy",
      "renderedHash": "sha256:..."
    }
  ]
}
```

Gitignored. This manifest is the source of truth for ownership and drift detection.

### Rule File: `rules/<name>.md`

Standard markdown with YAML frontmatter. Tool adapters add missing fields during rendering when required.

```yaml
---
description: Go coding standards
paths: ["**/*.go"]
# globs: auto-generated if missing
---

Use errors.Join() for error wrapping because it preserves the full
error chain for debugging.
```

### Skill: `skills/<name>/SKILL.md`

Follows AgentSkills specification. Directory structure:

```
skills/
└── deploy/
    ├── SKILL.md
    ├── scripts/
    └── references/
```

### Instruction Source: `AGENTS.md`

Canonical always-on project instructions live at `.loadout/AGENTS.md`.

Loadout renders:
- `AGENTS.md` at project root for Cursor, OpenCode, and Codex
- `CLAUDE.md` at project root as a generated wrapper that imports `AGENTS.md`

```markdown
# Project Instructions

## Quick Reference
- Build: `npm run build`
- Test: `npm test`

## Done Means
- [ ] Tests pass
- [ ] Types check
```

---

## Tool Mapping

In v1, Loadout supports Claude Code, Cursor, OpenCode, and Codex through one adapter contract. Portability guarantees differ by artifact class.

| Artifact | Source | Claude Code | Cursor | OpenCode | Codex |
|----------|--------|-------------|--------|----------|-------|
| rules | `.loadout/rules/*.md` | `.claude/rules/*.md` | `.cursor/rules/*.mdc` | `.opencode/rules/*.md` via `opencode-rules` | partial / experimental only |
| skills | `.loadout/skills/<name>/` | `.claude/skills/<name>/` | `.cursor/skills/<name>/` | `.opencode/skills/<name>/` | `.agents/skills/<name>/` |
| instructions | `.loadout/AGENTS.md` | generated `CLAUDE.md` wrapper | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` |

**Notes:**
- Cursor rules require `.mdc` and usually render as managed copies, not shared symlinks
- OpenCode rules require the `opencode-rules` plugin configured in `opencode.json`
- Codex is included in v1 for skills and instructions; rules are not part of the core portability guarantee
- Hooks, commands, agents, and additional tools are post-MVP

### Adapter Contract

Each adapter should be describable by a small interface:

- `supports(kind)` to declare artifact coverage
- `outputs(item)` to return one or more output specs
- `render(item, output)` to transform content and metadata
- `validate(project)` to report missing prerequisites or unsafe states

Each output spec should include:

- `path`
- `mode: "symlink" | "copy" | "generate"`
- optional sidecar metadata or wrapper generation

Examples:
- Cursor rules render to `.mdc`, ensure both `paths:` and `globs:` exist, and use `copy`
- OpenCode rules validate the `opencode-rules` plugin before writing outputs
- Codex skills may emit `.agents/skills/` plus optional `agents/openai.yaml` sidecars later
- Instructions render `AGENTS.md` directly and generate a `CLAUDE.md` wrapper

---

## CLI Commands

### Loadout Management

```
loadout init                    Initialize .loadout/ in current directory

loadout create <name>           Create a new loadout definition
                                Interactive: prompts for description, files to include

loadout apply [name]            Apply a loadout (default loadout if no name)
                                Options: --dry-run (preview without applying)
                                Refuses to overwrite unmanaged files

loadout remove                  Remove applied loadout
                                Deletes only files owned by the manifest

loadout list                    List available loadouts
                                Shows: name, description, file count, token estimate

loadout edit <name>             Open loadout definition in $EDITOR
```

### Source Artifact Management

Rules and skills support `add`, `list`, `edit`, `remove`. Instructions are a singleton source.

```
loadout rule add [name]         Create a new rule
loadout rule list               List rules (with token estimates)
loadout rule edit <name>        Open rule in $EDITOR
loadout rule remove <name>      Delete rule

loadout skill add [name]        Create a new skill
loadout skill list              List skills
loadout skill edit <name>       Open skill SKILL.md in $EDITOR  
loadout skill remove <name>     Delete skill directory

loadout instructions edit       Open .loadout/AGENTS.md in $EDITOR
loadout instructions init       Create .loadout/AGENTS.md if missing
```

### Diagnostics

```
loadout info [name]             Show loadout details
                                - Description
                                - Included files
                                - Rendered token estimate by tool
                                - Content hash
                                - Extends chain

loadout check                   Validate loadout configuration
                                - YAML syntax valid
                                - All referenced files exist
                                - No circular extends
                                - OpenCode rule prerequisites satisfied
                                - No unmanaged target collisions in dry-run mode

loadout status                  Show current state
                                - Which loadout is applied
                                - Apply mode
                                - Manifest entries
                                - Drift detection (missing or modified outputs)

loadout diff [name]             Preview what apply would change
                                - Files to create
                                - Files to update
                                - Files to remove (if switching loadouts)
```

### Future Commands (Post-MVP)

```
loadout overlay <name>          Layer a second loadout on top of the active one
loadout sync                    Re-apply current loadout (for copy mode)
loadout import <path>           Import configs from another project
loadout export <name> <path>    Export loadout to shareable format
loadout command add [name]      Manage command definitions
loadout agent add [name]        Manage agent definitions
loadout hook add [name]         Manage hook definitions
loadout history                 Show token estimate over time
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Safe apply/remove workflow on top of one generic resolver and renderer.

1. Project setup (TypeScript, commander, vitest)
2. Core types and schemas
3. `loadout init` - create `.loadout/` structure
4. Hierarchical discovery and loadout resolution
5. Generic render pipeline and tool adapter interface
6. Ownership manifest and safe apply/remove
7. Tool adapters for Claude Code, Cursor, OpenCode, and Codex
8. `loadout create`, `loadout list`, and `loadout check`

**Exit criteria:** Can resolve a loadout, preview changes, apply it safely, and remove only owned outputs.

### Phase 2: Authoring and Diagnostics

**Goal:** Manage supported config files and explain what Loadout will do.

1. `loadout rule add/list/edit/remove`
2. `loadout skill add/list/edit/remove`
3. `loadout instructions init/edit`
4. `loadout info` - rendered token estimates and extends chain
5. `loadout status` - manifest and drift detection
6. `loadout diff` - preview create/update/remove

**Exit criteria:** Can author v1 config types and inspect rendered cost and ownership.

### Phase 3: Safe Expansion

**Goal:** Add explicit workflows for more complex repo states.

1. `loadout import` / `init --scan`
2. Copy mode and `loadout sync`
3. User-global loadout (`~/.config/loadout/`)
4. Overlay support
5. Nested instruction placement, if worth supporting

**Exit criteria:** Can safely adopt existing repos and support more than the base symlink workflow.

### Phase 4: Additional Tooling and Categories

**Goal:** Extend the adapter system without changing the core model.

1. Stable Codex rule support, if the tool surface matures
2. Command definitions
3. Agent definitions
4. Additional third-party tool adapters
5. Separate enforcement framework for hooks/plugins

**Exit criteria:** New tools and categories fit the existing adapter contract with minimal core changes.

### Phase 5: Polish and Extensibility

**Goal:** Production-ready CLI.

1. TUI elements (interactive selection, progress)
2. Better error messages and recovery
3. Shell completions
4. `loadout export` for sharing
5. Token history tracking
6. Plugin system for additional tools

---

## Directory Structure (Loadout Codebase)

```
loadout/
├── package.json
├── tsconfig.json
├── AGENTS.md
├── plans/
│   └── VISION.md              # This document
├── src/
│   ├── index.ts               # CLI entry point
│   ├── cli/
│   │   ├── index.ts           # Commander setup
│   │   └── commands/          # One file per command group
│   │       ├── init.ts
│   │       ├── apply.ts
│   │       ├── create.ts
│   │       ├── list.ts
│   │       ├── rule.ts
│   │       ├── skill.ts
│   │       ├── instructions.ts
│   │       ├── info.ts
│   │       └── ...
│   ├── core/
│   │   ├── types.ts           # Core type definitions
│   │   ├── schema.ts          # Zod schemas for validation
│   │   ├── discovery.ts       # Find .loadout/ folders
│   │   ├── config.ts          # Parse source configs and loadouts
│   │   ├── resolve.ts         # Resolve loadout graphs and included items
│   │   ├── render.ts          # Generic render pipeline
│   │   ├── manifest.ts        # Ownership state and drift detection
│   │   └── tokens.ts          # Token estimation on rendered outputs
│   ├── tools/
│   │   ├── index.ts           # Tool adapter registry
│   │   ├── claude.ts
│   │   ├── cursor.ts
│   │   ├── opencode.ts
│   │   └── codex.ts
│   └── lib/
│       ├── git.ts             # Git operations
│       ├── fs.ts              # FS helpers (symlinks, etc.)
│       └── output.ts          # Terminal output (chalk)
└── .loadout/                   # Dogfooding: loadout uses itself
```

---

## Open Questions

### Q1: Nested AGENTS.md
Some tools support nested `AGENTS.md` in subdirectories. Should loadout support placing instruction sources at paths other than root?

### Q2: OpenCode Rule Prerequisites
Should Loadout eventually manage the `opencode-rules` plugin declaration in `opencode.json`, or only validate that it exists?

### Q3: Codex Rule Support
Codex is in v1 for skills and instructions. Rule delivery should stay partial until the Codex rule surface is stable enough to guarantee portability.

---

## Success Metrics

1. **Time to apply:** Under 1 second for typical loadout
2. **Token estimate quality:** Close enough to compare loadouts and catch obvious bloat
3. **Tool coverage:** Claude Code, Cursor, OpenCode, and Codex supported through one adapter contract
4. **Safe ownership:** `remove` deletes only manifest-owned outputs
5. **Zero drift:** Applied configs stay in sync with sources in symlink mode

---

## Non-Goals (v1)

- Package registry / sharing loadouts publicly
- GUI / web interface
- Real-time file watching
- Automatic conflict resolution beyond explicit resolution rules
- Merging multiple instruction files
- Exact token accounting across every possible tool ingestion path
- Supporting tools beyond Claude Code, Cursor, OpenCode, and Codex

---

## References

- [AgentSkills Specification](https://agentskills.io)
- Engineering for Agents skill (shorehouse)
- Writing Agent Rules skill (shorehouse)
- Writing Agent Skills skill (shorehouse)
