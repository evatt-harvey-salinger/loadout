# Loadout

**Composable configuration bundles for AI coding agents.**

Loadout organizes your rules, skills, and instructions into named **loadouts** that you can mix and match:

- **Task-specific configs** — Activate `backend` for API work, `frontend` for UI work, or both together
- **Team flexibility** — Track all available configs in one place; each teammate activates what they need
- **Tool portability** — Write once, apply to Claude Code, Cursor, OpenCode, Codex, and Pi

```bash
loadout activate base backend     # Backend task
loadout activate base frontend    # Switch to frontend
loadout activate base backend ml  # Combine multiple loadouts
```

---

## Quick Start

**New project:**
```bash
loadout init                      # Initialize .loadout/
loadout create backend -e base    # Create loadout extending base
loadout rule add api-standards    # Add rules to it
loadout activate backend          # Activate it
```

**Existing project with configs:**
```bash
loadout init                      # Initialize .loadout/ (auto-detects existing configs)
loadout install                   # Or run separately to import existing configs
loadout sync                      # Apply unified config
```

---

## Importing Existing Configuration

If you already have rules, skills, or instruction files scattered across tool directories, `loadout install` discovers and imports them all at once:

```bash
loadout install                   # Discover and import all existing configs
loadout install --dry-run         # Preview what would be imported
loadout install -i                # Interactive selection mode
loadout install --rules           # Only import rules
loadout install --from cursor     # Only from Cursor directories
loadout install --keep            # Keep original files after import
```

**Auto-detection on init:** When you run `loadout init`, it automatically detects existing configurations and offers to import them.

**What gets discovered:**
- Rules from `.claude/rules/`, `.cursor/rules/`, `.opencode/rules/`
- Skills from `.claude/skills/`, `.cursor/skills/`, `.opencode/skills/`, `.agents/skills/`, `.pi/skills/`
- Instruction files (`AGENTS.md`, `CLAUDE.md`) at project root

**Conflict resolution:** When the same artifact exists in multiple tool directories, `loadout install` detects the conflict and lets you choose which version to import (or import both with renamed destinations).

**Manual import:** For individual files, you can still use the granular import commands:

```bash
loadout rule import .cursor/rules/coding-style.mdc
loadout skill import .claude/skills/debugging
loadout instructions import
```

Imported artifacts are:
1. Copied into `.loadout/rules/` or `.loadout/skills/`
2. Automatically added to the `base` loadout (use `--to <name>` to change)
3. Original files deleted by default (use `--keep` to preserve)

After importing, run `loadout sync` to render outputs to all tool directories.

---

## Installation

```bash
npm install -g loadout
```

Requires Node.js 18+.

---

## Core Concepts

### The `.loadout/` Directory

Loadout stores all configuration in a `.loadout/` directory:

```
.loadout/
├── loadout.yaml          # Root config (version, defaults)
├── loadouts/             # Named configuration bundles
│   └── base.yaml
├── instructions/         # Per-loadout instruction files
│   └── AGENTS.base.md    # Instructions for base loadout
├── rules/                # Portable rule files
└── skills/               # Portable skill directories
```

### Scopes

Loadout operates in two scopes:

| Scope | Location | Flag | Purpose |
|-------|----------|------|---------|
| **Project** | `./.loadout/` | `-l` | Project-specific config |
| **Global** | `~/.config/loadout/` | `-g` | User-wide config |

Most commands auto-detect scope. Use `-l`/`-g` to be explicit, or `-a` to target both.

### Loadouts

A **loadout** is a named bundle of artifacts. Loadouts can extend other loadouts for composition:

```yaml
# .loadout/loadouts/backend.yaml
name: backend
description: Backend development configuration
extends: base

include:
  - rules/go.md
  - rules/database.md
  - skills/deploy
```

**Inheritance:** When a loadout extends another, items are merged with the child's items taking precedence. The extends chain is resolved in order (child → parent → grandparent).

**Multiple active loadouts:** You can activate multiple loadouts simultaneously. Their outputs are merged, with earlier loadouts taking precedence on conflicts:

```bash
loadout activate base backend ml    # All three active
loadout deactivate ml               # Remove just ml
```

**Per-include tool overrides:** Target specific tools for individual artifacts:

