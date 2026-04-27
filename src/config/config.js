import fs from "fs";
import path from "path";
import os from "os";
import { detectOS, detectShell, getGitInfo } from "../utils/utils.js";
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
  model: "gemini-3-flash-preview",
  plannerModel: "gemini-3-flash-preview",
  summaryModel: "gemini-2.5-flash-lite",
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
  const git = getGitInfo();

  let gitSection = "";
  if (git.isRepo) {
    gitSection = `\n- Git: branch=${git.branch}, last_commit=${git.lastCommit}, status=${git.status}`;
  }

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
- Working Directory: ${cwd}${gitSection}`;
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
    } catch (err) {
      console.warn(`⚠️ Failed to read agent.config.json: ${err.message}. Using defaults.`);
      _cachedConfig = { ...defaultConfig };
    }
  } else {
    _cachedConfig = { ...defaultConfig };
  }

  // Env vars override config.json (for ad-hoc per-session tweaks).
  if (process.env.MYAGENT_PROVIDER) _cachedConfig.provider = process.env.MYAGENT_PROVIDER;
  if (process.env.MYAGENT_MODEL) {
    _cachedConfig.model = process.env.MYAGENT_MODEL;
    // Mirror to planner/summary if they weren't explicitly set elsewhere.
    if (!process.env.MYAGENT_PLANNER_MODEL) _cachedConfig.plannerModel = process.env.MYAGENT_MODEL;
    if (!process.env.MYAGENT_SUMMARY_MODEL) _cachedConfig.summaryModel = process.env.MYAGENT_MODEL;
  }
  if (process.env.MYAGENT_PLANNER_MODEL)
    _cachedConfig.plannerModel = process.env.MYAGENT_PLANNER_MODEL;
  if (process.env.MYAGENT_SUMMARY_MODEL)
    _cachedConfig.summaryModel = process.env.MYAGENT_SUMMARY_MODEL;
  if (process.env.MYAGENT_EMBEDDING_PROVIDER)
    _cachedConfig.embeddingProvider = process.env.MYAGENT_EMBEDDING_PROVIDER;
  if (process.env.MYAGENT_EMBEDDING_MODEL)
    _cachedConfig.embeddingModel = process.env.MYAGENT_EMBEDDING_MODEL;

  return _cachedConfig;
}

/**
 * Invalidate the cached configuration to force a reload from disk/env on the next access.
 */
export function invalidateConfig() {
  _cachedConfig = null;
}

export function getGlobalEnvPath() {
  return path.join(os.homedir(), GLOBAL_ENV_FILENAME);
}

/**
 * Load variables from the global .myagent.env file into process.env.
 */
export function loadGlobalEnv() {
  const envPath = getGlobalEnvPath();
  if (!fs.existsSync(envPath)) return;

  try {
    const raw = fs.readFileSync(envPath, "utf-8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Handle both "KEY=VAL" and "export KEY=VAL"
      const match = trimmed.match(/^(?:export\s+)?([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2"); // unquote
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to load global env: ${err.message}`);
  }
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
