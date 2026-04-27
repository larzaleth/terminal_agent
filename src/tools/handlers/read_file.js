import fs from "fs/promises";
import fsSync from "fs";
import { createInterface } from "readline";
import { isSafePath } from "../../utils/utils.js";
import { MAX_TOOL_OUTPUT_CHARS } from "../../config/constants.js";
import { exists, UNSAFE_PATH_MSG, FILE_PREVIEW_NOTICE } from "./base.js";

async function readFilePreview(filePath, maxChars = MAX_TOOL_OUTPUT_CHARS) {
  const previewLimit = Math.max(256, maxChars - FILE_PREVIEW_NOTICE.length);
  const lines = [];
  let currentLength = 0;
  let lineNumber = 0;
  let truncated = false;

  const stream = fsSync.createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of reader) {
      lineNumber++;
      const numberedLine = `${lineNumber}: ${line}`;
      const additionLength = numberedLine.length + (lines.length > 0 ? 1 : 0);

      if (currentLength + additionLength > previewLimit) {
        truncated = true;
        if (lines.length === 0 && previewLimit > 0) {
          lines.push(numberedLine.slice(0, previewLimit));
        }
        break;
      }

      lines.push(numberedLine);
      currentLength += additionLength;
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  const output = lines.join("\n");
  return truncated ? `${output}${FILE_PREVIEW_NOTICE}` : output;
}

export default async function ({ path: filePath }) {
  try {
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!(await exists(filePath))) {
      return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use list_dir to explore available files, or grep_search to find files by name.`;
    }

    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return `❌ Error: '${filePath}' is a directory, not a file.\n💡 Tip: Use list_dir to view directory contents.`;
    }

    return await readFilePreview(filePath);
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
    if (err.code === "EISDIR") return `❌ Error: '${filePath}' is a directory.`;
    return `❌ Error reading file: ${err.message}`;
  }
}
