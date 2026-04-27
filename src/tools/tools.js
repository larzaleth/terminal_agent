import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { spawn } from "child_process";
import { createInterface } from "readline";
import {
  truncate,
  isSafePath,
  resolveCommandShell,
  resolveTerminationPlan,
  appendBoundedBuffer,
} from "../utils/utils.js";
import { classifyCommand } from "./command-classifier.js";
import { diffStats } from "./diff.js";
import { getPrompter } from "../ui/prompter.js";
import { emitToolStream, hasToolStreamCallback } from "../ui/toolStream.js";
import {
  IGNORE_DIRS,
  BINARY_EXTS,
  MAX_TOOL_OUTPUT_CHARS,
  MAX_COMMAND_OUTPUT_CHARS,
  COMMAND_TIMEOUT_MS,
  COMMAND_MAX_BUFFER,
  DIFF_AUTO_APPROVE_ENV,
} from "../config/constants.js";

// ===========================
// 🔹 HELPERS
// ===========================
async function confirmExecution(cmd, reason) {
  const tag = reason ? ` (${reason})` : "";
  return getPrompter().confirm({ message: `Agent wants to run${tag}: \`${cmd}\``, reason });
}

const GREP_MAX_MATCHES = 50;
const FILE_PREVIEW_NOTICE = "\n... (truncated, file preview only)";

// Async recursive walker. Yields files lazily so searches can stop early.
async function* walkFiles(dir, include) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        yield* walkFiles(fullPath, include);
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTS.has(ext)) continue;
      if (include && !matchesIncludePattern(entry.name, include)) continue;
      yield fullPath;
    }
  }
}

const UNSAFE_PATH_MSG =
  "❌ Error: Path is outside the working directory. For security, the agent can only access files inside the current project.";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function matchesIncludePattern(fileName, include) {
  if (!include) return true;
  const escaped = include.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(fileName);
}

async function readFilePreview(filePath, maxChars = MAX_TOOL_OUTPUT_CHARS) {
  const previewLimit = Math.max(256, maxChars - FILE_PREVIEW_NOTICE.length);
  const lines = [];
  let currentLength = 0;
  let lineNumber = 0;
  let truncated = false;

  const stream = fsSync.createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of reader) {
      lineNumber++;
      const numberedLine = `${lineNumber}: ${line}`;
      const additionLength = numberedLine.length + (lines.length > 0 ? 1 : 0);

      if (currentLength + additionLength > previewLimit) {
        truncated = true;
        if (lines.length === 0 && previewLimit > 0) {
          lines.push(numberedLine.slice(0, previewLimit));
        }
        break;
      }

      lines.push(numberedLine);
      currentLength += additionLength;
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  const output = lines.join("\n");
  return truncated ? `${output}${FILE_PREVIEW_NOTICE}` : output;
}

function createSearchMatcher(pattern, isRegex) {
  if (!isRegex) {
    const needle = pattern.toLowerCase();
    return (line) => line.toLowerCase().includes(needle);
  }

  const regex = new RegExp(pattern, "i");
  return (line) => regex.test(line);
}

