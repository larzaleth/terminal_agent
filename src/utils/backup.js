import fs from "fs/promises";
import path from "path";

const BACKUP_ROOT_DIR = ".agent_backups";
const KEEP_BACKUPS_PER_FILE = Number.parseInt(process.env.MYAGENT_BACKUP_KEEP || "20", 10);

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

    const ts = Date.now();
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(process.cwd(), absolutePath);
    const relativeDir = path.dirname(relativePath);
    const fileName = path.basename(filePath);
    
    // We create a nested structure matching the original path inside the backup dir
    // to avoid collisions and make it easy to find.
    const backupDir = path.join(BACKUP_ROOT_DIR, relativeDir);
    await fs.mkdir(backupDir, { recursive: true });

    const backupPath = path.join(backupDir, `${fileName}.${ts}.bak`);
    await fs.copyFile(filePath, backupPath);
    await cleanupBackups(backupDir, fileName);
    
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

async function cleanupBackups(backupDir, fileName) {
  const keep = Number.isFinite(KEEP_BACKUPS_PER_FILE) && KEEP_BACKUPS_PER_FILE > 0
    ? KEEP_BACKUPS_PER_FILE
    : 20;
  try {
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const backups = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.startsWith(`${fileName}.`) || !entry.name.endsWith(".bak")) continue;
      const fullPath = path.join(backupDir, entry.name);
      const stat = await fs.stat(fullPath);
      backups.push({ path: fullPath, mtimeMs: stat.mtimeMs });
    }

    backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
    await Promise.all(backups.slice(keep).map((backup) => fs.unlink(backup.path)));
  } catch {
    /* best-effort cleanup */
  }
}
