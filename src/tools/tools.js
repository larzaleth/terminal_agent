import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { spawn } from "child_process";
import readline from "readline/promises";
import { truncate, isSafePath } from "../utils/utils.js";
import { classifyCommand } from "./command-classifier.js";
import {
  IGNORE_DIRS,
  BINARY_EXTS,
  MAX_TOOL_OUTPUT_CHARS,
  MAX_COMMAND_OUTPUT_CHARS,
  COMMAND_TIMEOUT_MS,
} from "../config/constants.js";

// ===========================
// 🔹 HELPERS
// ===========================
async function confirmExecution(cmd, reason) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const tag = reason ? ` (${reason})` : "";
  const answer = await rl.question(`\n⚠️ Agent wants to run${tag}: \`${cmd}\`\nAllow? (Y/n) > `);
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}

// Async recursive walker. Won't block the event loop on large repos.
async function walkFiles(dir, include) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        const sub = await walkFiles(fullPath, include);
        results.push(...sub);
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTS.has(ext)) continue;
      if (include && !entry.name.endsWith(include.replace("*", ""))) continue;
      results.push(fullPath);
    }
  }
  return results;
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

      const content = await fs.readFile(filePath, "utf-8");
      const numbered = content
        .split("\n")
        .map((line, i) => `${i + 1}: ${line}`)
        .join("\n");
      return truncate(numbered, MAX_TOOL_OUTPUT_CHARS);
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
      await fs.writeFile(filePath, newContent);

      const tLines = target.split("\n").length;
      const rLines = replacement.split("\n").length;
      const delta = rLines - tLines;
      const deltaStr = delta > 0 ? `+${delta}` : delta;

      return `✅ Success: Edited ${filePath}\n   📝 Replaced ${tLines} lines → ${rLines} lines (${deltaStr})`;
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

      const files = await walkFiles(dir, include);
      if (files.length === 0) {
        return `❌ No files found in '${dir}'${include ? ` matching '${include}'` : ""}.`;
      }

      const matches = [];
      const MAX_MATCHES = 50;
      const regex = isRegex ? new RegExp(pattern, "gi") : null;

      for (const file of files) {
        if (matches.length >= MAX_MATCHES) break;
        try {
          const content = await fs.readFile(file, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= MAX_MATCHES) break;
            const line = lines[i];
            const found = regex ? regex.test(line) : line.toLowerCase().includes(pattern.toLowerCase());
            if (regex) regex.lastIndex = 0;
            if (found) matches.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        } catch {
          /* skip unreadable files */
        }
      }

      if (matches.length === 0) return `❌ No matches found for '${pattern}' in ${files.length} files.`;

      let result = `✅ Found ${matches.length} matches:\n\n` + matches.join("\n");
      if (matches.length >= MAX_MATCHES) {
        result += `\n\n⚠️ Showing first ${MAX_MATCHES} matches. Use 'include' to narrow your search.`;
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

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`\n⚠️  Delete ${filePath}? (Y/n) > `);
      rl.close();
      if (answer.trim().toLowerCase() === "n") {
        return "🚫 Cancelled: Deletion denied by user.";
      }

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
    const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
    const shellArg = process.platform === "win32" ? "/c" : "-c";

    const child = spawn(shell, [shellArg, cmd], { stdio: ["ignore", "pipe", "pipe"] });

    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutBuf += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuf += text;
      process.stderr.write(text);
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
        const out = stdoutBuf.trim() === "" ? "(no output)" : truncate(stdoutBuf, MAX_COMMAND_OUTPUT_CHARS);
        return resolve(`✅ Success (exit 0):\n${out}`);
      }
      let errorMsg = `❌ Error: Command failed (exit code: ${code})\n\n`;
      if (stderrBuf) errorMsg += `📛 Stderr:\n${truncate(stderrBuf, 2000)}\n\n`;
      if (stdoutBuf) errorMsg += `📄 Stdout:\n${truncate(stdoutBuf, 2000)}`;
      errorMsg += `\n\n💡 Tip: Check command syntax and permissions.`;
      resolve(errorMsg);
    });
  });
}

// Keep a tiny sync escape hatch for callers that genuinely need it (none today).
export const _syncFs = fsSync;

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
