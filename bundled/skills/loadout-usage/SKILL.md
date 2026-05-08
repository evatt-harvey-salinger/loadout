---
name: loadout-usage
description: Use this skill when creating, editing, or managing AI agent configuration—including rules, skills, instructions, hooks, loadouts, or any artifacts in .loadouts/. Provides guidance on loadouts CLI and authoring patterns.
---

# Using Loadouts

This project uses **loadouts** to manage AI agent configuration. All source artifacts live in `.loadouts/` and are rendered to tool directories (`.claude/`, `.cursor/`, etc.) via `loadouts sync`.

## Key Principles

1. **Edit sources, not outputs.** Modify files in `.loadouts/`, then run `loadouts sync`. Never edit rendered files in `.claude/`, `.cursor/`, etc. directly.

2. **Two-step artifact creation.** The CLI creates a template file, then you edit it:
   ```bash
   # Step 1: Create template (use --no-edit to skip editor)
   loadouts rule add my-rule --no-edit
   # Output shows: File: /path/to/.loadouts/rules/my-rule.md
   
   # Step 2: Edit the file at that path with your content
   # Step 3: Run loadouts sync to apply
   ```

3. **Check before committing.** Validate configuration:
   ```bash
   loadouts check -v              # Validate all config
   loadouts status                # Check for drift
   ```

## Creating Artifacts

### Rules
```bash
loadouts rule add <name> --no-edit
# Then edit: .loadouts/rules/<name>.md
# Then run: loadouts sync
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
loadouts skill add <name> --no-edit
# Then edit: .loadouts/skills/<name>/SKILL.md
# Then run: loadouts sync
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
loadouts instructions init <loadout-name>
# Then edit: .loadouts/instructions/AGENTS.<loadout-name>.md
# Then run: loadouts sync
```

## File Locations

```
.loadouts/
├── loadouts/*.yaml       # Loadout bundle definitions
├── rules/*.md            # Rule files
├── skills/*/SKILL.md     # Skill directories
└── instructions/*.md     # Per-loadout instructions
```

## Common Commands

| Task | Command |
|------|---------|
| Create rule template | `loadouts rule add <name> --no-edit` |
| Create skill template | `loadouts skill add <name> --no-edit` |
| Create loadout | `loadouts create <name> -e base` |
| Apply changes | `loadouts sync` |
| See what's active | `loadouts info` |
| Validate config | `loadouts check -v` |

## Getting More Help

Run `loadouts docs <topic>` for detailed documentation:

- `loadouts docs quickstart` — Get started fast
- `loadouts docs concepts` — Core model (loadouts, artifacts, scopes)
- `loadouts docs commands` — Full command reference
- `loadouts docs authoring` — Creating rules, skills, instructions
