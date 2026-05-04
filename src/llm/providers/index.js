import { ProviderError } from "./base.js";

// Provider instances are cached per-name so we don't re-instantiate on every call.
const _cache = new Map();

// Module-level lazy loaders. Each provider's heavy SDK is only imported on the
// first call to getProvider("<name>"), saving ~200ms of cold start when a user
// only ever uses one provider (the common case).
const _loaders = {
  gemini: async () => {
    const { GeminiProvider } = await import("./gemini.js");
    return new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
  },
  openai: async () => {
    const { OpenAIProvider } = await import("./openai.js");
    return new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  },
  anthropic: async () => {
    const { AnthropicProvider } = await import("./anthropic.js");
    return new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL,
    });
  },
};

// Alias claude → anthropic
_loaders.claude = _loaders.anthropic;

/**
 * Resolve a provider instance by name. Async so the underlying SDK can be
 * lazy-imported on first use. Subsequent calls hit the in-memory cache.
 *
 * @param {string} name  one of "gemini" | "openai" | "anthropic" | "claude"
 * @returns {Promise<object>} provider instance
 */
export async function getProvider(name) {
  if (_cache.has(name)) return _cache.get(name);
  const loader = _loaders[name];
  if (!loader) {
    throw new ProviderError(`Unknown provider: '${name}'. Valid: gemini, openai, anthropic`);
  }
  const provider = await loader();
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

/**
 * Best-effort detection of which provider owns a given model identifier.
 * Returns null when the model doesn't match any known prefix — caller can
 * fall back to config.provider.
 */
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
