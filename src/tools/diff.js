import { diffLines } from "diff";
import chalk from "chalk";

/**
 * Render a colored unified-style diff between two texts.
 * Green = added, Red = removed, Dim = unchanged context (truncated).
 *
 * @param {string} oldText
 * @param {string} newText
 * @param {string} filePath
 * @param {{ contextLines?: number }} [opts]
 */
export function renderDiff(oldText, newText, filePath = "", opts = {}) {
  const { contextLines = 3 } = opts;
  const parts = diffLines(oldText, newText);

  let out = "";
  out += chalk.bold.red(`--- ${filePath} (before)\n`);
  out += chalk.bold.green(`+++ ${filePath} (after)\n`);

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const lines = part.value.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();

    if (part.added) {
      for (const l of lines) out += chalk.green(`+ ${l}\n`);
    } else if (part.removed) {
      for (const l of lines) out += chalk.red(`- ${l}\n`);
    } else {
      // Trim context: keep first/last N lines, show "..." for rest.
      if (lines.length <= contextLines * 2) {
        for (const l of lines) out += chalk.dim(`  ${l}\n`);
      } else {
        const isFirst = p === 0;
        const isLast = p === parts.length - 1;
        const head = isFirst ? [] : lines.slice(0, contextLines);
        const tail = isLast ? [] : lines.slice(-contextLines);
        for (const l of head) out += chalk.dim(`  ${l}\n`);
        out += chalk.dim.italic(`  ... (${lines.length - head.length - tail.length} unchanged lines)\n`);
        for (const l of tail) out += chalk.dim(`  ${l}\n`);
      }
    }
  }

  return out;
}

/**
 * Summary stats for a diff — useful for logging.
 */
export function diffStats(oldText, newText) {
  const parts = diffLines(oldText, newText);
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    const lines = p.value.split("\n").filter(Boolean).length;
    if (p.added) added += lines;
    else if (p.removed) removed += lines;
  }
  return { added, removed };
}
