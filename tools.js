import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import readline from "readline/promises";
import { truncate } from "./utils.js";

// ===========================
// 🔹 HELPERS
// ===========================
function isSafePath(filePath) {
  return !filePath.includes("..");
}

async function confirmExecution(cmd) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n⚠️ Agent wants to run: \`${cmd}\`\nAllow? (Y/n) > `);
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "vendor", ".cache", "coverage",
]);

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".svg",
  ".mp3", ".mp4", ".avi", ".mov", ".webm",
  ".zip", ".gz", ".tar", ".rar", ".7z",
  ".pdf", ".exe", ".dll", ".so", ".dylib",
  ".pyc", ".lock", ".map",
]);

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

// ===========================
// 🔧 TOOL HANDLERS
// ===========================
export const tools = {
  read_file: async ({ path: filePath }) => {
    try {
      console.log(`\n📄 [read_file] ${filePath}`);
      if (!isSafePath(filePath)) return "Error: Path traversal detected.";
      if (!fs.existsSync(filePath)) return "Error: File not found.";
      const content = fs.readFileSync(filePath, "utf-8");
      const numbered = content.split("\n").map((line, i) => `${i + 1}: ${line}`).join("\n");
      return truncate(numbered, 8000);
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  write_file: async ({ path: filePath, content }) => {
    try {
      console.log(`\n✍️ [write_file] ${filePath}`);
      if (!isSafePath(filePath)) return "Error: Path traversal detected.";
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content);
      return `Success: Written to ${filePath} (${content.length} chars)`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  edit_file: async ({ path: filePath, target, replacement }) => {
    try {
      console.log(`\n✏️ [edit_file] ${filePath}`);
      if (!isSafePath(filePath)) return "Error: Path traversal detected.";
      if (!fs.existsSync(filePath)) return "Error: File not found. Use write_file to create new files.";

      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.includes(target)) {
        return `Error: Target string not found in ${filePath}. Use read_file first to check the exact current content.`;
      }

      const newContent = content.replace(target, replacement);
      fs.writeFileSync(filePath, newContent);
      const tLines = target.split("\n").length;
      const rLines = replacement.split("\n").length;
      return `Success: Edited ${filePath}. Replaced ${tLines} lines → ${rLines} lines.`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  list_dir: async ({ dir }) => {
    try {
      console.log(`\n📂 [list_dir] ${dir}`);
      if (!isSafePath(dir)) return "Error: Path traversal detected.";
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries
        .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}${e.isDirectory() ? "/" : ""}`)
        .join("\n");
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  grep_search: async ({ pattern, dir = ".", include, isRegex = false }) => {
    try {
      console.log(`\n🔍 [grep_search] "${pattern}" in ${dir}`);
      const files = walkFiles(dir, include);
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
            if (found) {
              matches.push(`${file}:${i + 1}: ${line.trim()}`);
            }
          }
        } catch { /* skip */ }
      }

      if (matches.length === 0) return "No matches found.";
      let result = matches.join("\n");
      if (matches.length >= MAX_MATCHES) {
        result += `\n\n(First ${MAX_MATCHES} matches shown. Narrow your search.)`;
      }
      return result;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  create_dir: async ({ dir }) => {
    try {
      console.log(`\n📁 [create_dir] ${dir}`);
      if (!isSafePath(dir)) return "Error: Path traversal detected.";
      fs.mkdirSync(dir, { recursive: true });
      return `Success: Directory created at ${dir}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  delete_file: async ({ path: filePath }) => {
    try {
      console.log(`\n🗑️ [delete_file] ${filePath}`);
      if (!isSafePath(filePath)) return "Error: Path traversal detected.";
      if (!fs.existsSync(filePath)) return "Error: File not found.";
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`\n⚠️ Delete ${filePath}? (Y/n) > `);
      rl.close();
      if (answer.trim().toLowerCase() === "n") return "Cancelled: Deletion denied by user.";
      fs.unlinkSync(filePath);
      return `Success: Deleted ${filePath}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  get_file_info: async ({ path: filePath }) => {
    try {
      console.log(`\nℹ️ [get_file_info] ${filePath}`);
      if (!fs.existsSync(filePath)) return "Error: File not found.";
      const stat = fs.statSync(filePath);
      return JSON.stringify({
        name: path.basename(filePath),
        path: filePath,
        size: `${stat.size} bytes`,
        modified: stat.mtime.toISOString(),
        created: stat.birthtime.toISOString(),
        isDirectory: stat.isDirectory(),
        extension: path.extname(filePath),
      }, null, 2);
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  run_command: async ({ cmd }) => {
    const isAllowed = await confirmExecution(cmd);
    if (!isAllowed) {
      console.log("❌ [run_command] Denied by user.");
      return "Error: User denied permission.";
    }
    try {
      console.log(`\n🚀 [run_command] ${cmd}`);
      const output = execSync(cmd, {
        shell: true,
        stdio: "pipe",
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 10,
      });
      return truncate(output.toString() || "Success: Command executed with no output.", 5000);
    } catch (err) {
      return `Error: Command failed (exit ${err.status})\nStdout: ${truncate(err.stdout?.toString() || "", 2000)}\nStderr: ${truncate(err.stderr?.toString() || "", 2000)}`;
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
