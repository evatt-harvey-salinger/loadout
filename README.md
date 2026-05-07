# Loadout

**Composable configuration bundles for AI coding agents.**

Organize your rules, skills, and instructions into named **loadouts** that you can mix and match based on the task at hand.

```bash
loadout activate base backend     # Backend work
loadout activate base frontend    # Frontend work  
loadout activate base backend ml  # Combine for ML backend work
```

## Why Loadout?

**Not every task needs the same configuration.** Backend work needs different rules than frontend work. ML projects need specialized skills. Code review needs different context than greenfield development.

**Not every teammate wants the same setup.** One person might want strict linting rules, another prefers minimal guidance. Loadout lets teams track all available configurations while giving individuals the freedom to activate what works for them.

**Not every tool uses the same format.** Claude Code, Cursor, OpenCode, Codex, and Pi each have their own config locations and quirks. Loadout lets you write once and renders correctly for each tool.

## Quick Start

```bash
# Install
npm install -g loadout

# Initialize
loadout init

# Create task-specific loadouts
loadout create backend -e base    # Extends base
loadout create frontend -e base
loadout create ml -e base

# Add rules/skills to each
loadout rule add api-standards    # Add to current loadout
loadout skill add debugging

# Activate what you need
loadout activate backend          # Just backend
loadout activate backend ml       # Backend + ML combined
```

## Importing Existing Configs

Already have rules and skills scattered across tool directories?

```bash
loadout init                      # Detects existing configs automatically
loadout install                   # Or import them separately
loadout sync
```

`loadout install` scans all tool directories (`.claude/`, `.cursor/`, `.opencode/`, etc.) and imports everything it finds. Use `--dry-run` to preview, `-i` for interactive selection.

## Documentation

```bash
loadout docs          # Full documentation
loadout --help        # Command reference
```

Or read [docs/LOADOUT.md](docs/LOADOUT.md).

## Supported Tools

| Tool | Rules | Skills | Instructions |
|------|-------|--------|--------------|
| Claude Code | ✓ | ✓ | ✓ |
| Cursor | ✓ | ✓ | ✓ |
| OpenCode | ✓ | ✓ | ✓ |
| Codex | — | ✓ | ✓ |
| Pi | ✓ | ✓ | ✓ |

## License

MIT
