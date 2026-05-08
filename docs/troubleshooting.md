# Troubleshooting

## Common Issues

### "No .loadout/ directory found"

Run `loadout init` to create one, or check you're in the right directory.

### "Loadout not found: <name>"

The loadout doesn't exist in the current scope. Check available loadouts:
```bash
loadout list        # Project scope
loadout list -g     # Global scope
loadout list -a     # Both scopes
```

### "Cannot infer artifact kind for path"

The file path doesn't match any known kind. Built-in kinds expect:
- **Rules:** `rules/*.md`
- **Skills:** `skills/<name>/SKILL.md`
- **Instructions:** `instructions/AGENTS.*.md`
- **Prompts:** `prompts/*.md`

For custom artifact types, create a `.loadout/kinds/*.yaml` definition. Run `loadout kinds -v` to see all registered kinds and their detection rules.

### "Include not found"

A file in your loadout's `include` list doesn't exist. Paths are relative to `.loadout/`.

### Outputs not updating after edits

Run `loadout sync` to regenerate outputs from sources. Then verify with `loadout status`.

If outputs still don't appear, check:
1. Is the artifact included in an active loadout? (`loadout info`)
2. Is the loadout activated? (`loadout status`)

### Symlinks broken after moving project

Symlinks use absolute paths. Run `loadout sync` to recreate them.

### Tool not picking up rules/skills

First, verify outputs were rendered:
```bash
loadout status    # Check for drift or missing outputs
loadout sync      # Re-render if needed
```

**Cursor:** Rules need `.mdc` extension — loadout handles this automatically. Restart Cursor if rules don't appear immediately.

**OpenCode:** Rules require the `opencode-rules` plugin. Add to `opencode.json`:
```json
{ "plugins": ["opencode-rules"] }
```

**Claude Code:** Verify rules exist in `.claude/rules/`. May require restarting the session.

**Codex:** Rules not yet supported; skills and instructions only.

---

## Validation

Run validation to catch issues:
```bash
loadout check -v
```

Validates:
- YAML syntax
- All referenced files exist
- No circular `extends`
- Tool prerequisites satisfied
- No unmanaged file collisions (shadowed files)

### Shadowed file collision

A **shadowed file** occurs when loadout wants to write to a path that already has an unmanaged file. Loadout never overwrites unmanaged files — it skips them and reports the collision.

**To resolve:**
```bash
loadout rule import .cursor/rules/existing.mdc  # Import into loadout
# OR
rm .cursor/rules/existing.mdc && loadout sync   # Remove and re-render
# OR keep the unmanaged file (it takes precedence)
```

---

## Debugging

### Preview changes without applying
```bash
loadout activate backend --dry-run
loadout sync --dry-run
```

### See what's active
```bash
loadout status
loadout info
```

### Check token cost
```bash
loadout info backend    # Shows upfront and lazy tokens
```

---

## Removing Loadout

### From a project

**Warning:** These commands delete your loadout configuration. Back up `.loadout/` first if you want to preserve your rules and skills.

```bash
loadout clear           # Remove all managed outputs (safe, reversible)
```

To fully remove loadout from a project:
```bash
loadout clear           # Remove managed outputs first
rm -rf .loadout         # Delete source config (irreversible)
rm CLAUDE.md            # Remove generated wrapper if present
```

### Global config

```bash
loadout clear -g        # Remove global managed outputs
rm -rf ~/.config/loadout  # Delete global config (irreversible)
```

---

## Getting Help

```bash
loadout --help          # Command overview
loadout <cmd> --help    # Command-specific help
loadout docs            # Full documentation
loadout docs <topic>    # Topic-specific docs
```
