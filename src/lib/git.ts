/**
 * Git operations
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Find the git root directory from the given path.
 * Returns null if not in a git repository.
 */
export async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git rev-parse --show-toplevel", {
      cwd,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Check if a path is inside a git repository.
 */
export async function isInGitRepo(cwd: string): Promise<boolean> {
  return (await findGitRoot(cwd)) !== null;
}
