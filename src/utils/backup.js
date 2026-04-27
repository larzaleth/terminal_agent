import fs from "fs/promises";
import path from "path";

/**
 * Backup a file to the .agent_backups directory.
 * @param {string} filePath - Path to the file to backup.
 * @returns {Promise<string|null>} - Path to the backup file, or null if source doesn't exist.
 */
export async function backupFile(filePath) {
  try {
    // Check if source exists
    try {
      await fs.access(filePath);
    } catch {
      return null;
    }

    const backupRootDir = ".agent_backups";
    const ts = Date.now();
    const relativeDir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    
    // We create a nested structure matching the original path inside the backup dir
    // to avoid collisions and make it easy to find.
    const backupDir = path.join(backupRootDir, relativeDir);
    await fs.mkdir(backupDir, { recursive: true });

    const backupPath = path.join(backupDir, `${fileName}.${ts}.bak`);
    await fs.copyFile(filePath, backupPath);
    
    return backupPath;
  } catch (err) {
    // We don't want to fail the main tool execution if backup fails,
    // but we should log it if debug mode is on.
    if (process.env.MYAGENT_DEBUG === "1") {
      console.error(`[DEBUG] Backup failed for ${filePath}: ${err.message}`);
    }
    return null;
  }
}
