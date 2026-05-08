---
name: loadout-usage
description: Use this skill when creating, editing, or managing AI agent configuration—including rules, skills, instructions, hooks, loadouts, or any artifacts in .loadout/. Provides guidance on loadout CLI and authoring patterns.
---

# Using Loadout

This project uses **loadout** to manage AI agent configuration. All source artifacts live in `.loadout/` and are rendered to tool directories (`.claude/`, `.cursor/`, etc.) via `loadout sync`.

## Key Principles

1. **Edit sources, not outputs.** Modify files in `.loadout/`, then run `loadout sync`. Never edit rendered files in `.claude/`, `.cursor/`, etc. directly.

2. **Two-step artifact creation.** The CLI creates a template file, then you edit it:
   ```bash
   # Step 1: Create template (use --no-edit to skip editor)
   loadout rule add my-rule --no-edit
   # Output shows: File: /path/to/.loadout/rules/my-rule.md
   
   # Step 2: Edit the file at that path with your content
   # Step 3: Run loadout sync to apply
   ```

3. **Check before committing.** Validate configuration:
   ```bash
   loadout check -v              # Validate all config
   loadout status                # Check for drift
   ```

## Creating Artifacts

### Rules
```bash
loadout rule add <name> --no-edit
# Then edit: .loadout/rules/<name>.md
# Then run: loadout sync
```

Rule format:
```markdown
---
description: Brief description for routing
paths: ["**/*.go"]        # File patterns to apply to
alwaysApply: false        # Set true if always relevant
---

# Rule Title

Your rule content here.
```

### Skills
```bash
loadout skill add <name> --no-edit
# Then edit: .loadout/skills/<name>/SKILL.md
# Then run: loadout sync
```

Skill format:
```markdown
---
name: skill-name
description: Brief description (shown upfront; triggers skill loading)
---

# Skill Title

## When to Use
Describe when this skill applies.

## Instructions
Detailed instructions for the agent.
```

### Instructions
```bash
loadout instructions init <loadout-name>
# Then edit: .loadout/instructions/AGENTS.<loadout-name>.md
# Then run: loadout sync
```

## File Locations

```
.loadout/
├── loadouts/*.yaml       # Loadout definitions
├── rules/*.md            # Rule files
├── skills/*/SKILL.md     # Skill directories
└── instructions/*.md     # Per-loadout instructions
```

## Common Commands

| Task | Command |
|------|---------|
| Create rule template | `loadout rule add <name> --no-edit` |
| Create skill template | `loadout skill add <name> --no-edit` |
| Create loadout | `loadout create <name> -e base` |
| Apply changes | `loadout sync` |
| See what's active | `loadout info` |
| Validate config | `loadout check -v` |

## Getting More Help

Run `loadout docs <topic>` for detailed documentation:

- `loadout docs quickstart` — Get started fast
- `loadout docs concepts` — Core model (loadouts, artifacts, scopes)
- `loadout docs commands` — Full command reference
- `loadout docs authoring` — Creating rules, skills, instructions
