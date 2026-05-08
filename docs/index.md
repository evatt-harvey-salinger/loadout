# Loadout

**Composable configuration bundles for AI coding agents.**

Loadout organizes your rules, skills, and instructions into named **loadouts** that you can mix and match:

- **Task-specific configs** — Activate `backend` for API work, `frontend` for UI work, or both
- **Team flexibility** — Track all configs in one place; teammates activate what they need
- **Tool portability** — Write once, apply to Claude Code, Cursor, OpenCode, Codex, and Pi

```bash
loadout activate base backend     # Backend task
loadout activate base frontend    # Switch to frontend
loadout activate base backend ml  # Combine multiple
```

## Getting Started

```bash
npm install -g @evatt/loadout     # Requires Node.js 18+
loadout docs quickstart           # Step-by-step setup guide
```

## Quick Reference

```bash
# Setup
loadout init                      # Initialize .loadout/
loadout install                   # Import existing configs

# Daily use
loadout activate <name>           # Activate loadout(s)
loadout deactivate <name>         # Deactivate loadout(s)
loadout sync                      # Re-render after edits
loadout status                    # Check for drift (source/output changes)

# Authoring
loadout rule add <name>           # Create a rule
loadout skill add <name>          # Create a skill
loadout instructions init         # Create instructions
loadout create <name>             # Create a loadout

# Info
loadout list                      # List available loadouts
loadout info [name]               # Show loadout details
loadout check                     # Validate configuration
```

## Documentation Topics

```bash
loadout docs quickstart       # Get started in 60 seconds
loadout docs concepts         # Loadouts, artifacts, scopes, tools
loadout docs commands         # Full command reference
loadout docs authoring        # Creating rules, skills, instructions
loadout docs workflows        # Team setup, git, CI/CD
loadout docs troubleshooting  # Common issues and solutions
```

Use `loadout docs <topic>` to read any section, or `loadout docs --list` for descriptions.
