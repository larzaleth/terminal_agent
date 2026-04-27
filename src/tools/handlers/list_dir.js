import fs from "fs/promises";
import { isSafePath } from "../../utils/utils.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ dir }) {
  try {
    if (!isSafePath(dir)) return UNSAFE_PATH_MSG;
    if (!(await exists(dir))) return `❌ Error: Directory not found at '${dir}'.`;

    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return `❌ Error: '${dir}' is not a directory.`;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (entries.length === 0) return `📂 Directory '${dir}' is empty.`;

    return entries
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}${e.isDirectory() ? "/" : ""}`)
      .join("\n");
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${dir}'.`;
    if (err.code === "ENOTDIR") return `❌ Error: '${dir}' is not a directory.`;
    return `❌ Error listing directory: ${err.message}`;
  }
}
