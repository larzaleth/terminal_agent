import os from "os";
import path from "path";

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
// 🔹 PATH SAFETY
// ===========================
// Resolves `filePath` against the current working directory and ensures
// the resolved location stays inside the CWD tree. Rejects absolute paths
// that escape (e.g. /etc/passwd, C:\Windows\...) and traversal via `..`.
export function isSafePath(filePath, root = process.cwd()) {
  if (typeof filePath !== "string" || filePath.trim() === "") return false;
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, filePath);
  if (resolved === normalizedRoot) return true;
  return resolved.startsWith(normalizedRoot + path.sep);
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

      const status = err?.status ?? err?.response?.status;
      const msg = err?.message ?? "";
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 502 ||
        /429|503|502|ECONNRESET|ETIMEDOUT|rate.?limit|overloaded/i.test(msg);

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

export function wordCount(text) {
  if (!text || typeof text !== "string") return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
