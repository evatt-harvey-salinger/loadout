# Quickstart

Get loadout running in under a minute.

## Installation

```bash
npm install -g @evatt/loadout
```

Requires Node.js 18+.

## Getting Started

The fastest way to start is `loadout init`, which detects and imports any existing agent configs:

```bash
loadout init
```

This creates `.loadout/`, scans for existing rules/skills in `.claude/`, `.cursor/`, `.opencode/`, etc., and offers to import them. If you have scattered configs, this is the recommended entry point.

**To import explicitly** (or re-import later):

```bash
loadout install                   # Discover and import existing configs
loadout install --dry-run         # Preview what would be imported
loadout install -i                # Interactive mode (select what to import)
```

## New Project (no existing configs)

If you're starting fresh with no existing agent configs:

```bash
loadout init                      # Creates .loadout/ with a base loadout
loadout rule add coding-standards # Create a rule file
loadout sync                      # Render to tool directories
```

Your rule now appears in `.claude/rules/`, `.cursor/rules/`, and other configured tools.

**Verify it worked:**
```bash
loadout status                    # Should show "ok" with no drift
```

## Existing Project (with scattered configs)

Already have rules in `.cursor/rules/` or `.claude/rules/`? The recommended flow:

```bash
loadout init                      # Detects configs and offers to import
```

If you skipped import during init, or want to import additional configs later:

```bash
loadout install                   # Import existing configs
loadout sync                      # Render unified config
```

This finds rules/skills across `.claude/`, `.cursor/`, `.opencode/`, etc. and consolidates them into `.loadout/`.

**Verify it worked:**
```bash
loadout list                      # Shows your loadouts
loadout status                    # Shows rendered artifacts
```

## Task-Specific Loadouts

Create separate loadouts for different work contexts:

```bash
loadout create backend -e base    # New loadout extending base
loadout rule add api-standards    # Create a rule
loadout edit backend              # Add rules/api-standards.md to include list
loadout activate backend          # Apply it
```

Switch contexts by activating different loadouts:

```bash
loadout activate base frontend    # Frontend work
loadout activate base backend ml  # Backend + ML combined
```

## How It Works

1. **Source files** live in `.loadout/` (rules, skills, loadout definitions)
2. **Loadouts** bundle artifacts together (`loadouts/base.yaml`)
3. **Activating** a loadout renders its artifacts to each tool's expected location
4. **Syncing** re-renders after you edit source files

## What's Next

- `loadout docs concepts` — Understand loadouts, scopes, and tools
- `loadout docs authoring` — Create rules, skills, instructions
- `loadout docs workflows` — Team onboarding, git hooks, CI setup