```yaml
include:
  - rules/general.md                      # All tools
  - path: rules/cursor-only.md
    tools: [cursor]                       # Cursor only
  - path: skills/claude-debug
    tools: [claude-code, pi]              # Multiple specific tools
```

### Sources: Cross-Project Configuration

Loadout supports sharing configuration across projects via **sources**. Declare paths to other `.loadout/` directories in your `loadout.yaml`:

```yaml
# packages/api/.loadout/loadout.yaml
version: "1"
default: api

sources:
  - ../..                    # Parent monorepo .loadout/
  - ../../shared/configs     # Sibling shared config directory
  - ~/dotfiles               # Personal global config (~ expands to home)
```

When resolving loadouts, sources are searched in declaration order after the local `.loadout/`. This enables:

- **Monorepo inheritance** — Subprojects pull rules/skills from the repo root
- **Shared config libraries** — Reference a common config directory
- **Bi-directional sharing** — Parent can also source from children for umbrella loadouts

**Resolution order:**
1. Local `.loadout/` (highest priority)
2. Sources in declaration order (transitively followed)
3. Global `~/.config/loadout/` (lowest priority)

Nearest wins on name conflicts. A subproject loadout can `extends: base` to inherit from a parent's base loadout.

**Example: Monorepo structure**

```
~/code/monorepo/
├── .loadout/                       # repo-level config
│   ├── loadout.yaml
│   ├── loadouts/base.yaml          # Shared base loadout
│   ├── rules/shared-style.md       # Shared rules
│   └── skills/debugging/           # Shared skills
├── packages/
│   └── api/
│       ├── .loadout/
│       │   ├── loadout.yaml        # sources: [../..]
│       │   └── loadouts/api.yaml   # extends: base
│       └── src/
```

With `sources: [../..]` in `packages/api/.loadout/loadout.yaml`, running `loadout sync` in the api package will:
1. Resolve the `api` loadout (which extends `base` from the parent)
2. Include parent's `rules/shared-style.md` and `skills/debugging/`
3. Render all artifacts to `packages/api/.cursor/`, `packages/api/.claude/`, etc.

**Missing sources:** If a source path doesn't resolve, loadout logs a warning and continues. Use `loadout list` to see available loadouts and any source warnings.

**Cycle detection:** Loadout detects circular source references and skips duplicates automatically.

### Artifact Kinds

**Built-in kinds:**

| Kind | Layout | Description |
|------|--------|-------------|
| `rule` | file | Scoped advisory rules (`.md`) |
| `skill` | directory | On-demand capabilities with `SKILL.md` |
| `instruction` | file | Always-on project instructions (`AGENTS.md`) |
| `prompt` | file | Slash command templates |
| `extension` | directory | Runtime code extensions |
| `theme` | file | UI theme configuration |

### Custom Artifact Kinds

Define custom artifact types by adding YAML files to `.loadout/kinds/`. This lets you manage any directory of files across tools without writing code.

**Example:** Share a `prompts/` directory across tools:

```yaml
# .loadout/kinds/prompt.yaml
id: myteam.prompt
description: Reusable prompt snippets shared across tools.

detect:
  pathPrefix: prompts/      # Match files in .loadout/prompts/

layout: file                 # One source file → one output file

targets:                     # Per-tool output paths
  claude-code:
    path: "{base}/prompts/{stem}{ext}"
  cursor:
    path: "{base}/prompts/{stem}.mdc"
    ext: .mdc                # Cursor wants .mdc extension
  opencode:
    path: "{base}/prompts/{stem}{ext}"
  # Tools not listed ignore this kind
```

After adding this file, create `.loadout/prompts/my-prompt.md`, include it in a loadout, and `loadout sync` renders it to each tool's directory.

**Path templates:**
- `{base}` — Tool's base directory (e.g., `.claude`, `.cursor`)
- `{stem}` — Filename without extension
- `{ext}` — Source file extension
- `{name}` — Directory name (for `layout: dir`)

**Detection options:**
```yaml
detect:
  pathPrefix: prompts/      # Match paths starting with prefix
# or
detect:
  pathExact: AGENTS.md      # Match exact path
```

**Naming convention:** Use dot-namespaced IDs (e.g., `myteam.prompt`) to avoid collisions with built-ins.

