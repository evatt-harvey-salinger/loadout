# Command Reference

## Active Configuration

### `loadout activate <names...>`
Add loadout(s) to the active set and render outputs.
```bash
loadout activate backend              # Single loadout
loadout activate base frontend        # Multiple loadouts
loadout activate ml -g                # Global scope
loadout activate backend --dry-run    # Preview only
```

### `loadout deactivate <names...>`
Remove loadout(s) from the active set.
```bash
loadout deactivate backend
```

### `loadout sync`
Re-render active loadouts from latest definitions. Run after editing rules or skills.
```bash
loadout sync              # All scopes
loadout sync -l           # Project only
loadout sync --dry-run    # Preview
```

### `loadout status`
Show drift status. Detects config drift (definition changed) and output drift (files modified/missing).
```bash
loadout status
```

### `loadout clear`
Deactivate all loadouts and remove all outputs.
```bash
loadout clear             # Project scope
loadout clear -g          # Global scope
loadout clear -a          # Both scopes
```

### `loadout info [name]`
Show loadout details including artifacts, tools, and token estimates.
```bash
loadout info              # Active loadout(s)
loadout info backend      # Specific loadout
```

### `loadout diff [name]`
Preview what would change if a loadout were applied.
```bash
loadout diff backend
```

---

## Loadout Management

### `loadout init`
Initialize a new `.loadout/` directory. Creates structure, base loadout, and applies it.
```bash
loadout init              # Project
loadout init -g           # Global
loadout init --force      # Overwrite existing
```

### `loadout install`
Discover and import existing tool configurations.
```bash
loadout install                   # All configs
loadout install --dry-run         # Preview
loadout install -i                # Interactive
loadout install --rules           # Rules only
loadout install --from cursor     # From specific tool
loadout install --keep            # Don't delete originals
```

### `loadout create <name>`
Create a new loadout definition.
```bash
loadout create backend            # Project loadout
loadout create ml -g              # Global loadout
loadout create api --extends base # Extend another loadout
loadout create test -d "Testing"  # With description
```

### `loadout edit <name>`
Open a loadout definition in `$EDITOR`.
```bash
loadout edit backend
```

### `loadout remove [name]`
Remove applied loadout outputs.
```bash
loadout remove            # All outputs
loadout remove backend    # Validate name first
loadout remove --dry-run  # Preview
```

### `loadout list`
List available loadouts with item count, description, and inheritance.
```bash
loadout list              # All scopes
loadout list -l           # Project only
loadout list -g           # Global only
```

### `loadout check`
Validate configuration (YAML syntax, file references, circular extends, tool prerequisites).
```bash
loadout check
loadout check -v          # Verbose
```

---

## Artifact Authoring

### Rules

Create scoped advisory files that tools inject based on file context.

```bash
loadout rule add my-rule                 # Create rule
loadout rule add go -p "**/*.go"         # With path pattern
loadout rule add strict --always-apply   # Always apply
loadout rule list                        # List rules
loadout rule edit my-rule                # Edit rule
loadout rule remove my-rule              # Remove rule
loadout rule import ./existing.md        # Import file
```

After creating a rule, add it to your loadout's `include` list and run `loadout sync`.

### Skills

Create on-demand capabilities with instructions and supporting files.

```bash
loadout skill add deploy                 # Create skill
loadout skill add debug -g               # Global skill
loadout skill list                       # List skills
loadout skill edit deploy                # Edit skill
loadout skill remove deploy              # Remove skill
loadout skill import ./my-skill          # Import directory
```

After creating a skill, add it to your loadout's `include` list and run `loadout sync`.

### Instructions

Create per-loadout instruction files that render to `AGENTS.md` or `CLAUDE.md`.

```bash
loadout instructions init                # Create for active loadout
loadout instructions init backend        # For specific loadout
loadout instructions edit                # Edit instructions
loadout instructions list                # List instruction files
loadout instructions import              # Import existing AGENTS.md
loadout instructions import --loadout backend  # Import to specific loadout
```

### Kinds
```bash
loadout kinds             # List registered kinds
loadout kinds -v          # With detection rules
```

---

## Scope Flags

Most state commands (`activate`, `deactivate`, `sync`, `status`, `clear`, `list`, `info`, `check`) support scope flags:

| Flag | Description |
|------|-------------|
| `-l, --local` | Project scope only |
| `-g, --global` | Global scope only |
| `-a, --all` | Both scopes |

When omitted, commands auto-detect scope based on context. Use `--dry-run` to preview behavior before destructive operations.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `EDITOR` | Editor for edit commands |
| `VISUAL` | Fallback editor |
| `PAGER` | Pager for docs (default: `less`) |
