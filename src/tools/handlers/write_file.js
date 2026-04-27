import fs from "fs/promises";
import path from "path";
import { isSafePath } from "../../utils/utils.js";
import { updateIndex } from "../../rag/semantic.js";
import { backupFile } from "../../utils/backup.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ path: filePath, content }) {
  try {
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!content) {
      return "❌ Error: Content cannot be empty.\n💡 Tip: Provide the full content to write to the file.";
    }

    const dir = path.dirname(filePath);
    if (!(await exists(dir))) await fs.mkdir(dir, { recursive: true });

    // P0: Add backup before writing
    const backupPath = await backupFile(filePath);
    const backupMsg = backupPath ? `\n   💾 Backup: ${backupPath}` : "";

    await fs.writeFile(filePath, content);
    await updateIndex(filePath);

    const lines = content.split("\n").length;
    return `✅ Success: Written to ${filePath}\n   📊 ${content.length} characters, ${lines} lines${backupMsg}`;
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
    if (err.code === "ENOSPC") return `❌ Error: No space left on device.`;
    return `❌ Error writing file: ${err.message}`;
  }
}
