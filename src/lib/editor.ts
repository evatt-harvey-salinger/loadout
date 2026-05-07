/**
 * Shared editor utilities for opening files in $EDITOR.
 */

import { spawn } from "node:child_process";

export interface EditorOptions {
  /** Working directory for the editor process */
  cwd?: string;
  /** Callback when editor exits successfully */
  onSuccess?: () => void;
}

/**
 * Open a file in the user's preferred editor.
 * 
 * Uses $EDITOR, falling back to $VISUAL, then vim.
 * The editor is spawned with the given cwd so file trees show the loadout directory.
 */
export function openInEditor(
  filePath: string,
  options: EditorOptions = {}
): Promise<void> {
  const editor = process.env.EDITOR || process.env.VISUAL || "vim";

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [filePath], {
      stdio: "inherit",
      cwd: options.cwd,
      shell: true,
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to launch editor '${editor}': ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        options.onSuccess?.();
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
  });
}
