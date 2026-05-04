import fs from "fs/promises";
import { isSafePath } from "../../utils/utils.js";
import { scheduleIndexUpdate } from "../../rag/semantic.js";
import { backupFile } from "../../utils/backup.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

/**
 * Replace a range of lines in a file with new content.
 * This is MUCH faster than edit_file for large refactoring tasks because the
 * agent doesn't need to copy-paste the exact target string — it only needs
 * line numbers.
 *
 * @param {string} path - File path to edit
 * @param {number} startLine - First line to replace (1-indexed, inclusive)
 * @param {number} endLine - Last line to replace (1-indexed, inclusive)
 * @param {string} content - Replacement content (replaces the entire range)
 */
export default async function ({ path: filePath, startLine, endLine, content }) {
  try {
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!(await exists(filePath))) {
      return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use write_file to create new files.`;
    }

    if (!startLine || !endLine || startLine < 1 || endLine < startLine) {
      return `❌ Error: Invalid line range. startLine=${startLine}, endLine=${endLine}. Both must be positive integers and startLine <= endLine.`;
    }

    if (content === undefined || content === null) {
      return `❌ Error: Content cannot be null/undefined. Use an empty string to delete lines.`;
    }

    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.split("\n");

    if (startLine > lines.length) {
      return `❌ Error: startLine (${startLine}) exceeds file length (${lines.length} lines).`;
    }

    // Clamp endLine to file length
    const effectiveEnd = Math.min(endLine, lines.length);

    // Backup before editing
    const backupPath = await backupFile(filePath);
    const backupMsg = backupPath ? `\n   💾 Backup: ${backupPath}` : "";

    // Build new content: lines before range + replacement + lines after range
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(effectiveEnd);
    const replacementLines = content === "" ? [] : content.split("\n");

    const newLines = [...before, ...replacementLines, ...after];
    const newContent = newLines.join("\n");

    await fs.writeFile(filePath, newContent);
    scheduleIndexUpdate(filePath);

    const removedCount = effectiveEnd - startLine + 1;
    const addedCount = replacementLines.length;
    const delta = addedCount - removedCount;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

    return `✅ Success: Replaced lines ${startLine}-${effectiveEnd} in ${filePath}\n   📝 -${removedCount} old / +${addedCount} new (net ${deltaStr} lines)${backupMsg}`;
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
    return `❌ Error replacing lines: ${err.message}`;
  }
}
