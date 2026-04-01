import os from "os";

// ===========================
// 🔹 OS & SHELL DETECTION
// ===========================
export function detectOS() {
  const platform = os.platform();
  const map = { win32: "Windows", darwin: "macOS", linux: "Linux" };
  return map[platform] || platform;
}

export function detectShell() {
  if (os.platform() === "win32") return process.env.ComSpec || "cmd.exe";
  return process.env.SHELL || "/bin/bash";
}

// ===========================
// 🔹 RETRY WITH EXPONENTIAL BACKOFF
// ===========================
export async function retry(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;

      const isRetryable =
        err.message?.includes("429") ||
        err.message?.includes("503") ||
        err.message?.includes("ECONNRESET") ||
        err.message?.includes("ETIMEDOUT") ||
        err.message?.includes("rate limit") ||
        err.message?.includes("overloaded");

      if (!isRetryable) throw err;

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      console.log(`\n⏳ Retry ${attempt + 1}/${maxRetries} in ${(jitter / 1000).toFixed(1)}s...`);
      await new Promise((r) => setTimeout(r, jitter));
    }
  }
}

// ===========================
// 🔹 TOOL CLASSIFICATION
// ===========================
const READ_ONLY_TOOLS = new Set(["read_file", "list_dir", "grep_search", "get_file_info"]);

export function isReadOnlyTool(name) {
  return READ_ONLY_TOOLS.has(name);
}

// ===========================
// 🔹 FORMAT HELPERS
// ===========================
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function truncate(str, maxLen = 5000) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `\n... (truncated, ${str.length - maxLen} more chars)`;
}
