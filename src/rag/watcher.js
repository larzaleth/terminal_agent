import chokidar from "chokidar";
import path from "path";
import chalk from "chalk";
import { scheduleIndexUpdate } from "./semantic.js";
import {
  IGNORE_DIRS,
  CODE_EXTS,
  INDEX_FILE,
  MEMORY_FILE,
  COST_REPORT_FILE,
  ERROR_LOG_FILE,
} from "../config/constants.js";

let watcher = null;

/**
 * Start the filesystem watcher for automatic semantic index updates.
 * @param {string} rootPath - The root directory to watch.
 */
export function startWatcher(rootPath = process.cwd()) {
  if (watcher) return; // Already running

  const internalFiles = new Set([
    INDEX_FILE,
    MEMORY_FILE,
    COST_REPORT_FILE,
    ERROR_LOG_FILE,
  ]);

  const watchOptions = {
    ignored: (filePath) => {
      const name = path.basename(filePath);
      if (name.startsWith(".")) return true; // Ignore hidden files/dirs
      if (IGNORE_DIRS.has(name)) return true; // Ignore common build/vendor dirs
      if (internalFiles.has(name)) return true; // Ignore our own state files
      return false;
    },
    persistent: true,
    ignoreInitial: true,
  };

  watcher = chokidar.watch(rootPath, watchOptions);

  const handleFileChange = async (filePath) => {
    // Only index code files
    const ext = path.extname(filePath);
    if (!CODE_EXTS.includes(ext)) return;

    if (process.env.MYAGENT_DEBUG === "1") {
      console.log(chalk.dim(`\n👀 File changed detected: ${filePath} - updating index...`));
    }
    
    try {
      scheduleIndexUpdate(filePath);
    } catch (err) {
      if (process.env.MYAGENT_DEBUG === "1") {
        console.error(chalk.red(`❌ Failed to update index for ${filePath}: ${err.message}`));
      }
    }
  };

  watcher
    .on("add", handleFileChange)
    .on("change", handleFileChange)
    .on("unlink", handleFileChange);

  if (process.env.MYAGENT_DEBUG === "1") {
    console.log(chalk.blue(`\n🔍 File watcher started on ${rootPath}`));
  }
}

/**
 * Stop the filesystem watcher.
 */
export function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
