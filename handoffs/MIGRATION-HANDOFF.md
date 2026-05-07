# Dotfiles → Loadout Migration Handoff

**Date:** 2026-05-02  
**Status:** Phases 1-3 complete, testing required before continuing

## Executive Summary

Migrating dotfiles from a symlink-based system to loadout-managed agent configuration. Goal: eliminate the "symlink maze" and use loadout as the canonical distribution mechanism for agent content (skills, rules, instructions) while preserving tool harnesses for CLI installation and settings management.

---

## What Was Accomplished

### Phase 1: Created Global Loadout Structure ✅

**Created:**
- `~/dotfiles/loadout/` - new global loadout directory
- `~/dotfiles/loadout/loadout.yaml` - root config
- `~/dotfiles/loadout/loadouts/evatt.yaml` - main loadout definition

**Contents:**
```yaml
# loadout.yaml
version: "1"
default: evatt
mode: symlink

# loadouts/evatt.yaml
- 12 skills (codebase-layout, engineering-for-agents, managing-memory, etc.)
- 4 rules (agent-definitions, instruction-files, rule-format, skill-format)
- AGENTS.md (global personality)
- Total: 18 items, ~46k tokens per tool
```

### Phase 2: Migrated Crew Content ✅

**Moved from `~/dotfiles/shorehouse/crew/` → `~/dotfiles/loadout/`:**
- `AGENTS.md` - global personality and constraints
- `skills/` - all 12 skills
- `rules/` - all 4 rules
- `agents/` - 2 agent definitions (not yet included in loadout - unsupported artifact type)
- `commands/` - 2 commands (not yet included in loadout - unsupported artifact type)

**Deleted:**
- `~/dotfiles/shorehouse/crew/` directory (empty after move)

**Note:** `agents/` and `commands/` are Claude Code-specific and not yet supported by loadout's artifact system.

### Phase 3: Stripped Tool Harnesses ✅

**Removed from `claude/`, `opencode/`, `pi/`:**
- All symlinks to crew/ (agents, commands, rules, skills, AGENTS.md)
- Runtime state files from git tracking (history.jsonl, stats-cache.json)

**Updated .gitignore files to exclude:**
- Runtime directories (backups/, cache/, debug/, sessions/, etc.)
- Generated files (node_modules/, plugins/, commands/)

**Kept in tool harnesses:**
- `install.sh` - CLI installation scripts
- Settings files (settings.json, opencode.jsonc, etc.)
- Tool-specific configs (dcp.jsonc, tui.jsonc, statusline-command.sh)
- Documentation (README.md, references/)

### Phase 4: Global Discovery ✅

**Created symlink:**
```bash
ln -sf ~/dotfiles/loadout ~/.config/loadout
```

**Tested and verified:**
- `loadout list` discovers evatt loadout from any directory ✅
- `loadout info evatt` shows correct item count and token estimates ✅
- Global config discovery working across the system ✅

---

## Current State

### What Works

1. **Global loadout discovery** - loadout finds `~/.config/loadout` from anywhere
2. **Content organization** - all agent content in one canonical location
3. **Tool harnesses** - stripped to essentials (install + settings)
4. **Git tracking** - runtime state properly ignored

### What's Broken

1. **Existing tool installations** - symlinks in `~/.pi/agent/` point to deleted `crew/` directory
2. **No distribution mechanism** - loadout can't yet write to home directories (`~/.claude/`, etc.)
3. **Whole-directory symlinks pollute git** - `~/.claude → ~/dotfiles/claude/` means runtime state in repo

---

## Remaining Work

### Phase 5: Add Global Apply Support to Loadout

**Problem:** Loadout currently writes to project-relative paths (`.claude/`, `.cursor/`), but global config needs to write to home directories (`~/.claude/`, `~/.pi/agent/`, etc.).

**Solution:** Add `--global` or `--system` mode to loadout.

**Implementation options:**

**Option A: `loadout apply --global`**
```bash
# Writes to:
#   ~/.claude/skills/
#   ~/.claude/rules/
#   ~/.cursor/rules/
#   ~/.opencode/rules/
#   ~/.pi/agent/skills/
#   ~/.agents/ (for codex)

loadout apply --global evatt
```

