/**
 * Shared fallback script content for loadout.
 * Used by both init and sync to keep the fallback script up to date.
 */

import * as path from "node:path";
import { writeFile, makeExecutable, ensureDir } from "../lib/fs.js";

export const FALLBACK_SCRIPT = `#!/bin/sh
# Fallback sync for loadout - applies basic configuration without loadout installed
# This script is called by git hooks and direnv when loadout is not available

set -e
cd "$(dirname "$0")/.."

# Skip if already synced
[ -f ".loadout/.state.json" ] && exit 0

# If loadout is available, use it
if command -v loadout >/dev/null 2>&1; then
  echo "loadout: Applying base configuration..."
  loadout sync -l
  exit 0
fi

# Fallback: symlink all artifacts without loadout
echo ""
echo "⚠ This project uses loadout for AI tool configuration."
echo "  Install with: npm install -g loadout"
echo ""
echo "  Applying fallback configuration..."

# Instructions
if [ -f ".loadout/AGENTS.md" ] && [ ! -e "AGENTS.md" ]; then
  ln -s .loadout/AGENTS.md AGENTS.md
  echo "  ✓ AGENTS.md"
fi
if [ ! -e "CLAUDE.md" ]; then
  cat > CLAUDE.md << 'CLAUDE_EOF'
# Claude Code Instructions

> This file is auto-generated. Install loadout for full configuration.
> npm install -g loadout && loadout sync

See [AGENTS.md](AGENTS.md) for project instructions.
CLAUDE_EOF
  echo "  ✓ CLAUDE.md"
fi

# Rules - symlink to all tool directories
for rule in .loadout/rules/*.md; do
  [ -f "$rule" ] || continue
  stem=$(basename "$rule" .md)
  for tooldir in .claude .cursor .opencode .pi; do
    mkdir -p "$tooldir/rules"
    ext="md"
    [ "$tooldir" = ".cursor" ] && ext="mdc"
    target="$tooldir/rules/$stem.$ext"
    [ -e "$target" ] || ln -s "../../$rule" "$target"
  done
  echo "  ✓ rules/$stem.md"
done

# Skills - symlink individual files to all tool directories
for skilldir in .loadout/skills/*/; do
  [ -d "$skilldir" ] || continue
  skillname=$(basename "$skilldir")
  find "$skilldir" -type f | while read -r file; do
    relpath="\${file#$skilldir}"
    for tooldir in .claude .cursor .opencode .agents .pi; do
      targetdir="$tooldir/skills/$skillname/$(dirname "$relpath")"
      mkdir -p "$targetdir"
      target="$tooldir/skills/$skillname/$relpath"
      depth=$(echo "$target" | tr -cd '/' | wc -c)
      updirs=$(printf '../%.0s' $(seq 1 $depth))
      [ -e "$target" ] || ln -s "\${updirs}$file" "$target"
    done
  done
  echo "  ✓ skills/$skillname"
done

echo ""
echo "  Run 'loadout sync' after installing for full configuration."
`;

export const HOOK_SCRIPT = `#!/bin/sh
# Auto-sync loadout after checkout/clone/merge
exec .loadout/sync-fallback.sh 2>/dev/null || true
`;

export const ENVRC_LINES = `
# Auto-sync loadout on directory entry
[ -x .loadout/sync-fallback.sh ] && .loadout/sync-fallback.sh
`;

/**
 * Write the main fallback sync script.
 * Works for both git root and subprojects.
 */
export function writeFallbackScript(loadoutPath: string): void {
  writeFile(path.join(loadoutPath, "sync-fallback.sh"), FALLBACK_SCRIPT);
  makeExecutable(path.join(loadoutPath, "sync-fallback.sh"));
}

/**
 * Write git hooks that call the fallback script.
 * Only meaningful when .loadout/ is at git root.
 */
export function writeGitHooks(loadoutPath: string): void {
  const hooksDir = path.join(loadoutPath, "hooks");
  ensureDir(hooksDir);
  writeFile(path.join(hooksDir, "post-checkout"), HOOK_SCRIPT);
  writeFile(path.join(hooksDir, "post-merge"), HOOK_SCRIPT);
  makeExecutable(path.join(hooksDir, "post-checkout"));
  makeExecutable(path.join(hooksDir, "post-merge"));
}

/**
 * Write all fallback infrastructure (script + hooks).
 * Use writeFallbackScript() alone for subprojects where git hooks don't apply.
 */
export function writeFallbackScripts(loadoutPath: string): void {
  writeFallbackScript(loadoutPath);
  writeGitHooks(loadoutPath);
}