List all registered kinds with `loadout kinds -v`.

### Supported Tools

| Tool | Rules | Skills | Instructions |
|------|-------|--------|--------------|
| Claude Code | `.claude/rules/*.md` | `.claude/skills/` | `CLAUDE.md` (generated wrapper) |
| Cursor | `.cursor/rules/*.mdc` | `.cursor/skills/` | `AGENTS.md` |
| OpenCode | `.opencode/rules/*.md` | `.opencode/skills/` | `AGENTS.md` |
| Codex | — | `.agents/skills/` | `AGENTS.md` |
| Pi | `.pi/rules/*.md` | `.pi/skills/` | `AGENTS.md` |

**Tool-specific notes:**

- **Claude Code** — Generates a `CLAUDE.md` wrapper that references `AGENTS.md`, keeping both in sync.
- **Cursor** — Rules use `.mdc` extension. Loadout automatically converts `paths` ↔ `globs` in frontmatter.
- **OpenCode** — Rules require the `opencode-rules` plugin. Add `"opencode-rules"` to `plugins` in `opencode.json`.
- **Codex** — Rules not yet supported; skills and instructions only.

---

## Commands

### Active Configuration

Commands for managing what's currently applied.

#### `loadout info [name]`

Show detailed loadout information including artifacts, tools, and token estimates.

```bash
loadout info              # Show active loadout(s)
loadout info backend      # Show specific loadout
loadout info -g           # Show global loadout
```

The output shows a table with:
- **kind** — Artifact type (rule, skill, instruction)
- **artifact** — Relative path in `.loadout/`
- **upfront** — Tokens loaded at session start
- **lazy** — Tokens loaded on-demand (skills only)
- **tool columns** — Which tools receive each artifact (✓)

#### `loadout activate <names...>`

Add loadout(s) to the active set and render outputs.

```bash
loadout activate backend              # Activate backend loadout
loadout activate base frontend        # Activate multiple loadouts
loadout activate ml -g                # Activate global loadout
loadout activate backend --dry-run    # Preview changes
```

#### `loadout deactivate <names...>`

Remove loadout(s) from the active set.

```bash
loadout deactivate backend            # Deactivate backend
loadout deactivate backend --dry-run  # Preview changes
```

#### `loadout clear`

Deactivate all loadouts and remove all outputs.

```bash
loadout clear             # Clear project scope
loadout clear -g          # Clear global scope
loadout clear -a          # Clear both scopes
loadout clear --dry-run   # Preview what would be removed
```

#### `loadout status`

Show drift status for active loadouts. Detects:
- **Config drift** — Loadout definition changed (items added/removed)
- **Output drift** — Managed files modified, missing, or unlinked

```bash
loadout status            # Check all scopes
loadout status -l         # Project only
```

#### `loadout sync`

Re-render active loadouts from latest definitions. Use after editing rules or skills.

```bash
loadout sync              # Sync all scopes
loadout sync -l           # Project only
loadout sync --dry-run    # Preview changes
```

---

### Loadout Management

Commands for creating and managing loadout definitions.

#### `loadout init`

Initialize a new loadout directory.

```bash
loadout init              # Initialize .loadout/ in current directory
loadout init -g           # Initialize ~/.config/loadout/
loadout init --force      # Overwrite existing
```

Creates the directory structure, a `base` loadout, and applies it automatically. If existing tool configurations are detected, offers to import them.

#### `loadout install`

Discover and import existing tool configurations into loadout.

```bash
loadout install                   # Discover all, prompt before importing
loadout install --dry-run         # Preview what would be imported
loadout install -i                # Interactive selection mode
loadout install -y                # Auto-confirm (import all, resolve conflicts automatically)
loadout install --rules           # Only import rules
loadout install --skills          # Only import skills
loadout install --from cursor     # Only from specific tool directories
loadout install --keep            # Keep original files (don't delete after import)
loadout install --to staging      # Add to a specific loadout instead of base
```

Scans all known tool directories (`.claude/`, `.cursor/`, `.opencode/`, `.agents/`, `.pi/`) for rules, skills, and instruction files. Detects naming conflicts when the same artifact exists in multiple locations.

#### `loadout create <name>`

