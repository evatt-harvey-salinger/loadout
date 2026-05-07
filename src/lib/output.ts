/**
 * Terminal output helpers
 */

import chalk from "chalk";

export const log = {
  info: (msg: string) => console.log(chalk.blue("ℹ"), msg),
  success: (msg: string) => console.log(chalk.green("✓"), msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠"), msg),
  error: (msg: string) => console.log(chalk.red("✗"), msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  plain: (msg: string) => console.log(msg),
};

export function heading(title: string): void {
  console.log();
  console.log(chalk.bold(title));
  console.log(chalk.dim("─".repeat(title.length)));
}

export function list(items: string[], indent: number = 2): void {
  const pad = " ".repeat(indent);
  for (const item of items) {
    console.log(`${pad}${chalk.dim("•")} ${item}`);
  }
}

export function keyValue(
  pairs: Record<string, string | undefined>,
  indent: number = 2
): void {
  const pad = " ".repeat(indent);
  for (const [key, value] of Object.entries(pairs)) {
    if (value !== undefined) {
      console.log(`${pad}${chalk.dim(key + ":")} ${value}`);
    }
  }
}