**Option B: `loadout install`** (separate command for system-level installation)
```bash
loadout install evatt  # Installs to home directories
loadout apply          # Project-level (current behavior)
```

**Code changes needed:**
- `src/core/render.ts` - add global mode parameter
- `src/tools/*.ts` - adapters need to support global paths
- `src/cli/commands/apply.ts` - add `--global` flag
- Consider: per-tool config for where global paths live

**Tool-specific global paths:**
```typescript
const GLOBAL_PATHS = {
  'claude-code': '~/.claude',
  'cursor': '~/.cursor',  
  'opencode': '~/.opencode',
  'codex': '~/.agents',
};

// Pi needs special handling (selective paths)
const PI_PATHS = {
  base: '~/.pi/agent',
  selective: ['skills', 'AGENTS.md'], // Don't touch auth.json, sessions/
};
```

### Phase 6: Refactor Install Scripts

**Current state:**
- `claude/install.sh` - creates `~/.claude → ~/dotfiles/claude/` (whole dir)
- `opencode/install.sh` - creates `~/.config/opencode → ~/dotfiles/opencode/` (whole dir)
- `pi/install.sh` - creates selective symlinks (better, but points to deleted crew/)

**Desired state:**

Each tool's install.sh should:
1. **Install CLI tool itself** (if not present)
2. **Create real home directory** (not symlink to dotfiles)
3. **Symlink settings files only**
4. **Let loadout handle agent content**

**Example refactored claude/install.sh:**
```bash
#!/bin/bash

# Install Claude CLI
if ! command -v claude >/dev/null 2>&1; then
  curl -fsSL https://claude.ai/install.sh | bash
fi

# Create real ~/.claude directory
mkdir -p ~/.claude

# Symlink settings only
ln -sf ~/dotfiles/claude/settings.json ~/.claude/settings.json
ln -sf ~/dotfiles/claude/statusline-command.sh ~/.claude/statusline-command.sh

# Agent content managed by loadout (not here)
echo "Run 'loadout apply --global' to install agent content"
```

**Similar changes needed for:**
- `opencode/install.sh`
- `pi/install.sh`

### Phase 7: Update Top-Level install.sh

**Current:** Runs each tool's install.sh

**Update to:**
```bash
#!/bin/bash

# 1. Run tool harness installers
for tool in claude opencode pi; do
  echo "=== Installing $tool ==="
  ./$tool/install.sh
done

# 2. Setup global loadout
echo "=== Setting up global loadout ==="
ln -sf ~/dotfiles/loadout ~/.config/loadout

# 3. Apply global loadout
echo "=== Applying global loadout ==="
loadout apply --global evatt

echo "✅ Installation complete"
```

### Phase 8: Handle Tool-Specific Artifacts

**Problem:** `agents/` and `commands/` directories are Claude Code-specific and not supported by loadout's artifact system.

**Options:**

**Option A: Add new artifact types to loadout**
```typescript
type ArtifactKind = "rule" | "skill" | "instruction" | "agent" | "command";
```

**Option B: Tool-specific includes**
```yaml
# loadouts/evatt.yaml
include:
  - AGENTS.md
  - skills/codebase-layout
  - rules/agent-definitions.md
  
  # Claude Code specific
  - path: agents/planner.md
    tools: [claude-code]
  - path: commands/commit.md
    tools: [claude-code]
```

**Option C: Keep tool-specific content in harnesses**
- Move `agents/`, `commands/` back to `claude/`
- Only cross-tool content lives in loadout

**Recommendation:** Option B (tool-specific includes) is most flexible.

---

## Testing Plan

### Before Continuing

**Test current state:**
1. Verify no broken symlinks in dotfiles repo
2. Check git status - ensure runtime state not tracked
3. Confirm global discovery: `loadout list` from various directories

### After Phase 5 (Global Apply)

