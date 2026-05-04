import { GoogleGenAI } from "@google/genai";
import { ProviderError } from "./base.js";

export class GeminiProvider {
  constructor({ apiKey }) {
    if (!apiKey) throw new ProviderError("GEMINI_API_KEY missing", { provider: "gemini" });
    this.client = new GoogleGenAI({ apiKey });
    this.name = "gemini";
  }

  /**
   * Convert our normalized messages into Gemini's {role, parts} format.
   * Gemini uses "model" for assistant role and treats tool results as "user"
   * role with functionResponse parts.
   */
  _toGeminiContents(messages) {
    const out = [];
    for (const m of messages) {
      if (!m.blocks || m.blocks.length === 0) continue;

      if (m.role === "tool") {
        // Tool results — grouped into a single user turn with functionResponse parts.
        const parts = m.blocks
          .filter((b) => b.type === "tool_result")
          .map((b) => ({
            functionResponse: { name: b.name || "tool", response: { result: b.output } },
          }));
        if (parts.length) out.push({ role: "user", parts });
        continue;
      }

      const role = m.role === "assistant" ? "model" : "user";
      const parts = [];
      for (const b of m.blocks) {
        if (b.type === "text" || b.type === "thought") {
          // Send thoughts back as plain text to avoid "Unsupported input part type"
          // while preserving context.
          parts.push({ text: b.text });
        } else if (b.type === "tool_call") {
          const callObj = { functionCall: { name: b.name, args: b.args || {} } };
          if (b.thoughtSignature) callObj.thoughtSignature = b.thoughtSignature;
          parts.push(callObj);
        }
      }
      if (parts.length) out.push({ role, parts });
    }
    return out;
  }

  _toGeminiTools(tools) {
    if (!tools || tools.length === 0) return undefined;
    // Gemini accepts lowercase JSON-schema types as well as uppercase.
    return [{ functionDeclarations: tools }];
  }

  async *stream({ model, systemInstruction, messages, tools, signal }) {
    const contents = this._toGeminiContents(messages);
    const geminiTools = this._toGeminiTools(tools);

    // If using a model that supports thinking (like gemini-2.0-flash-thinking-exp),
    // we want to preserve thoughts. For standard models, budget 0 is ignored or harmless.
    const config = {
      systemInstruction,
      tools: geminiTools,
      thinkingConfig: { includeThoughts: true },
    };

    const resp = await this.client.models.generateContentStream({
      model,
      contents,
      config,
    }, { signal });

    let lastUsage = null;
    for await (const chunk of resp) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.thought) {
          // If it's a thought part, it usually also has the text in part.text
          yield { type: "thought", text: part.text || "" };
          continue; // Don't yield it twice if it has both
        }
        if (part.text) {
          yield { type: "text", text: part.text };
        }
        if (part.functionCall) {
          yield {
            type: "tool_call",
            id: part.functionCall.id || `call_${Math.random().toString(36).slice(2, 10)}`,
            name: part.functionCall.name,
            args: part.functionCall.args || {},
            thoughtSignature: part.thoughtSignature,
          };
        }
      }
      if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
    }

    if (lastUsage) {
      yield {
        type: "usage",
        inputTokens: lastUsage.promptTokenCount ?? 0,
        outputTokens: lastUsage.candidatesTokenCount ?? 0,
      };
    }
  }

  async generate({ model, prompt, temperature = 0.1, signal }) {
    const resp = await this.client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature },
    }, { signal });
    return resp?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  async embed(text, model = "text-embedding-004") {
    const res = await this.client.models.embedContent({ model, contents: text });
    // SDK 1.51+ returns { embeddings: [{values}] }; older returns { embedding: { values } }
    const vec = res.embeddings?.[0]?.values || res.embedding?.values;
    if (!vec) throw new ProviderError("Gemini embed: empty response", { provider: "gemini" });
    return vec;
  }

  /**
   * Batch embed multiple texts in a single API call.
   * @param {string[]} texts
   * @param {string} model
   * @returns {Promise<number[][]>} Array of vectors in the same order as inputs.
   */
  async embedBatch(texts, model = "text-embedding-004") {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const res = await this.client.models.embedContent({ model, contents: texts });
    const list = res.embeddings;
    if (!Array.isArray(list) || list.length !== texts.length) {
      throw new ProviderError(
        `Gemini embedBatch: expected ${texts.length} vectors, got ${list?.length ?? 0}`,
        { provider: "gemini" }
      );
    }
    return list.map((e) => e.values);
  }
}
