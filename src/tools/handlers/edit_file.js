import fs from "fs/promises";
import { isSafePath } from "../../utils/utils.js";
import { scheduleIndexUpdate } from "../../rag/semantic.js";
import { backupFile } from "../../utils/backup.js";
import { diffStats } from "../diff.js";
import { getPrompter } from "../../core/prompter.js";
import { DIFF_AUTO_APPROVE_ENV } from "../../config/constants.js";
import { loadConfig } from "../../config/config.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ path: filePath, target, replacement }) {
  try {
    const cfg = loadConfig();
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!(await exists(filePath))) {
      return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use write_file to create new files.`;
    }
    if (!target) {
      return "❌ Error: Target string cannot be empty.";
    }

    const content = await fs.readFile(filePath, "utf-8");
    const occurrences = content.split(target).length - 1;
    if (occurrences === 0) {
      return `❌ Error: Target string not found in '${filePath}'.\n💡 Tip: Use read_file first to verify the exact content including whitespace.`;
    }

    if (occurrences > 1) {
      return `❌ Error: Target string found ${occurrences} times in '${filePath}'.\n💡 Tip: Provide a more unique target string (include surrounding lines) to ensure the correct part is edited.`;
    }

    const newContent = content.replace(target, replacement);
    const { added, removed } = diffStats(content, newContent);

    // Show the diff preview (unless auto-approved via env var, non-TTY, or very small change).
    const autoApprove =
      cfg.autoApprove ||
      process.env[DIFF_AUTO_APPROVE_ENV] === "1" ||
      !process.stdin.isTTY ||
      (added + removed <= 50);
    if (!autoApprove) {
      const { decision } = await getPrompter().editApproval({
        filePath,
        oldContent: content,
        newContent,
        added,
        removed,
      });
      if (decision === "reject") return "🚫 Cancelled: Edit rejected by user.";
      if (decision === "manual") {
        return `🚫 Cancelled: User wants to edit manually. File '${filePath}' was NOT modified.\n💡 Tip: Make the change yourself, then tell the agent what you did.`;
      }
    }

    // P0: Add backup before editing
    const backupPath = await backupFile(filePath);
    const backupMsg = backupPath ? `\n   💾 Backup: ${backupPath}` : "";

    await fs.writeFile(filePath, newContent);
    scheduleIndexUpdate(filePath);

    const delta = added - removed;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    return `✅ Success: Edited ${filePath}\n   📝 +${added} / -${removed} lines (net ${deltaStr})${backupMsg}`;
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
    return `❌ Error editing file: ${err.message}`;
  }
}