**Test global installation:**
```bash
# Clean slate
rm -rf ~/.claude/skills ~/.claude/rules ~/.opencode/rules ~/.pi/agent/skills

# Apply global loadout
loadout apply --global evatt

# Verify outputs created
ls ~/.claude/skills/
ls ~/.claude/rules/
ls ~/.opencode/rules/
ls ~/.pi/agent/skills/

# Verify symlink mode (if mode: symlink)
file ~/.claude/skills/codebase-layout  # Should show: symbolic link

# Test with actual tools
claude --headless "list available skills"
opencode --headless "what skills are available"
pi --headless "what skills do you have"
```

### After Phase 6 (Refactored Install Scripts)

**Test clean install:**
```bash
# Simulate fresh machine
rm -rf ~/.claude ~/.config/opencode ~/.pi/agent

# Run installation
cd ~/dotfiles
./install.sh

# Verify:
# 1. CLI tools installed
which claude
which opencode  
which pi

# 2. Settings symlinked
file ~/.claude/settings.json  # Should be symlink

# 3. Agent content installed
ls ~/.claude/skills/

# 4. No runtime state in git
cd ~/dotfiles
git status  # Should not show sessions/, cache/, etc.
```

### Integration Testing

**Test each tool with real sessions:**
1. Start Claude Code - verify skills loaded
2. Start OpenCode - verify rules applied
3. Start Pi - verify personality present
4. Create test project - verify project can extend global loadout

---

## Open Questions / Decisions Needed

### 1. Global Apply Implementation

- Command name: `--global` flag or separate `install` command?
- Where to document global paths per tool?
- How to handle Pi's selective symlinking needs?

### 2. Runtime State Management

- Keep whole-directory symlinks for now? (simpler, but pollutes git)
- Move to selective symlinks? (cleaner, requires more setup)
- Hybrid approach per tool?

### 3. Tool-Specific Artifacts

- Add `agent` and `command` types to loadout?
- Use tool-specific includes in loadout.yaml?
- Keep in tool harnesses?

### 4. Shorehouse Future

- When to split shorehouse into separate repo?
- What stays in dotfiles vs moves to shorehouse?
- How does loadout reference external repos?

### 5. Migration for Existing Machines

- How do users migrate from old symlink system?
- Migration script needed?
- Backward compatibility concerns?

---

## Success Criteria

Migration is complete when:

- [ ] `loadout apply --global` works and distributes content to home directories
- [ ] Tool install scripts handle CLI + settings only
- [ ] No broken symlinks in dotfiles or home directories
- [ ] Git status clean (no runtime state tracked)
- [ ] All tools (Claude, OpenCode, Pi) load skills/rules correctly
- [ ] Projects can `extends: evatt` to inherit global config
- [ ] Clean install on fresh machine works end-to-end

---

## Files Modified

**Created:**
- `~/dotfiles/loadout/` (entire directory)
- `~/.config/loadout` (symlink)

**Modified:**
- `~/dotfiles/claude/.gitignore`
- `~/dotfiles/opencode/.gitignore`

**Deleted:**
- `~/dotfiles/shorehouse/crew/` (entire directory)
- Symlinks from `claude/`, `opencode/`, `pi/` to crew/

**To be modified:**
- `~/dotfiles/claude/install.sh`
- `~/dotfiles/opencode/install.sh`
- `~/dotfiles/pi/install.sh`
- `~/dotfiles/install.sh`

**To be created:**
- Loadout global apply functionality (code changes in loadout repo)

---

## Next Steps

1. **Immediate:** Test current state, ensure nothing broken
2. **Short term:** Implement global apply in loadout
3. **Medium term:** Refactor install scripts
4. **Long term:** Split shorehouse, add tool-specific artifact support

---

## Contact / Notes

**Loadout repo:** `~/Desktop/non-cui-repos/loadout`  
**Dotfiles repo:** `~/dotfiles`

**Key insight:** Loadout replaces the symlink *distribution* mechanism, but tool harnesses still handle CLI installation and tool-specific settings. The separation is:
- **Loadout:** Agent content (skills, rules, instructions) - cross-tool, portable
- **Harnesses:** Tool installation + tool-specific configuration - per-tool, local

**The vision:** `git clone dotfiles && cd dotfiles && ./install.sh` on a fresh machine installs everything - CLI tools, settings, and global agent configuration - with zero manual symlinking.
