import fs from "fs";
import path from "path";
import os from "os";
import { detectOS, detectShell, getGitInfo } from "../utils/utils.js";
import {
  MAX_ITERATIONS_DEFAULT,
  MAX_MEMORY_TURNS_DEFAULT,
  GLOBAL_ENV_FILENAME,
} from "./constants.js";

import { seniorV1Production } from "./prompts/senior-v1.production.js";
import { standard } from "./prompts/standard.js";


// ===========================
// 🔹 DEFAULT CONFIG
// ===========================
const defaultConfig = {
  provider: "gemini",
  model: "gemini-3-flash-preview",
  plannerModel: "gemini-3.1-pro-preview",
  summaryModel: "gemini-2.5-flash-lite",
  maxIterations: MAX_ITERATIONS_DEFAULT,
  maxMemoryTurns: MAX_MEMORY_TURNS_DEFAULT,
  promptVersion: "senior-v1.production", // Default to the new senior version
  mcpServers: {},
  autoApprove: false,
};

const prompts = {
  "senior-v1.production": seniorV1Production,
  standard: standard,
};

// ===========================
// 🔹 DYNAMIC SYSTEM PROMPT
// ===========================
export function getSystemPrompt() {
  const osName = detectOS();
  const shell = detectShell();
  const cwd = process.cwd();
  const git = getGitInfo();
  const config = loadConfig();

  let gitSection = "";
  if (git.isRepo) {
    gitSection = `\n- Git: branch=${git.branch}, last_commit=${git.lastCommit}, status=${git.status}`;
  }

  const promptFn = prompts[config.promptVersion] || prompts.standard;
  return promptFn(osName, shell, cwd, gitSection);
}


// ===========================
// 🔹 LOAD CONFIG (lazy singleton)
// ===========================
let _cachedConfig = null;

export function findConfigPath() {
  let curr = process.cwd();
  // Search upwards for agent.config.json (max 5 levels)
  for (let i = 0; i < 5; i++) {
    const p = path.join(curr, "agent.config.json");
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.join(process.cwd(), "agent.config.json");
}

export function loadConfig(forceReload = false) {
  if (_cachedConfig && !forceReload) return _cachedConfig;

  const customConfigPath = findConfigPath();

  if (fs.existsSync(customConfigPath)) {
    try {
      const customConfig = JSON.parse(fs.readFileSync(customConfigPath, "utf-8"));
      _cachedConfig = { ...defaultConfig, ...customConfig };
    } catch (err) {
      console.warn(`⚠️ Failed to read agent.config.json at ${customConfigPath}: ${err.message}. Using defaults.`);
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
