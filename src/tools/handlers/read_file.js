import fs from "fs/promises";
import fsSync from "fs";
import { createInterface } from "readline";
import { isSafePath } from "../../utils/utils.js";
import { MAX_TOOL_OUTPUT_CHARS, FILE_PREVIEW_MAX_CHARS } from "../../config/constants.js";
import { exists, UNSAFE_PATH_MSG, FILE_PREVIEW_NOTICE } from "./base.js";

async function readFileRange(filePath, startLine = 1, endLine = null, maxChars = MAX_TOOL_OUTPUT_CHARS) {
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
      if (lineNumber < startLine) continue;
      if (endLine !== null && lineNumber > endLine) break;

      const numberedLine = `${lineNumber}: ${line}`;
      const additionLength = numberedLine.length + (lines.length > 0 ? 1 : 0);

      if (currentLength + additionLength > previewLimit) {
        truncated = true;
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
  const prefix = startLine > 1 ? `... (skipping first ${startLine - 1} lines)\n` : "";
  return truncated ? `${prefix}${output}${FILE_PREVIEW_NOTICE}` : `${prefix}${output}`;
}

export default async function ({ path: filePath, startLine, endLine }) {
  try {
    if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
    if (!(await exists(filePath))) {
      return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use list_dir to explore available files, or grep_search to find files by name.`;
    }

    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return `❌ Error: '${filePath}' is a directory, not a file.\n💡 Tip: Use list_dir to view directory contents.`;
    }

    // Use the smaller preview cap when no explicit range is requested —
    // agent must opt in to large reads via startLine/endLine.
    const noRange = startLine === undefined && endLine === undefined;
    const cap = noRange ? FILE_PREVIEW_MAX_CHARS : MAX_TOOL_OUTPUT_CHARS;
    return await readFileRange(filePath, startLine, endLine, cap);
  } catch (err) {
    if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
    if (err.code === "EISDIR") return `❌ Error: '${filePath}' is a directory.`;
    return `❌ Error reading file: ${err.message}`;
  }
}
