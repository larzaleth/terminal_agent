import fs from "fs/promises";
import path from "path";
import { isSafePath } from "../../utils/utils.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ path: filePath }) {
  try {
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!(await exists(filePath))) return `❌ Error: File not found at '${filePath}'.`;

    const stat = await fs.stat(filePath);
    const info = {
      name: path.basename(filePath),
      path: filePath,
      type: stat.isDirectory() ? "directory" : "file",
      size: `${stat.size} bytes (${(stat.size / 1024).toFixed(2)} KB)`,
      modified: stat.mtime.toISOString(),
      created: stat.birthtime.toISOString(),
      extension: path.extname(filePath) || "none",
    };
    return `📋 File Information:\n${JSON.stringify(info, null, 2)}`;
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
    return `❌ Error getting file info: ${err.message}`;
  }
}
