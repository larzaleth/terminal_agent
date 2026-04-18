import OpenAI from "openai";
import { ProviderError } from "./base.js";

export class OpenAIProvider {
  constructor({ apiKey, baseURL }) {
    if (!apiKey) throw new ProviderError("OPENAI_API_KEY missing", { provider: "openai" });
    this.client = new OpenAI({ apiKey, baseURL });
    this.name = "openai";
  }

  _toOpenAIMessages(systemInstruction, messages) {
    const out = [];
    if (systemInstruction) out.push({ role: "system", content: systemInstruction });

    for (const m of messages) {
      if (!m.blocks || m.blocks.length === 0) continue;

      if (m.role === "tool") {
        for (const b of m.blocks) {
          if (b.type === "tool_result") {
            out.push({ role: "tool", tool_call_id: b.id, content: String(b.output) });
          }
        }
        continue;
      }

      if (m.role === "assistant") {
        const content = m.blocks.filter((b) => b.type === "text").map((b) => b.text).join("") || null;
        const tool_calls = m.blocks
          .filter((b) => b.type === "tool_call")
          .map((b) => ({
            id: b.id,
            type: "function",
            function: { name: b.name, arguments: JSON.stringify(b.args || {}) },
          }));
        const msg = { role: "assistant", content };
        if (tool_calls.length) msg.tool_calls = tool_calls;
        out.push(msg);
      } else {
        const content = m.blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
        out.push({ role: "user", content });
      }
    }
    return out;
  }

  _toOpenAITools(tools) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  async *stream({ model, systemInstruction, messages, tools }) {
    const stream = await this.client.chat.completions.create({
      model,
      messages: this._toOpenAIMessages(systemInstruction, messages),
      tools: this._toOpenAITools(tools),
      stream: true,
      stream_options: { include_usage: true },
    });

    // Tool calls stream incrementally by index — accumulate before emitting.
    const pendingCalls = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) yield { type: "text", text: delta.content };

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!pendingCalls.has(idx)) pendingCalls.set(idx, { id: "", name: "", argsStr: "" });
          const acc = pendingCalls.get(idx);
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.argsStr += tc.function.arguments;
        }
      }

      // When finish_reason arrives, flush accumulated tool_calls.
      if (chunk.choices?.[0]?.finish_reason) {
        for (const call of pendingCalls.values()) {
          let args = {};
          try { args = call.argsStr ? JSON.parse(call.argsStr) : {}; } catch { /* keep empty */ }
          yield { type: "tool_call", id: call.id, name: call.name, args };
        }
        pendingCalls.clear();
      }

      if (chunk.usage) {
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }

  async generate({ model, prompt, temperature = 0.1 }) {
    const resp = await this.client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
    });
    return resp.choices?.[0]?.message?.content || "";
  }

  async embed(text, model = "text-embedding-3-small") {
    const res = await this.client.embeddings.create({ model, input: text });
    return res.data[0].embedding;
  }
}
