import fs from "fs/promises";
import { isSafePath } from "../../utils/utils.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ dir }) {
  try {
    if (!isSafePath(dir)) return UNSAFE_PATH_MSG;
    if (!dir || dir.trim() === "") return "❌ Error: Directory path cannot be empty.";
    if (await exists(dir)) return `⚠️ Directory '${dir}' already exists.`;

    await fs.mkdir(dir, { recursive: true });
    return `✅ Success: Created directory '${dir}'`;
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied.`;
    return `❌ Error creating directory: ${err.message}`;
  }
}
