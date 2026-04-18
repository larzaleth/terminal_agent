import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import readline from "readline/promises";
import { truncate, isSafePath } from "../utils/utils.js";
import {
  IGNORE_DIRS,
  BINARY_EXTS,
  MAX_TOOL_OUTPUT_CHARS,
  MAX_COMMAND_OUTPUT_CHARS,
  COMMAND_TIMEOUT_MS,
  COMMAND_MAX_BUFFER,
} from "../config/constants.js";

// ===========================
// 🔹 HELPERS
// ===========================
async function confirmExecution(cmd) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n⚠️ Agent wants to run: \`${cmd}\`\nAllow? (Y/n) > `);
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}

function walkFiles(dir, include) {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          results = results.concat(walkFiles(fullPath, include));
        }
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTS.has(ext)) continue;
        if (include && !entry.name.endsWith(include.replace("*", ""))) continue;
        results.push(fullPath);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

const UNSAFE_PATH_MSG = "❌ Error: Path is outside the working directory. For security, the agent can only access files inside the current project.";

// ===========================
// 🔧 TOOL HANDLERS
// ===========================
export const tools = {
  read_file: async ({ path: filePath }) => {
    try {
      console.log(`\n📄 [read_file] ${filePath}`);

      if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;

      if (!fs.existsSync(filePath)) {
        return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use list_dir to explore available files, or grep_search to find files by name.`;
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        return `❌ Error: '${filePath}' is a directory, not a file.\n💡 Tip: Use list_dir to view directory contents.`;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const numbered = content.split("\n").map((line, i) => `${i + 1}: ${line}`).join("\n");
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
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(filePath, content);
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

      if (!fs.existsSync(filePath)) {
        return `❌ Error: File not found at '${filePath}'.\n💡 Tip: Use write_file to create new files, or read_file to verify the path.`;
      }

      if (!target) {
        return "❌ Error: Target string cannot be empty.\n💡 Tip: Specify the exact text to find and replace.";
      }

      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.includes(target)) {
        return `❌ Error: Target string not found in '${filePath}'.\n💡 Tip: Use read_file first to verify the exact content. Make sure whitespace matches exactly.`;
      }

      const newContent = content.replace(target, replacement);
      fs.writeFileSync(filePath, newContent);

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

      if (!fs.existsSync(dir)) {
        return `❌ Error: Directory not found at '${dir}'.\n💡 Tip: Check the path or use list_dir on parent directory.`;
      }

      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) {
        return `❌ Error: '${dir}' is not a directory.\n💡 Tip: Use read_file to view file contents.`;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });
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

      if (!pattern) {
        return "❌ Error: Search pattern cannot be empty.\n💡 Tip: Provide a search term or regex pattern.";
      }
      if (!fs.existsSync(dir)) {
        return `❌ Error: Directory '${dir}' not found.\n💡 Tip: Use list_dir to explore available directories.`;
      }

      const files = walkFiles(dir, include);
      if (files.length === 0) {
        return `❌ No files found in '${dir}'${include ? ` matching '${include}'` : ""}.`;
      }

      const matches = [];
      const MAX_MATCHES = 50;
      const regex = isRegex ? new RegExp(pattern, "gi") : null;

      for (const file of files) {
        if (matches.length >= MAX_MATCHES) break;
        try {
          const content = fs.readFileSync(file, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= MAX_MATCHES) break;
            const line = lines[i];
            const found = regex
              ? regex.test(line)
              : line.toLowerCase().includes(pattern.toLowerCase());
            if (regex) regex.lastIndex = 0;
            if (found) matches.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        } catch { /* skip unreadable files */ }
      }

      if (matches.length === 0) {
        return `❌ No matches found for '${pattern}' in ${files.length} files.`;
      }

      let result = `✅ Found ${matches.length} matches:\n\n` + matches.join("\n");
      if (matches.length >= MAX_MATCHES) {
        result += `\n\n⚠️ Showing first ${MAX_MATCHES} matches. Use 'include' parameter to narrow your search.`;
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
      if (fs.existsSync(dir)) return `⚠️ Directory '${dir}' already exists.`;

      fs.mkdirSync(dir, { recursive: true });
      return `✅ Success: Created directory '${dir}'`;
    } catch (err) {
      if (err.code === "EACCES") return `❌ Error: Permission denied. Cannot create '${dir}'.`;
      return `❌ Error creating directory: ${err.message}`;
    }
  },

  delete_file: async ({ path: filePath }) => {
    try {
      console.log(`\n🗑️ [delete_file] ${filePath}`);
      if (!isSafePath(filePath)) return UNSAFE_PATH_MSG;

      if (!fs.existsSync(filePath)) {
        return `❌ Error: File not found at '${filePath}'.`;
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        return `❌ Error: '${filePath}' is a directory.\n💡 Tip: Use rm -rf via run_command to delete directories (caution advised).`;
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`\n⚠️  Delete ${filePath}? (Y/n) > `);
      rl.close();

      if (answer.trim().toLowerCase() === "n") {
        return "🚫 Cancelled: Deletion denied by user.";
      }

      fs.unlinkSync(filePath);
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

      if (!fs.existsSync(filePath)) {
        return `❌ Error: File not found at '${filePath}'.`;
      }

      const stat = fs.statSync(filePath);
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

    const isAllowed = await confirmExecution(cmd);
    if (!isAllowed) {
      console.log("🚫 [run_command] Denied by user.");
      return "🚫 Cancelled: User denied permission to run command.";
    }

    try {
      console.log(`\n🚀 [run_command] ${cmd}`);
      const output = execSync(cmd, {
        shell: true,
        stdio: "pipe",
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER,
      });

      const result = output.toString();
      if (!result || result.trim() === "") {
        return "✅ Success: Command executed (no output produced)";
      }

      return `✅ Success:\n${truncate(result, MAX_COMMAND_OUTPUT_CHARS)}`;
    } catch (err) {
      const exitCode = err.status || "unknown";
      const stdout = err.stdout?.toString() || "";
      const stderr = err.stderr?.toString() || "";

      let errorMsg = `❌ Error: Command failed (exit code: ${exitCode})\n\n`;
      if (stderr) errorMsg += `📛 Stderr:\n${truncate(stderr, 2000)}\n\n`;
      if (stdout) errorMsg += `📄 Stdout:\n${truncate(stdout, 2000)}`;
      errorMsg += `\n\n💡 Tip: Check command syntax and permissions.`;

      return errorMsg;
    }
  },
};

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
    description: "Write full content to a file. Auto-creates parent dirs. Use for NEW files or COMPLETE rewrites. For small changes, prefer edit_file.",
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
    description: "Edit a file by finding an exact target string and replacing it. Only the FIRST occurrence is replaced. ALWAYS read_file first. Preferred over write_file for small changes — saves tokens.",
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
    description: "Search for a pattern across files recursively. Returns matching lines with file:line:content. Ignores node_modules, .git, and binary files. Much faster than reading files one by one.",
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
    description: "Execute a shell command. 60s timeout. Requires user confirmation. Use for scripts, installs, git, builds.",
    parameters: {
      type: "OBJECT",
      properties: { cmd: { type: "STRING", description: "Shell command to execute" } },
      required: ["cmd"],
    },
  },
];
