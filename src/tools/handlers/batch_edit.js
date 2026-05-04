import fs from "fs/promises";
import { isSafePath } from "../../utils/utils.js";
import { updateIndex } from "../../rag/semantic.js";
import { backupFile } from "../../utils/backup.js";
import { diffStats } from "../diff.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ edits }) {
  if (!Array.isArray(edits) || edits.length === 0) {
    return "Error: 'edits' must be a non-empty array of objects { path, target, replacement }.";
  }

  const fileEdits = new Map();
  for (const edit of edits) {
    if (!edit.path || !edit.target || edit.replacement === undefined) {
      return `Error: Invalid edit object: ${JSON.stringify(edit)}. All fields (path, target, replacement) are required.`;
    }
    if (!fileEdits.has(edit.path)) fileEdits.set(edit.path, []);
    fileEdits.get(edit.path).push(edit);
  }

  const overallResults = [];

  for (const [filePath, specificEdits] of fileEdits) {
    try {
      if (!isSafePath(filePath)) {
        overallResults.push(`${filePath}: ${UNSAFE_PATH_MSG}`);
        continue;
      }

      if (!(await exists(filePath))) {
        overallResults.push(`${filePath}: File not found.`);
        continue;
      }

      let currentContent = await fs.readFile(filePath, "utf-8");
      const originalContent = currentContent;
      let appliedCount = 0;
      let skippedCount = 0;

      for (const { target, replacement } of specificEdits) {
        const occurrences = currentContent.split(target).length - 1;
        if (occurrences !== 1) {
          skippedCount++;
          continue;
        }

        currentContent = currentContent.replace(target, replacement);
        appliedCount++;
      }

      if (appliedCount === 0) {
        overallResults.push(`${filePath}: No unique targets found. Skipped: ${skippedCount}`);
        continue;
      }

      const { added, removed } = diffStats(originalContent, currentContent);
      const backupPath = await backupFile(filePath);
      await fs.writeFile(filePath, currentContent);
      await updateIndex(filePath);

      overallResults.push(`${filePath}: Applied ${appliedCount} edits (+${added}/-${removed})${backupPath ? ` (Backup: ${backupPath})` : ""}`);
    } catch (err) {
      overallResults.push(`${filePath}: ${err.message}`);
    }
  }

  return `Batch Edit Results:\n${overallResults.join("\n")}`;
}