Create a new loadout definition.

```bash
loadout create backend                        # Create project loadout
loadout create ml -g                          # Create global loadout
loadout create api -e base                    # Extend another loadout
loadout create test -d "Testing config"       # With description
loadout create backend --no-edit              # Don't open in editor
```

#### `loadout edit <name>`

Open a loadout definition in `$EDITOR`.

```bash
loadout edit backend      # Edit project loadout
loadout edit base -g      # Edit global loadout
```

#### `loadout remove [name]`

Remove applied loadout outputs (deletes rendered files).

```bash
loadout remove            # Remove all applied outputs
loadout remove backend    # Validate name before removing
loadout remove --dry-run  # Preview what would be removed
```

#### `loadout list`

List available loadouts.

```bash
loadout list              # List all scopes
loadout list -l           # Project only
loadout list -g           # Global only
```

Shows name, item count, description, and inheritance chain.

#### `loadout check`

Validate loadout configuration.

```bash
loadout check             # Check all scopes
loadout check -v          # Verbose output
```

Validates:
- YAML syntax
- All referenced files exist
- No circular extends
- Tool prerequisites satisfied
- No unmanaged file collisions

#### `loadout diff [name]`

Preview what would change if a loadout were applied.

```bash
loadout diff              # Diff default loadout
loadout diff backend      # Diff specific loadout
```

Shows files to create, update, or delete.

---

### Artifact Authoring

Commands for creating and managing rules, skills, and instructions.

#### Rules

Rules are scoped advisory files that apply to specific file patterns.

```bash
# Create a rule
loadout rule add my-rule
loadout rule add go-style -g                   # Global rule
loadout rule add api -d "API guidelines"       # With description
loadout rule add test -p "**/*.test.ts"        # With paths
loadout rule add strict --always-apply         # Always apply

# List rules
loadout rule list
loadout rule list -g

# Edit a rule
loadout rule edit my-rule
loadout rule edit go-style -g

# Remove a rule
loadout rule remove my-rule
loadout rule remove old-rule -g --force

# Import existing rule file
loadout rule import ./CLAUDE.md
loadout rule import ./.cursor/rules/code.mdc --keep
```

Rule files use YAML frontmatter:

```markdown
---
description: Go coding standards
paths: ["**/*.go"]
alwaysApply: false
---

# Go Standards

Use errors.Join() for error wrapping.
```

#### Skills

Skills are directories with a `SKILL.md` and optional supporting files.

```bash
# Create a skill
loadout skill add deploy
loadout skill add debug -g                      # Global skill
loadout skill add test -d "Testing utilities"   # With description

# List skills
loadout skill list
loadout skill list -a                           # All scopes

# Edit a skill
loadout skill edit deploy
loadout skill edit debug -g

# Remove a skill
loadout skill remove deploy
loadout skill remove old-skill -g --force

# Import existing skill directory
loadout skill import ./my-skill
loadout skill import ~/.claude/skills/debug -g --keep
```

Skill structure:

```
skills/deploy/
├── SKILL.md              # Required: description and instructions
├── references/           # Optional: supporting documents
└── scripts/              # Optional: executable scripts
```

#### Instructions

Each loadout can have its own instruction file at `.loadout/instructions/AGENTS.<loadout>.md`. The active loadout's instructions are rendered to `AGENTS.md` at project root.

```bash
# Create instruction file for a loadout
loadout instructions init              # For active loadout (default: base)
loadout instructions init backend      # For specific loadout
loadout instructions init --force      # Overwrite existing

# Edit instruction file
loadout instructions edit              # Edit active loadout's instructions
loadout instructions edit backend      # Edit specific loadout's instructions

# List instruction files
loadout instructions list

# Import existing instruction file
loadout instructions import            # Auto-detect AGENTS.md or CLAUDE.md
loadout instructions import --to backend  # Import to specific loadout
loadout instructions import ./docs/AGENTS.md --keep
```

#### Kinds

List all registered artifact kinds.

```bash
loadout kinds             # List built-in and custom kinds
loadout kinds -v          # Show detection rules and tool mappings
```

---

## Configuration Reference

### Root Config: `loadout.yaml`

