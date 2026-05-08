# Authoring Artifacts

This guide covers creating rules, skills, and instructions. The typical workflow:

1. **Create** an artifact (`loadout rule add`, `loadout skill add`, etc.)
2. **Include** it in a loadout definition (`loadouts/<name>.yaml`)
3. **Sync** to render outputs (`loadout sync`)
4. **Verify** with `loadout status` or `loadout info`

---

## Rules

Rules are scoped advisory files with YAML frontmatter:

```markdown
---
description: Go coding standards
paths: ["**/*.go"]
alwaysApply: false
---

# Go Standards

Use errors.Join() for error wrapping.
```

**Frontmatter options:**
- `description` — Brief summary (shown in listings)
- `paths` — Glob patterns for when to apply (e.g., `["**/*.go", "**/*.mod"]`)
- `alwaysApply` — If true, applies regardless of file context

**Create a rule:**
```bash
loadout rule add api-standards -d "REST API conventions" -p "**/*_handler.go"
```

After creating, add `rules/api-standards.md` to your loadout's `include` list.

**Import existing:**
```bash
loadout rule import .cursor/rules/code.mdc --keep
```

---

## Skills

Skills are directories with a `SKILL.md` and optional supporting files:

```
skills/debugging/
├── SKILL.md              # Required: frontmatter + instructions
├── references/           # Optional: supporting documents
│   └── error-codes.md
└── scripts/              # Optional: executable helpers
    └── analyze.sh
```

**SKILL.md format:**
```markdown
---
name: debugging
description: Advanced debugging techniques for Python applications.
---

# Debugging Skill

## When to Use

Invoke this skill when debugging Python errors...

## Instructions

1. Identify the error type
2. Check the stack trace
...
```

**Required frontmatter:**
- `name` — Skill identifier
- `description` — Brief description (this is the "upfront" token cost; full content is lazy-loaded)

**Create a skill:**
```bash
loadout skill add deploy -d "Deployment procedures"
```

After creating, add `skills/deploy` to your loadout's `include` list.

---

## Instructions

Per-loadout instruction files live at `.loadout/instructions/AGENTS.<loadout>.md`. When activated, they render to `AGENTS.md` (or `CLAUDE.md` for Claude Code, which wraps and references `AGENTS.md`).

**Create instructions:**
```bash
loadout instructions init backend
loadout instructions edit backend
```

**Import existing:**
```bash
loadout instructions import                    # Auto-detects AGENTS.md or CLAUDE.md
loadout instructions import --loadout backend  # Import to specific loadout
```

After creating or importing, run `loadout sync` to render.

---

## Loadout Definitions

Loadouts are YAML files in `.loadout/loadouts/`:

```yaml
name: backend
description: Backend development configuration
extends: base

tools:                                  # Optional: override defaults
  - claude-code
  - opencode

include:
  - rules/go.md                         # Simple path
  - skills/deploy                       # Skill directory
  - path: rules/cursor-only.md          # With options
    tools: [cursor]
```

**Per-include tool targeting:**
```yaml
include:
  - rules/general.md                    # All tools
  - path: rules/cursor-only.md
    tools: [cursor]
  - path: skills/claude-debug
    tools: [claude-code, pi]
```

---

## Custom Kinds

Define custom artifact types in `.loadout/kinds/*.yaml`:

```yaml
# .loadout/kinds/prompt.yaml
id: myteam.prompt
description: Reusable prompt snippets.

detect:
  pathPrefix: prompts/          # Match files in .loadout/prompts/

layout: file                     # One file → one output

targets:
  claude-code:
    path: "{base}/prompts/{stem}{ext}"
  cursor:
    path: "{base}/prompts/{stem}.mdc"
    ext: .mdc
```

**Path templates:** `{base}`, `{stem}`, `{ext}`, `{name}`

**Detection:** `pathPrefix` or `pathExact`

List all kinds: `loadout kinds -v`

---

## Token Estimation

`loadout info` shows token estimates:

- **Upfront** — Loaded at session start (rules, instructions, skill descriptions)
- **Lazy** — Loaded on-demand (full skill content)

Uses ~4 chars/token approximation. Good for comparing loadouts and catching bloat.
