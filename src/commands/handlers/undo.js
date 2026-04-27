import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { exists } from "../../tools/handlers/base.js";

/**
 * Slash command: /undo
 * Reverts the most recent file changes by restoring the latest backups.
 */
export async function undoCommand(args) {
  const backupDir = ".agent_backups";
  if (!(await exists(backupDir))) {
    console.log(chalk.yellow("⚠️ No backups found. Nothing to undo."));
    return;
  }

  // Find all backup files recursively
  const allBackups = await getAllBackups(backupDir);
  if (allBackups.length === 0) {
    console.log(chalk.yellow("⚠️ No backups found. Nothing to undo."));
    return;
  }

  // Sort by timestamp (newest first)
  // Backup format: path/to/file.ext.TIMESTAMP.bak
  allBackups.sort((a, b) => b.mtime - a.mtime);

  if (args[0] === "list") {
    console.log(chalk.cyan.bold("\n🕒 Recent Backups:"));
    allBackups.slice(0, 10).forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.originalPath} (${new Date(b.mtime).toLocaleString()})`);
    });
    return;
  }

  // Undo the most recent one (or N ones if specified)
  const count = parseInt(args[0]) || 1;
  const toRestore = allBackups.slice(0, count);

  console.log(chalk.cyan(`\n⏪ Undoing last ${toRestore.length} change(s)...`));

  for (const b of toRestore) {
    try {
      await fs.copyFile(b.fullPath, b.originalPath);
      console.log(chalk.green(`  ✅ Restored ${b.originalPath}`));
      // Optionally remove the backup after restore? Better keep it for safety.
    } catch (err) {
      console.log(chalk.red(`  ❌ Failed to restore ${b.originalPath}: ${err.message}`));
    }
  }
}

async function getAllBackups(dir, baseDir = dir) {
  let results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await getAllBackups(fullPath, baseDir));
    } else if (entry.name.endsWith(".bak")) {
      const stats = await fs.stat(fullPath);
      
      // Reconstruct original path
      // backupDir/src/utils/utils.js.12345.bak -> src/utils/utils.js
      const relativeToBackup = path.relative(baseDir, fullPath);
      const parts = relativeToBackup.split(path.sep);
      const fileNameWithTs = parts.pop();
      const originalFileName = fileNameWithTs.split(".").slice(0, -2).join(".");
      const originalPath = path.join(...parts, originalFileName);

      results.push({
        fullPath,
        originalPath,
        mtime: stats.mtimeMs
      });
    }
  }
  return results;
}

export const name = "/undo";