```yaml
version: "1"              # Required: config version
default: base             # Default loadout to apply
mode: symlink             # Output mode: symlink | copy | generate
tools:                    # Tools to target (default: all)
  - claude-code
  - cursor
  - opencode
sources:                  # Other .loadout/ directories to include
  - ../..                 # Relative path (to directory containing .loadout/)
  - ~/shared/configs      # Absolute or ~ paths supported
```

### Loadout Definition: `loadouts/<name>.yaml`

```yaml
name: backend                           # Required: loadout name
description: Backend configuration      # Optional: description
extends: base                           # Optional: inherit from another loadout

tools:                                  # Optional: override default tools
  - claude-code
  - opencode

include:                                # Required: list of artifacts
  - rules/go.md                         # Simple path
  - skills/deploy                       # Skill directory
  - path: rules/cursor-only.md          # With per-item options
    tools: [cursor]
```

### State File: `.loadout/.state.json`

Internal file tracking applied state. Automatically managed; do not edit manually.

### Skill Format: `SKILL.md`

Skills require a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: debugging
description: Advanced debugging techniques for Python applications.
---

# Debugging Skill

## When to Use

Invoke this skill when the user needs help debugging...

## Instructions

1. First, identify the error type...
2. Check the stack trace...

## Examples

...
```

**Required frontmatter:**
- `name` — Skill identifier
- `description` — Brief description (this is the "upfront" token cost)

**Optional structure:**
```
skills/debugging/
├── SKILL.md              # Required
├── references/           # Supporting documents (loaded lazily)
│   └── error-codes.md
└── scripts/              # Executable helpers
    └── analyze.sh
```

---

## Git and Team Workflows

### Automatic Gitignore Management

Loadout automatically manages your `.gitignore` to exclude only the specific files it creates. This means:

- **Tool directories stay usable** — You can have custom settings in `.cursor/`, `.claude/`, etc.
- **Only managed paths are ignored** — Loadout tracks exactly what it writes
- **Custom artifacts coexist** — Add your own rules/skills alongside loadout-managed ones

When you run `loadout sync` or `loadout activate`, loadout adds a managed section to `.gitignore`:

```gitignore
# <loadout>
# Auto-generated by loadout. Do not edit this section.
.loadout/.state.json
.cursor/rules/coding-style.mdc
.cursor/skills/debug/SKILL.md
.cursor/skills/debug/references/errors.md
.claude/rules/coding-style.md
.claude/skills/debug/SKILL.md
.claude/skills/debug/references/errors.md
CLAUDE.md
# </loadout>
```

This section is automatically updated when you add or remove artifacts.

**What gets committed:**
- `.loadout/` directory (your source configs)
- `AGENTS.md` at project root (canonical instructions)
- `.gitignore` (including the managed section)

**What stays local:**
- All paths listed in the `# <loadout>` section
- The `.loadout/.state.json` state file

### Custom Tool Configs

Because loadout only ignores specific paths, you can safely add custom configurations that loadout doesn't manage:

```
.cursor/
├── rules/
│   ├── coding-style.mdc    # Managed by loadout (ignored)
│   └── my-custom.mdc       # Your custom rule (committed)
├── skills/
│   ├── debug/              # Managed by loadout (ignored)
│   └── my-skill/           # Your custom skill (committed)
└── mcp.json                # Tool settings (committed)
```

Loadout's shadowing behavior ensures it never overwrites unmanaged files.

### Team Onboarding

Loadout creates two mechanisms for automatic sync on clone/pull:

**Option 1: Git hooks** (recommended)

After cloning, team members run once:
```bash
git config core.hooksPath .loadout/hooks
```

This enables automatic sync on `git checkout` and `git pull`. For JS projects, add to `package.json` to automate:
```json
{
  "scripts": {
    "prepare": "git config core.hooksPath .loadout/hooks 2>/dev/null || true"
  }
}
```

**Option 2: Direnv**

