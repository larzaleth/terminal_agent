/**
 * Provider-neutral types & helpers.
 *
 * ─── Normalized message format ───────────────────────────────────────
 * {
 *   role: "user" | "assistant" | "tool",
 *   blocks: Array<
 *     | { type: "text", text: string }
 *     | { type: "tool_call", id: string, name: string, args: object }
 *     | { type: "tool_result", id: string, output: string }
 *   >
 * }
 *
 * ─── Normalized tool schema ──────────────────────────────────────────
 * {
 *   name: string,
 *   description: string,
 *   parameters: { type: "object", properties: {...}, required: [...] }
 * }
 *
 * ─── Provider interface ──────────────────────────────────────────────
 * class Provider {
 *   async *stream({ model, systemInstruction, messages, tools, signal }):
 *       AsyncIterator<
 *         | { type: "text", text: string }
 *         | { type: "tool_call", id, name, args }
 *         | { type: "usage", inputTokens, outputTokens }
 *       >
 *
 *   async generate({ model, prompt, signal }): Promise<string>
 *
 *   async embed(text): Promise<number[]>
 * }
 */

export class ProviderError extends Error {
  constructor(msg, { provider, status, cause } = {}) {
    super(msg);
    this.provider = provider;
    this.status = status;
    this.cause = cause;
  }
}

// Convert our toolDeclarations (Gemini UPPERCASE types) to a neutral JSON schema.
// Gemini API accepts either form; OpenAI/Anthropic need lowercase.
export function toJsonSchemaTools(decls) {
  return decls.map((d) => ({
    name: d.name,
    description: d.description,
    parameters: convertSchema(d.parameters),
  }));
}

function convertSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type" && typeof v === "string") {
      out[k] = v.toLowerCase();
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = convertSchema(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
