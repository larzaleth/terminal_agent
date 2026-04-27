/**
 * Structured logger that only prints to stderr when MYAGENT_DEBUG=1 is set.
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
  },
};