async function collectMatchesFromFile(filePath, matcher, matches, maxMatches) {
  const stream = fsSync.createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;

  try {
    for await (const line of reader) {
      lineNumber++;
      if (!matcher(line)) continue;
      matches.push(`${filePath}:${lineNumber}: ${line.trim()}`);
      if (matches.length >= maxMatches) return true;
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return false;
}

async function fallbackGrepSearch({ pattern, dir, include, isRegex, maxMatches = GREP_MAX_MATCHES }) {
  const matcher = createSearchMatcher(pattern, isRegex);
  const matches = [];
  let filesScanned = 0;
  let sawFiles = false;

  for await (const file of walkFiles(dir, include)) {
    sawFiles = true;
    filesScanned++;
    try {
      const reachedLimit = await collectMatchesFromFile(file, matcher, matches, maxMatches);
      if (reachedLimit) break;
    } catch {
      /* skip unreadable files */
    }
  }

  return {
    matches,
    filesScanned,
    sawFiles,
    limited: matches.length >= maxMatches,
  };
}

async function ripgrepSearch({ pattern, dir, include, isRegex, maxMatches = GREP_MAX_MATCHES }) {
  return new Promise((resolve) => {
    const args = ["--line-number", "--color", "never", "--max-count", String(maxMatches)];
    if (!isRegex) args.push("--fixed-strings");
    if (include) args.push("--glob", include);
    args.push("--", pattern, dir);

    const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const matches = [];
    let stderr = "";
    let remainder = "";
    let abortedAfterLimit = false;

    const pushLines = (text) => {
      remainder += text;
      const lines = remainder.split(/\r?\n/);
      remainder = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) continue;
        if (matches.length < maxMatches) {
          matches.push(line);
          continue;
        }
        abortedAfterLimit = true;
        child.kill();
        break;
      }
    };

    child.stdout.on("data", (chunk) => {
      pushLines(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendBoundedBuffer(stderr, chunk.toString(), 4096);
    });

    child.on("error", () => {
      resolve(null);
    });

    child.on("close", (code) => {
      if (remainder && matches.length < maxMatches) matches.push(remainder);
      if (abortedAfterLimit) return resolve({ matches, limited: true });
      if (code === 0) return resolve({ matches, limited: false });
      if (code === 1) return resolve({ matches: [], limited: false });
      resolve({ error: stderr.trim() || `ripgrep exited with code ${code}` });
    });
  });
}

// ===========================
// 🔧 TOOL HANDLERS
// ===========================
export const tools = {
  read_file: async ({ path: filePath }) => {
    try {
      console.log(`\n📄 [read_file] ${filePath}`);

      if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
      if (!(await exists(filePath))) {
        return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use list_dir to explore available files, or grep_search to find files by name.`;
      }

      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        return `❌ Error: '${filePath}' is a directory, not a file.\n💡 Tip: Use list_dir to view directory contents.`;
      }

      return await readFilePreview(filePath);
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
      if (err.code === "EISDIR") return `❌ Error: '${filePath}' is a directory.`;
      return `❌ Error reading file: ${err.message}`;
    }
  },

  write_file: async ({ path: filePath, content }) => {
    try {
      console.log(`\n✍️ [write_file] ${filePath}`);
      if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
      if (!content) {
        return "❌ Error: Content cannot be empty.\n💡 Tip: Provide the full content to write to the file.";
      }

      const dir = path.dirname(filePath);
      if (!(await exists(dir))) await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content);

      const lines = content.split("\n").length;
      return `✅ Success: Written to ${filePath}\n   📊 ${content.length} characters, ${lines} lines`;
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
      if (err.code === "ENOSPC") return `❌ Error: No space left on device.`;
      return `❌ Error writing file: ${err.message}`;
    }
  },

  edit_file: async ({ path: filePath, target, replacement }) => {
    try {
      console.log(`\n✏️ [edit_file] ${filePath}`);
      if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
      if (!(await exists(filePath))) {
        return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use write_file to create new files.`;
      }
      if (!target) {
        return "❌ Error: Target string cannot be empty.";
      }

      const content = await fs.readFile(filePath, "utf-8");
      if (!content.includes(target)) {
        return `❌ Error: Target string not found in '${filePath}'.\n💡 Tip: Use read_file first to verify the exact content.`;
      }

      const newContent = content.replace(target, replacement);
      const { added, removed } = diffStats(content, newContent);

      // Show the diff preview (unless auto-approved via env var or non-TTY).
      const autoApprove = process.env[DIFF_AUTO_APPROVE_ENV] === "1" || !process.stdin.isTTY;
      if (!autoApprove) {
        const { decision } = await getPrompter().editApproval({
          filePath,
          oldContent: content,
          newContent,
          added,
          removed,
        });
        if (decision === "reject") return "🚫 Cancelled: Edit rejected by user.";
        if (decision === "manual") {
          return `🚫 Cancelled: User wants to edit manually. File '${filePath}' was NOT modified.\n💡 Tip: Make the change yourself, then tell the agent what you did.`;
        }
      }

      await fs.writeFile(filePath, newContent);

      const delta = added - removed;
      const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
      return `✅ Success: Edited ${filePath}\n   📝 +${added} / -${removed} lines (net ${deltaStr})`;
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
      return `❌ Error editing file: ${err.message}`;
    }
  },

  list_dir: async ({ dir }) => {
    try {
      console.log(`\n📂 [list_dir] ${dir}`);
      if (!isSafePath(dir)) return UNSAFE_PATH_MSG;
      if (!(await exists(dir))) return `❌ Error: Directory not found at '${dir}'.`;

      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) return `❌ Error: '${dir}' is not a directory.`;

      const entries = await fs.readdir(dir, { withFileTypes: true });
      if (entries.length === 0) return `📂 Directory '${dir}' is empty.`;

      return entries
        .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}${e.isDirectory() ? "/" : ""}`)
        .join("\n");
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied for '${dir}'.`;
      if (err.code === "ENOTDIR") return `❌ Error: '${dir}' is not a directory.`;
      return `❌ Error listing directory: ${err.message}`;
    }
  },

  grep_search: async ({ pattern, dir = ".", include, isRegex = false }) => {
    try {
      console.log(`\n🔍 [grep_search] "${pattern}" in ${dir}`);
      if (!isSafePath(dir)) return UNSAFE_PATH_MSG;
      if (!pattern) return "❌ Error: Search pattern cannot be empty.";
      if (!(await exists(dir))) return `❌ Error: Directory '${dir}' not found.`;

      const rgResult = await ripgrepSearch({ pattern, dir, include, isRegex, maxMatches: GREP_MAX_MATCHES });
      if (rgResult?.error) {
        return `❌ Error during search: ${rgResult.error}`;
      }
      if (rgResult) {
        if (rgResult.matches.length === 0) {
          return `❌ No matches found for '${pattern}'${include ? ` in files matching '${include}'` : ""}.`;
        }

        let result = `✅ Found ${rgResult.matches.length} matches:\n\n${rgResult.matches.join("\n")}`;
        if (rgResult.limited) {
          result += `\n\n⚠️ Showing first ${GREP_MAX_MATCHES} matches. Use 'include' to narrow your search.`;
        }
        return result;
      }

      const fallbackResult = await fallbackGrepSearch({
        pattern,
        dir,
        include,
        isRegex,
        maxMatches: GREP_MAX_MATCHES,
      });
      if (!fallbackResult.sawFiles) {
        return `❌ No files found in '${dir}'${include ? ` matching '${include}'` : ""}.`;
      }
      if (fallbackResult.matches.length === 0) {
        return `❌ No matches found for '${pattern}' in ${fallbackResult.filesScanned} files.`;
      }

      let result = `✅ Found ${fallbackResult.matches.length} matches:\n\n${fallbackResult.matches.join("\n")}`;
      if (fallbackResult.limited) {
        result += `\n\n⚠️ Showing first ${GREP_MAX_MATCHES} matches. Use 'include' to narrow your search.`;
      }
      return result;
    } catch (err) {
      return `❌ Error during search: ${err.message}`;
    }
  },

  create_dir: async ({ dir }) => {
    try {
      console.log(`\n📁 [create_dir] ${dir}`);
      if (!isSafePath(dir)) return UNSAFE_PATH_MSG;
      if (!dir || dir.trim() === "") return "❌ Error: Directory path cannot be empty.";
      if (await exists(dir)) return `⚠️ Directory '${dir}' already exists.`;

      await fs.mkdir(dir, { recursive: true });
      return `✅ Success: Created directory '${dir}'`;
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied.`;
      return `❌ Error creating directory: ${err.message}`;
    }
  },

  delete_file: async ({ path: filePath }) => {
    try {
      console.log(`\n🗑️ [delete_file] ${filePath}`);
      if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
      if (!(await exists(filePath))) return `❌ Error: File not found at '${filePath}'.`;

      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        return `❌ Error: '${filePath}' is a directory.\n💡 Tip: Use rm -rf via run_command (caution advised).`;
      }

      const ok = await getPrompter().confirm({ message: `Delete ${filePath}?`, reason: "destructive" });
      if (!ok) return "🚫 Cancelled: Deletion denied by user.";

      await fs.unlink(filePath);
      return `✅ Success: Deleted '${filePath}'`;
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
      return `❌ Error deleting file: ${err.message}`;
    }
  },

  get_file_info: async ({ path: filePath }) => {
    try {
      console.log(`\nℹ️  [get_file_info] ${filePath}`);
      if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;
      if (!(await exists(filePath))) return `❌ Error: File not found at '${filePath}'.`;

      const stat = await fs.stat(filePath);
      const info = {
        name: path.basename(filePath),
        path: filePath,
        type: stat.isDirectory() ? "directory" : "file",
        size: `${stat.size} bytes (${(stat.size / 1024).toFixed(2)} KB)`,
        modified: stat.mtime.toISOString(),
        created: stat.birthtime.toISOString(),
        extension: path.extname(filePath) || "none",
      };
      return `📋 File Information:\n${JSON.stringify(info, null, 2)}`;
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied for '${filePath}'.`;
      return `❌ Error getting file info: ${err.message}`;
    }
  },

  run_command: async ({ cmd }) => {
    if (!cmd || cmd.trim() === "") return "❌ Error: Command cannot be empty.";

    const { verdict, reason } = classifyCommand(cmd);

    if (verdict === "blocked") {
      console.log(`\n🛑 [run_command] BLOCKED: ${cmd}`);
      return `🛑 Blocked: Refusing to run potentially dangerous command.\nReason: ${reason}\n💡 If you genuinely need this, run it manually outside the agent.`;
    }

    if (verdict === "confirm") {
      const ok = await confirmExecution(cmd, reason);
      if (!ok) {
        console.log("🚫 [run_command] Denied by user.");
        return "🚫 Cancelled: User denied permission to run command.";
      }
    } else {
      console.log(`\n✅ [run_command] Auto-approved (${reason}): ${cmd}`);
    }

    return runWithSpawn(cmd);
  },
};

