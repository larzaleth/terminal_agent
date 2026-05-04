import os from "os";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// ===========================
// 🔹 OS & SHELL DETECTION
// ===========================
export function detectOS() {
  const platform = os.platform();
  const map = { win32: "Windows", darwin: "macOS", linux: "Linux" };
  return map[platform] || platform;
}

export function getGitInfo() {
  try {
    // Check if we are in a git repo
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
    
    const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
    const status = execSync("git status --short", { encoding: "utf8" }).trim();
    const lastCommit = execSync("git log -1 --oneline", { encoding: "utf8" }).trim();
    
    return {
      isRepo: true,
      branch,
      status: status || "clean",
      lastCommit,
    };
  } catch {
    return { isRepo: false };
  }
}

export function resolveCommandShell(platform = os.platform(), env = process.env) {
  if (platform === "win32") {
    if (env.MYAGENT_WINDOWS_SHELL === "cmd") {
      return {
        shell: env.ComSpec || "cmd.exe",
        args: ["/c"],
        label: env.ComSpec || "cmd.exe",
      };
    }

    const shell = env.MYAGENT_POWERSHELL_PATH || "powershell.exe";
    return {
      shell,
      args: ["-NoLogo", "-NoProfile", "-Command"],
      label: shell,
    };
  }

  return {
    shell: "/bin/sh",
    args: ["-c"],
    label: env.SHELL || "/bin/sh",
  };
}

export function detectShell() {
  return resolveCommandShell().label;
}

export function resolveTerminationPlan(pid, platform = os.platform()) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (platform === "win32") {
    return {
      mode: "command",
      command: "taskkill.exe",
      args: ["/pid", String(pid), "/T", "/F"],
    };
  }
  return {
    mode: "signal",
    signal: "SIGKILL",
  };
}

// ===========================
// 🔹 PATH SAFETY
// ===========================
// Resolves `filePath` against the current working directory and ensures
// the resolved location stays inside the CWD tree. Rejects absolute paths
// that escape (e.g. /etc/passwd, C:\Windows\...) and traversal via `..`.
// For existing paths (or existing parent directories for new files), realpath
// is used so symlinks cannot smuggle writes outside the workspace.
export function isSafePath(filePath, root = process.cwd()) {
  if (typeof filePath !== "string" || filePath.trim() === "") return false;
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, filePath);
  if (!isPathInside(resolved, normalizedRoot)) return false;

  try {
    const realRoot = fs.realpathSync.native(normalizedRoot);
    const existing = nearestExistingPath(resolved);
    if (!existing) return false;
    const realExisting = fs.realpathSync.native(existing);
    return isPathInside(realExisting, realRoot);
  } catch {
    return false;
  }
}

function isPathInside(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function nearestExistingPath(targetPath) {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

// ===========================
// 🔹 RETRY WITH EXPONENTIAL BACKOFF
// ===========================
export async function retry(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, onRetry } = options;

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
      const reason = status ? `HTTP ${status}` : msg.slice(0, 80);
      if (typeof onRetry === "function") {
        onRetry({ attempt: attempt + 1, maxRetries, delayMs: jitter, reason });
      } else {
        console.log(`\n⏳ Retry ${attempt + 1}/${maxRetries} in ${(jitter / 1000).toFixed(1)}s...`);
      }
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

export function appendBoundedBuffer(buffer, chunk, maxLen) {
  const base = buffer || "";
  const addition = chunk || "";
  if (!Number.isFinite(maxLen) || maxLen <= 0) return "";
  const combined = base + addition;
  if (combined.length <= maxLen) return combined;
  return combined.slice(combined.length - maxLen);
}

export function wordCount(text) {
  if (!text || typeof text !== "string") return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Rough estimation of token count.
 * - default ratio 4 (conservative, used for context-window thresholds)
 * - cost-tracker uses ratio 3.5 (closer to real billed tokens for OpenAI/Gemini)
 */
export function estimateTokens(text, charsPerToken = 4) {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(text.length / charsPerToken);
}

export async function writeFileAtomic(filePath, content) {
  const tmpPath = getAtomicTempPath(filePath);
  await fs.promises.writeFile(tmpPath, content);
  try {
    await fs.promises.rename(tmpPath, filePath);
  } catch (err) {
    if (err.code !== "EEXIST" && err.code !== "EPERM") throw err;
    await fs.promises.rm(filePath, { force: true });
    await fs.promises.rename(tmpPath, filePath);
  } finally {
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
  }
}

export function writeFileAtomicSync(filePath, content) {
  const tmpPath = getAtomicTempPath(filePath);
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (err.code !== "EEXIST" && err.code !== "EPERM") throw err;
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tmpPath, filePath);
  } finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

function getAtomicTempPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  return path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
}
