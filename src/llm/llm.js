import dotenv from "dotenv";
import { getGlobalEnvPath } from "../config/config.js";
import { getProvider } from "./providers/index.js";

// Idempotent env loader — guards against double-parse.
let _loaded = false;
function ensureEnvLoaded() {
  if (_loaded) return;
  dotenv.config({ path: getGlobalEnvPath() });
  dotenv.config(); // also merge local .env if present
  _loaded = true;
}
ensureEnvLoaded();

/**
 * Backwards-compatible proxy so older call-sites that do `ai.models.embedContent(...)`
 * or `ai.models.generateContentStream(...)` keep working — it routes through the
 * Gemini provider. New code should use `getProvider(name)` directly.
 */
export const ai = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "models") {
        const g = getProvider("gemini");
        return {
          generateContent: (opts) => g.client.models.generateContent(opts),
          generateContentStream: (opts) => g.client.models.generateContentStream(opts),
          embedContent: (opts) => g.client.models.embedContent(opts),
        };
      }
      return undefined;
    },
  }
);

export { getProvider };