// ===========================
// 🔹 STREAMING COMMAND EXECUTION
// ===========================
// Uses spawn (not execSync) so stdout/stderr stream live to the terminal —
// long-running commands like `npm install` are no longer invisible for minutes.
function runWithSpawn(cmd) {
  return new Promise((resolve) => {
    console.log(`\n🚀 [run_command] ${cmd}`);
    const shellSpec = resolveCommandShell();

    const child = spawn(shellSpec.shell, [...shellSpec.args, cmd], { stdio: ["ignore", "pipe", "pipe"] });

    let stdoutBuf = "";
    let stderrBuf = "";
    let stdoutDropped = 0;
    let stderrDropped = 0;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      void terminateChildProcess(child);
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const next = appendBoundedBuffer(stdoutBuf, text, COMMAND_MAX_BUFFER);
      stdoutDropped += stdoutBuf.length + text.length - next.length;
      stdoutBuf = next;
      if (hasToolStreamCallback()) emitToolStream("run_command", text);
      else process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      const next = appendBoundedBuffer(stderrBuf, text, COMMAND_MAX_BUFFER);
      stderrDropped += stderrBuf.length + text.length - next.length;
      stderrBuf = next;
      if (hasToolStreamCallback()) emitToolStream("run_command", text);
      else process.stderr.write(text);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(`❌ Error: Failed to spawn command: ${err.message}`);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return resolve(`❌ Error: Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s and was killed.`);
      }
      if (code === 0) {
        const stdoutOut =
          stdoutDropped > 0
            ? `[showing last ${stdoutBuf.length} chars, ${stdoutDropped} earlier chars omitted]\n${stdoutBuf}`
            : stdoutBuf;
        const out = stdoutBuf.trim() === "" ? "(no output)" : truncate(stdoutOut, MAX_COMMAND_OUTPUT_CHARS);
        return resolve(`✅ Success (exit 0):\n${out}`);
      }
      let errorMsg = `❌ Error: Command failed (exit code: ${code})\n\n`;
      if (stderrBuf) errorMsg += `📛 Stderr:\n${truncate(stderrBuf, 2000)}\n\n`;
      if (stdoutBuf) errorMsg += `📄 Stdout:\n${truncate(stdoutBuf, 2000)}`;
      errorMsg += `\n\n💡 Tip: Check command syntax and permissions.`;
      if (stderrBuf || stdoutBuf) {
        errorMsg = `❌ Error: Command failed (exit code: ${code})\n\n`;
        if (stderrBuf) {
          const stderrOut =
            stderrDropped > 0
              ? `[showing last ${stderrBuf.length} chars, ${stderrDropped} earlier chars omitted]\n${stderrBuf}`
              : stderrBuf;
          errorMsg += `📝 Stderr:\n${truncate(stderrOut, 2000)}\n\n`;
        }
        if (stdoutBuf) {
          const stdoutOut =
            stdoutDropped > 0
              ? `[showing last ${stdoutBuf.length} chars, ${stdoutDropped} earlier chars omitted]\n${stdoutBuf}`
              : stdoutBuf;
          errorMsg += `📄 Stdout:\n${truncate(stdoutOut, 2000)}`;
        }
        errorMsg += `\n\n💡 Tip: Check command syntax and permissions.`;
      }
      resolve(errorMsg);
    });
  });
}

