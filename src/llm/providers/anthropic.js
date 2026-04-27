import Anthropic from "@anthropic-ai/sdk";
import { ProviderError } from "./base.js";

export class AnthropicProvider {
  constructor({ apiKey, baseURL }) {
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY missing", { provider: "anthropic" });
    this.client = new Anthropic({ apiKey, baseURL });
    this.name = "anthropic";
  }

  _toAnthropicMessages(messages) {
    // Anthropic: user/assistant roles with content blocks array.
    // Tool results go in "user" role as tool_result blocks.
    const out = [];
    for (const m of messages) {
      if (!m.blocks || m.blocks.length === 0) continue;

      if (m.role === "tool") {
        const content = m.blocks
          .filter((b) => b.type === "tool_result")
          .map((b) => ({
            type: "tool_result",
            tool_use_id: b.id,
            content: String(b.output),
          }));
        if (content.length) out.push({ role: "user", content });
        continue;
      }

      const role = m.role === "assistant" ? "assistant" : "user";
      const content = [];
      for (const b of m.blocks) {
        if (b.type === "text" && b.text) content.push({ type: "text", text: b.text });
        else if (b.type === "tool_call") {
          content.push({ type: "tool_use", id: b.id, name: b.name, input: b.args || {} });
        }
      }
      if (content.length) out.push({ role, content });
    }
    return out;
  }

  _toAnthropicTools(tools) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  async *stream({ model, systemInstruction, messages, tools }) {
    const params = {
      model,
      max_tokens: 4096,
      system: systemInstruction,
      messages: this._toAnthropicMessages(messages),
      tools: this._toAnthropicTools(tools),
      stream: true,
    };

    const stream = await this.client.messages.stream(params);

    const pending = new Map(); // content_block index → { id, name, json }
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          pending.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            json: "",
          });
        }
      } else if (event.type === "content_block_delta") {
        const d = event.delta;
        if (d.type === "text_delta") {
          yield { type: "text", text: d.text };
        } else if (d.type === "input_json_delta") {
          const acc = pending.get(event.index);
          if (acc) acc.json += d.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        const acc = pending.get(event.index);
        if (acc) {
          let args = {};
          try { args = acc.json ? JSON.parse(acc.json) : {}; } catch { /* keep empty */ }
          yield { type: "tool_call", id: acc.id, name: acc.name, args };
          pending.delete(event.index);
        }
      } else if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens;
      } else if (event.type === "message_start" && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens ?? 0;
      }
    }

    yield { type: "usage", inputTokens, outputTokens };
  }

  async generate({ model, prompt, temperature = 0.1, signal }) {
    const resp = await this.client.messages.create({
      model,
      max_tokens: 2048,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }, { abortSignal: signal });
    return resp.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
  }

  async embed() {
    // Anthropic doesn't offer a native embedding endpoint. Callers should
    // keep using the Gemini/OpenAI provider for embeddings.
    throw new ProviderError(
      "Anthropic has no embedding API. Set embeddingProvider to 'gemini' or 'openai' in agent.config.json.",
      { provider: "anthropic" }
    );
  }
}
