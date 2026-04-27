import fs from "fs";
import { ERROR_LOG_FILE } from "../config/constants.js";

/**
 * Structured logger that prints to stderr and persists errors to a file.
 */
export const log = {
  debug: (...args) => {
    if (process.env.MYAGENT_DEBUG === "1") {
      console.error("[DEBUG]", ...args);
    }
  },
  info: (...args) => {
    console.error("[INFO]", ...args);
  },
  warn: (...args) => {
    console.error("[WARN]", ...args);
  },
  error: (...args) => {
    console.error("[ERROR]", ...args);
    try {
      const timestamp = new Date().toISOString();
      const message = args.map(a => 
        a instanceof Error ? a.stack : typeof a === "object" ? JSON.stringify(a) : String(a)
      ).join(" ");
      
      fs.appendFileSync(ERROR_LOG_FILE, `[${timestamp}] ERROR: ${message}\n`);
    } catch {
      // Best effort file logging
    }
  },
};