async function terminateChildProcess(child) {
  const pid = child?.pid;
  const plan = resolveTerminationPlan(pid);
  if (!plan) return false;

  if (plan.mode === "signal") {
    try {
      child.kill(plan.signal);
      return true;
    } catch {
      return false;
    }
  }

  return new Promise((resolve) => {
    const killer = spawn(plan.command, plan.args, { stdio: "ignore" });
    killer.on("error", () => resolve(false));
    killer.on("close", () => resolve(true));
  });
}

// Keep a tiny sync escape hatch for callers that genuinely need it (none today).
export const _syncFs = fsSync;
export { terminateChildProcess };

// ===========================
// 🔧 DECLARATIONS (Gemini API)
// ===========================
export const toolDeclarations = [
  {
    name: "read_file",
    description: "Read file content with line numbers. Use this to understand code before making changes.",
    parameters: {
      type: "OBJECT",
      properties: { path: { type: "STRING", description: "File path to read" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write full content to a file. Auto-creates parent dirs. Use for NEW files or COMPLETE rewrites. For small changes, prefer edit_file.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "File path to write" },
        content: { type: "STRING", description: "Complete file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Edit a file by finding an exact target string and replacing it. Only the FIRST occurrence is replaced. ALWAYS read_file first. Preferred over write_file for small changes — saves tokens.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "File path to edit" },
        target: { type: "STRING", description: "Exact string to find (must match including whitespace)" },
        replacement: { type: "STRING", description: "Replacement string" },
      },
      required: ["path", "target", "replacement"],
    },
  },
  {
    name: "list_dir",
    description: "List files and folders in a directory to explore project structure.",
    parameters: {
      type: "OBJECT",
      properties: { dir: { type: "STRING", description: "Directory path" } },
      required: ["dir"],
    },
  },
  {
    name: "grep_search",
    description:
      "Search for a pattern across files recursively. Returns matching lines with file:line:content. Ignores node_modules, .git, and binary files. Much faster than reading files one by one.",
    parameters: {
      type: "OBJECT",
      properties: {
        pattern: { type: "STRING", description: "Search pattern (text or regex)" },
        dir: { type: "STRING", description: "Directory to search (default: '.')" },
        include: { type: "STRING", description: "File filter e.g. '*.js' (optional)" },
        isRegex: { type: "BOOLEAN", description: "Treat pattern as regex (default: false)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "create_dir",
    description: "Create a directory and any parent directories needed.",
    parameters: {
      type: "OBJECT",
      properties: { dir: { type: "STRING", description: "Directory path to create" } },
      required: ["dir"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file. Requires user confirmation.",
    parameters: {
      type: "OBJECT",
      properties: { path: { type: "STRING", description: "File to delete" } },
      required: ["path"],
    },
  },
  {
    name: "get_file_info",
    description: "Get file metadata (size, dates, extension) without reading content.",
    parameters: {
      type: "OBJECT",
      properties: { path: { type: "STRING", description: "File path" } },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    description:
      "Execute a shell command. Safe read-only commands (ls, git status, npm test, etc.) auto-run; write/unknown commands require user confirmation; dangerous patterns are blocked. Output streams live. 60s timeout.",
    parameters: {
      type: "OBJECT",
      properties: { cmd: { type: "STRING", description: "Shell command to execute" } },
      required: ["cmd"],
    },
  },
];
