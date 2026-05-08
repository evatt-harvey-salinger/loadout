# Loadout Development Guidelines

This document provides guidance for agents working on the loadouts codebase.

## Project Overview

Loadout is a CLI tool for managing composable configuration bundles for AI coding agents. It renders artifacts (rules, skills, instructions, extensions) to tool-specific locations for Claude Code, Cursor, OpenCode, Codex, and Pi.

## Architecture

```
src/
├── core/           # Core logic (resolution, rendering, registry)
├── cli/commands/   # CLI command implementations
├── lib/            # Shared utilities (output formatting, filesystem)
└── builtins/       # Built-in kinds, tools, and transforms
```

### Key Concepts

- **Loadout**: A named bundle of artifacts defined in `loadouts/<name>.yaml`
- **Artifact**: A piece of configuration (rule, skill, instruction, extension)
- **Kind**: Type of artifact with specific layout and behavior
- **Tool**: Target agent (claude-code, cursor, opencode, codex, pi)
- **Scope**: Global (`~/.config/loadouts`) or project (`.loadouts/`)

## Visual Language

**Read [docs/visual-language.md](docs/visual-language.md) before modifying CLI output.**

Key principles:
- Artifact-first tables: rows = artifacts, columns = tools
- Consistent status indicators: `✓` `+` `~` `-` `!` `?` `—`
- Use shared utilities from `src/lib/artifact-table.ts` and `src/lib/output.ts`

## Code Patterns

### Adding a New Command

1. Create `src/cli/commands/<name>.ts`
2. Export a Commander command
3. Add to appropriate group in `src/cli/index.ts`
4. Follow visual language patterns for output

### Modifying Output

1. Check `docs/visual-language.md` for the expected format
2. Use `artifact-table.ts` utilities for table rendering
3. Use `output.ts` helpers for headings, logs, key-value pairs
4. Ensure tool columns are dynamic (don't hardcode tool names)

### Registry Pattern

Kinds, tools, and transforms are registered via the plugin API:
```typescript
api.registerKind({ name: "rule", ... });
api.registerTool({ name: "cursor", ... });
```

Built-ins are in `src/builtins/`. Don't modify core for new kinds/tools.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

Tests use Vitest. Test files are colocated: `foo.ts` → `foo.test.ts`

## Common Tasks

### Preview changes without applying
```bash
npm run loadouts -- activate --dry-run <name>
npm run loadouts -- sync --dry-run
```

### Check for issues
```bash
npm run loadouts -- check -v
npm run loadouts -- status
```

### Build and run locally
```bash
npm run build
npm run loadouts -- <command>
```
