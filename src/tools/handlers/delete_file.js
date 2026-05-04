import fs from "fs/promises";
import { isSafePath } from "../../utils/utils.js";
import { updateIndex } from "../../rag/semantic.js";
import { loadConfig } from "../../config/config.js";
import { exists, confirmExecution, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ path: filePath }) {
  try {
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!(await exists(filePath))) return `❌ Error: File not found at '${filePath}'.`;

    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return `❌ Error: '${filePath}' is a directory.\n💡 Tip: Use rm -rf via run_command (caution advised).`;
    }

    const { autoApprove } = loadConfig();
    if (!autoApprove) {
      const ok = await confirmExecution(`Delete ${filePath}?`, "destructive");
      if (!ok) return "🚫 Cancelled: Deletion denied by user.";
    }

    await fs.unlink(filePath);
    await updateIndex(filePath);
    return `✅ Success: Deleted '${filePath}'`;
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
    return `❌ Error deleting file: ${err.message}`;
  }
}
