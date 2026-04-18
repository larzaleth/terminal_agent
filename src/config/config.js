import fs from "fs";
import path from "path";
import os from "os";
import { detectOS, detectShell } from "../utils/utils.js";
import {
  MAX_ITERATIONS_DEFAULT,
  MAX_MEMORY_TURNS_DEFAULT,
  GLOBAL_ENV_FILENAME,
} from "./constants.js";

// ===========================
// 🔹 DEFAULT CONFIG
// ===========================
const defaultConfig = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  plannerModel: "gemini-2.5-flash",
  summaryModel: "gemini-2.5-flash",
  maxIterations: MAX_ITERATIONS_DEFAULT,
  maxMemoryTurns: MAX_MEMORY_TURNS_DEFAULT,
  mcpServers: {},
};

// ===========================
// 🔹 DYNAMIC SYSTEM PROMPT
// ===========================
export function getSystemPrompt() {
  const osName = detectOS();
  const shell = detectShell();
  const cwd = process.cwd();

  return `You are a highly capable AI coding agent running in the user's terminal.
You have access to powerful tools via Function Calling: read files, write files, edit specific parts of files, search code with grep, list directories, run shell commands, and more.

## Core Rules
1. THINK step-by-step before acting. Break complex tasks into smaller steps.
2. EXPLORE first — use list_dir and grep_search to understand the codebase before making changes.
3. ALWAYS read_file before editing to understand the current state of the code.
4. Use edit_file for targeted changes (preferred — saves tokens). Use write_file only for new files or complete rewrites.
5. Follow existing code patterns, naming conventions, and project structure.
6. When running shell commands, prefer safe read-only commands. Destructive commands need justification.
7. Keep responses concise and actionable. Explain what you're doing briefly before executing tools.
8. If you encounter an error, analyze it and try a different approach rather than repeating the same action.

## Tool Selection Guide
- Find code/patterns → grep_search (fastest)
- See project structure → list_dir
- Read file contents → read_file
- Make targeted edits → edit_file (preferred over write_file for small changes)
- Create new files → write_file
- Run scripts/install deps → run_command
- Check file metadata → get_file_info
- Create folders → create_dir
- Remove files → delete_file (requires user confirmation)

## Environment
- OS: ${osName}
- Shell: ${shell}
- Working Directory: ${cwd}`;
}

// ===========================
// 🔹 LOAD CONFIG (lazy singleton)
// ===========================
let _cachedConfig = null;

export function loadConfig() {
  if (_cachedConfig) return _cachedConfig;

  const customConfigPath = path.join(process.cwd(), "agent.config.json");

  if (fs.existsSync(customConfigPath)) {
    try {
      const customConfig = JSON.parse(fs.readFileSync(customConfigPath, "utf-8"));
      _cachedConfig = { ...defaultConfig, ...customConfig };
      return _cachedConfig;
    } catch (err) {
      console.warn(`⚠️ Failed to read agent.config.json: ${err.message}. Using defaults.`);
    }
  }

  _cachedConfig = defaultConfig;
  return _cachedConfig;
}

export function getGlobalEnvPath() {
  return path.join(os.homedir(), GLOBAL_ENV_FILENAME);
}

// Backwards-compatible named export for existing call-sites.
// The Proxy now supports both reads AND writes — `/model` and `/provider`
// commands mutate the session's config in-memory (not persisted to disk).
export const config = new Proxy(
  {},
  {
    get(_target, prop) {
      return loadConfig()[prop];
    },
    set(_target, prop, value) {
      loadConfig()[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop in loadConfig();
    },
    ownKeys() {
      return Reflect.ownKeys(loadConfig());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(loadConfig(), prop);
    },
  }
);
