import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { getGlobalEnvPath } from "../config/config.js";

// Load from global ~/.myagent.env (idempotent — dotenv is safe to call twice,
// but we guard to avoid re-parsing on hot reloads).
let _loaded = false;
function ensureEnvLoaded() {
  if (_loaded) return;
  dotenv.config({ path: getGlobalEnvPath() });
  _loaded = true;
}

ensureEnvLoaded();

// Lazy singleton — GoogleGenAI is only constructed on first use to allow
// setupApiKey() in the CLI to inject the key before any LLM call.
let _ai = null;
export function getAI() {
  if (!_ai) {
    ensureEnvLoaded();
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

// Proxy so existing `import { ai }` call-sites keep working without changes.
export const ai = new Proxy({}, {
  get(_t, prop) {
    return getAI()[prop];
  },
});
