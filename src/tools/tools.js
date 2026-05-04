import fsSync from "fs";
import read_file from "./handlers/read_file.js";
import write_file from "./handlers/write_file.js";
import edit_file from "./handlers/edit_file.js";
import list_dir from "./handlers/list_dir.js";
import grep_search from "./handlers/grep_search.js";
import create_dir from "./handlers/create_dir.js";
import delete_file from "./handlers/delete_file.js";
import get_file_info from "./handlers/get_file_info.js";
import run_command from "./handlers/run_command.js";
import batch_edit from "./handlers/batch_edit.js";
import replace_lines from "./handlers/replace_lines.js";
import { terminateChildProcess } from "./shell-runner.js";

// ===========================
// 🔧 TOOL HANDLERS REGISTRY
// ===========================
export const tools = {
  read_file,
  write_file,
  edit_file,
  list_dir,
  grep_search,
  create_dir,
  delete_file,
  get_file_info,
  run_command,
  batch_edit,
  replace_lines,
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
      properties: {
        path: { type: "STRING", description: "File path to read" },
        startLine: { type: "NUMBER", description: "Line number to start reading from (default: 1)" },
        endLine: { type: "NUMBER", description: "Line number to stop reading at (default: end of file)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write full content to a file. Auto-creates parent dirs. To OVERWRITE an existing file, you MUST set 'overwrite': true, otherwise it will fail. For small changes, prefer edit_file.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "File path to write" },
        content: { type: "STRING", description: "Complete file content" },
        overwrite: { type: "BOOLEAN", description: "If true, overwrites an existing file. If false/omitted, fails if the file exists." },
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
  {
    name: "batch_edit",
    description:
      "Apply multiple edits across one or more files in a single turn. Useful for refactorings or coordinated changes. Each edit must have a unique target string.",
    parameters: {
      type: "OBJECT",
      properties: {
        edits: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              path: { type: "STRING", description: "File path to edit" },
              target: { type: "STRING", description: "Exact string to find" },
              replacement: { type: "STRING", description: "Replacement string" },
            },
            required: ["path", "target", "replacement"],
          },
        },
      },
      required: ["edits"],
    },
  },
  {
    name: "replace_lines",
    description:
      "Replace a range of lines in a file with new content. MUCH faster than edit_file for large changes — no need to match exact strings, just specify line numbers. Use read_file first to identify the line range, then replace. Can also delete lines (set content to empty string) or insert (set startLine = endLine = insertion point).",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "File path to edit" },
        startLine: { type: "NUMBER", description: "First line to replace (1-indexed, inclusive)" },
        endLine: { type: "NUMBER", description: "Last line to replace (1-indexed, inclusive)" },
        content: { type: "STRING", description: "Replacement content (replaces the entire line range). Use empty string to delete lines." },
      },
      required: ["path", "startLine", "endLine", "content"],
    },
  },
];

// Keep tiny sync escape hatch for backward compatibility.
export const _syncFs = fsSync;
export { terminateChildProcess };