If your team uses [direnv](https://direnv.net/), team members run once:
```bash
direnv allow
```

This enables automatic sync when entering the project directory.

**Manual fallback:**
```bash
loadout sync              # Regenerates all outputs from .loadout/
```

The hooks and `.envrc` gracefully skip if loadout isn't installed, so they won't break anything for users without it.

### CI/CD

In CI, either:
1. **Skip loadout entirely** — AI tools aren't used in CI
2. **Run `loadout sync`** — If your CI uses AI tools for code review

---

## Output Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `symlink` | Target symlinks to source | Default; edits stay in sync |
| `copy` | Target is a managed copy | When tools don't follow symlinks |
| `generate` | Target is rendered/wrapped | Tool-specific transformations |

---

## Scope Flags

All commands support consistent scope flags:

| Flag | Description |
|------|-------------|
| `-l, --local` | Project scope only |
| `-g, --global` | Global scope only |
| `-a, --all` | Both scopes |
| (none) | Auto-detect or default |

---

## Common Workflows

### New Project

```bash
loadout init
loadout rule add coding-standards
loadout sync
```

### Migrating Existing Project

```bash
loadout init
loadout instructions import              # Grabs AGENTS.md or CLAUDE.md
loadout rule import .cursor/rules/*.mdc  # Import Cursor rules
loadout skill import .claude/skills/*    # Import Claude skills
loadout check                            # Validate
loadout sync                             # Render to all tools
```

### Adding Global Config

```bash
loadout init -g
loadout rule add -g my-style
loadout activate base -g
```

### Checking for Drift

```bash
loadout status      # See what changed
loadout sync        # Reconcile
```

---

## Shadowed Files

A **shadowed file** occurs when loadout wants to write to a path that already contains an unmanaged file (one loadout didn't create).

Loadout **never overwrites** unmanaged files. Instead, it:
1. Skips that output
2. Records it as "shadowed" in the state
3. Reports it in `loadout status` and `loadout info`

**To resolve shadowed files:**

```bash
# Option 1: Import the existing file into loadout
loadout rule import .cursor/rules/existing.mdc

# Option 2: Remove the file manually, then sync
rm .cursor/rules/existing.mdc
loadout sync

# Option 3: Keep the unmanaged file (it takes precedence)
# Just ignore the warning — loadout won't touch it
```

---

## Token Estimation

`loadout info` shows token estimates for context cost:

- **Upfront tokens** — Loaded at session start (rules, instructions, skill descriptions)
- **Lazy tokens** — Loaded on-demand when invoked (full skill content)

Estimation uses ~4 characters per token, which is approximate but good enough to compare loadouts and catch bloat.

Skills are special: only the `description` from `SKILL.md` frontmatter is upfront; the full skill content is lazy-loaded when the agent invokes it.

---

## Troubleshooting

### "No .loadout/ directory found"

Run `loadout init` to create one, or check you're in the right directory.

### "Loadout not found: <name>"

The loadout doesn't exist. Check available loadouts with `loadout list`.

### "Cannot infer artifact kind for path"

The file path doesn't match any known kind. Check:
- Rules must be in `rules/` directory
- Skills must be in `skills/` directory
- Custom kinds need a `.loadout/kinds/*.yaml` definition

### "Include not found"

A file referenced in your loadout's `include` list doesn't exist. Check the path is relative to `.loadout/`.

### Outputs not updating after edits

Run `loadout sync` to regenerate outputs from sources.

### Symlinks broken after moving project

Symlinks use absolute paths. Run `loadout sync` to recreate them.

---

## Removing Loadout

To completely remove loadout from a project:

```bash
# Remove all managed outputs
loadout clear

# Delete the loadout directory
rm -rf .loadout

# Optionally remove the generated CLAUDE.md wrapper
rm CLAUDE.md
```

For global config:

```bash
loadout clear -g
rm -rf ~/.config/loadout
```

---

## Tips

- **Edit sources, not outputs.** Changes to `.loadout/` are the source of truth. Run `loadout sync` after editing.

- **Use `--dry-run`** to preview changes before applying them.

- **Check token cost** with `loadout info` before activating large configurations.

- **Monorepo support** — Put shared config at repo root, package-specific config in each package's `.loadout/`.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `EDITOR` | Editor for `edit` commands (fallback: `VISUAL`, then `vim`) |
| `VISUAL` | Fallback editor if `EDITOR` is unset |
| `PAGER` | Pager for `loadout docs` (default: `less`) |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid config, missing files, validation failure) |

---

## See Also

- [AgentSkills Specification](https://agentskills.io)
- Project repository: `loadout/`
