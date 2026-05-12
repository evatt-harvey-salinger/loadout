/**
 * Filesystem helpers
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Ensure a directory exists, creating parent directories as needed.
 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Write content to a file, creating parent directories as needed.
 */
export function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Read a file as UTF-8 string.
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Check if a file exists.
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Check if a path is a directory.
 */
export function isDirectory(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

/**
 * Check if a path is a symlink.
 */
export function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Read the target of a symlink and resolve to absolute path.
 * Returns null if not a symlink or on error.
 */
export function readSymlinkTarget(linkPath: string): string | null {
  try {
    if (!isSymlink(linkPath)) return null;
    const target = fs.readlinkSync(linkPath);
    // Resolve relative symlink targets against the link's directory
    if (path.isAbsolute(target)) {
      return target;
    }
    return path.resolve(path.dirname(linkPath), target);
  } catch {
    return null;
  }
}

/**
 * Create a symlink (relative if possible).
 * Idempotent: if symlink already exists with correct target, does nothing.
 */
export function createSymlink(target: string, linkPath: string): void {
  ensureDir(path.dirname(linkPath));

  // Use relative path for the symlink, resolving any symlinks in the
  // parent directory to ensure correct relative path calculation
  const linkDir = path.dirname(linkPath);
  const realLinkDir = fs.realpathSync(linkDir);
  const relativeTarget = path.relative(realLinkDir, target);

  // Check if symlink already exists with correct target
  if (isSymlink(linkPath)) {
    const existingTarget = fs.readlinkSync(linkPath);
    if (existingTarget === relativeTarget) {
      return; // Already correct, nothing to do
    }
    // Wrong target, remove and recreate
    fs.unlinkSync(linkPath);
  } else if (fs.existsSync(linkPath)) {
    // Something else exists (file/dir), remove it
    fs.unlinkSync(linkPath);
  }

  fs.symlinkSync(relativeTarget, linkPath);
}

/**
 * Remove a file or symlink.
 */
export function removeFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Remove a directory recursively.
 */
export function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
  }
}

/**
 * Remove a filesystem path, handling symlinks safely.
 */
export function removePath(targetPath: string): void {
  if (isSymlink(targetPath)) {
    removeFile(targetPath);
    return;
  }

  if (isDirectory(targetPath)) {
    removeDir(targetPath);
    return;
  }

  removeFile(targetPath);
}

/**
 * Copy a file.
 */
export function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * Copy a directory recursively.
 */
export function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

/**
 * Hash file content (SHA-256).
 */
export function hashContent(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

/**
 * Hash a file.
 */
export function hashFile(filePath: string): string {
  const content = readFile(filePath);
  return hashContent(content);
}

/**
 * Hash a directory (concatenate all file hashes).
 */
export function hashDir(dirPath: string): string {
  const hashes: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        hashes.push(hashFile(fullPath));
      }
    }
  }

  walk(dirPath);
  return hashContent(hashes.join("\n"));
}

/**
 * List files in a directory (non-recursive).
 */
export function listFiles(dirPath: string): string[] {
  if (!isDirectory(dirPath)) return [];
  return fs.readdirSync(dirPath);
}

/**
 * List files matching a pattern in a directory.
 */
export function listFilesWithExtension(
  dirPath: string,
  extension: string
): string[] {
  return listFiles(dirPath).filter((f) => f.endsWith(extension));
}

/**
 * Make a file executable (chmod +x).
 */
export function makeExecutable(filePath: string): void {
  fs.chmodSync(filePath, 0o755);
}

/**
 * Walk a directory recursively and return all file paths relative to the root.
 */
export function walkDir(dirPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string, prefix: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relativePath);
      } else {
        results.push(relativePath);
      }
    }
  }

  walk(dirPath, "");
  return results;
}
