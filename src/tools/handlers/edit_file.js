import fs from "fs/promises";
import { isSafePath } from "../../utils/utils.js";
import { scheduleIndexUpdate } from "../../rag/semantic.js";
import { backupFile } from "../../utils/backup.js";
import { diffStats } from "../diff.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ path: filePath, target, replacement }) {
  try {
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!(await exists(filePath))) {
      return `Error: File not found at '${filePath}'.\nTip: Use write_file to create new files.`;
    }
    if (!target) {
      return "Error: Target string cannot be empty.";
    }

    const content = await fs.readFile(filePath, "utf-8");
    const occurrences = content.split(target).length - 1;
    if (occurrences === 0) {
      return `Error: Target string not found in '${filePath}'.\nTip: Use read_file first to verify the exact content including whitespace.`;
    }

    if (occurrences > 1) {
      return `Error: Target string found ${occurrences} times in '${filePath}'.\nTip: Provide a more unique target string with surrounding lines.`;
    }

    const newContent = content.replace(target, replacement);
    const { added, removed } = diffStats(content, newContent);

    const backupPath = await backupFile(filePath);
    const backupMsg = backupPath ? `\n   Backup: ${backupPath}` : "";

    await fs.writeFile(filePath, newContent);
    scheduleIndexUpdate(filePath);

    const delta = added - removed;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    return `Success: Edited ${filePath}\n   +${added} / -${removed} lines (net ${deltaStr})${backupMsg}`;
  } catch (err) {
    if (err.code === "EACCES") return `Error: Permission denied for '${filePath}'.`;
    return `Error editing file: ${err.message}`;
  }
}
