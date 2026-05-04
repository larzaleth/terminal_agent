import { GeminiProvider } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { ProviderError } from "./base.js";

// Provider instances are cached per-name so we don't re-instantiate on every call.
const _cache = new Map();

export function getProvider(name) {
  if (_cache.has(name)) return _cache.get(name);

  let provider;
  switch (name) {
    case "gemini":
      provider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
      break;
    case "openai":
      provider = new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });
      break;
    case "anthropic":
    case "claude":
      provider = new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: process.env.ANTHROPIC_BASE_URL,
      });
      break;
    default:
      throw new ProviderError(`Unknown provider: '${name}'. Valid: gemini, openai, anthropic`);
  }

  _cache.set(name, provider);
  return provider;
}

export function clearProviderCache() {
  _cache.clear();
}

/**
 * Test-only: inject a pre-constructed provider instance so test code can
 * stub `stream()` / `generate()` without real API keys. Not for production.
 * @internal
 */
export function _registerProviderForTests(name, instance) {
  _cache.set(name, instance);
}

// Infer provider from a model id for /model shortcuts like "gpt-4o" or "claude-3-5-sonnet-latest".
export function inferProvider(modelId) {
  if (!modelId) return null;
  const m = modelId.toLowerCase();
  if (m.includes(":")) return m.split(":")[0]; // explicit "openai:gpt-4o"
  if (m.startsWith("gemini") || m.startsWith("text-embedding-004")) return "gemini";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("text-embedding-3")) return "openai";
  if (m.startsWith("claude")) return "anthropic";
  return null;
}

export { ProviderError };
