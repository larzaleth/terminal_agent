import fs from "fs";
import { getProvider } from "../llm/providers/index.js";
import { loadConfig } from "../config/config.js";
import { MEMORY_FILE, MAX_MEMORY_TOKENS } from "../config/constants.js";
import { writeFileAtomicSync, estimateTokens } from "../utils/utils.js";

// ===========================
// 🔹 LOAD (with auto-migration from legacy Gemini {role, parts} format)
// ===========================
export function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  try {
    const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return parsed.map(migrateMessage).filter(Boolean);
  } catch {
    return [];
  }
}

// Normalize any historical Gemini-style message to the neutral {role, blocks} form.
function migrateMessage(msg) {
  if (!msg) return null;
  if (Array.isArray(msg.blocks)) return msg; // already normalized

  if (Array.isArray(msg.parts)) {
    const blocks = [];
    for (const p of msg.parts) {
      if (p.text) blocks.push({ type: "text", text: p.text });
      else if (p.functionCall) {
        blocks.push({
          type: "tool_call",
          id: p.functionCall.id || `call_${Math.random().toString(36).slice(2, 10)}`,
          name: p.functionCall.name,
          args: p.functionCall.args || {},
        });
      } else if (p.functionResponse) {
        blocks.push({
          type: "tool_result",
          id: p.functionResponse.id || "legacy",
          name: p.functionResponse.name,
          output: String(p.functionResponse.response?.result ?? ""),
        });
      }
    }
    const role = msg.role === "model" ? "assistant" : msg.role === "user" ? (blocks.some((b) => b.type === "tool_result") ? "tool" : "user") : msg.role;
    return { role, blocks };
  }

  return null;
}

// ===========================
// 🔹 SAVE
// ===========================
export async function saveMemory(memory, signal) {
  const compressed = await compressMemoryIfNeeded(memory, signal);
  writeFileAtomicSync(MEMORY_FILE, JSON.stringify(compressed, null, 2));
}

/**
 * Adaptive context window: summarize if too many turns OR too many tokens.
 * @param {Array} memory 
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array>} Compressed memory
 */
export async function compressMemoryIfNeeded(memory, signal) {
  const config = loadConfig();
  const maxTurns = config.maxMemoryTurns || 20;

  const estimatedTokens = memory.reduce((sum, msg) => {
    const text = (msg.blocks || [])
      .map((b) => (typeof b.text === "string" ? b.text : JSON.stringify(b)))
      .join("");
    return sum + estimateTokens(text);
  }, 0);

  if (memory.length > maxTurns || estimatedTokens > MAX_MEMORY_TOKENS) {
    if (process.env.MYAGENT_DEBUG === "1") {
      console.error(`[DEBUG] Summarizing memory: turns=${memory.length}/${maxTurns}, tokens=${estimatedTokens}/${MAX_MEMORY_TOKENS}`);
    }
    return await summarizeMemory(memory, signal);
  }
  return memory;
}

// ... clearMemory stays same ...
export function clearMemory() {
  writeFileAtomicSync(MEMORY_FILE, "[]");
}

// ===========================
// 🔥 LLM-POWERED SUMMARIZATION
// ===========================
async function summarizeMemory(memory, signal) {
  const config = loadConfig();
  const recentCount = Math.min(memory.length > 5 ? 5 : 2, 10);
  const oldMessages = memory.slice(0, -recentCount);
  const recentMessages = memory.slice(-recentCount);

  const textParts = oldMessages
    .map((msg) => {
      const role = msg.role || "unknown";
      const texts = (msg.blocks || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return texts ? `[${role}]: ${texts}` : null;
    })
    .filter(Boolean)
    .join("\n---\n");

  if (!textParts.trim()) {
    return [
      { role: "user", blocks: [{ type: "text", text: "[CONTEXT] Previous conversation history was cleared to save memory." }] },
      ...recentMessages,
    ];
  }

  try {
    const provider = getProvider(config.provider || "gemini");
    const prompt = `Summarize this conversation history into a concise context paragraph.
Focus on: what was discussed, what files were modified, what decisions were made, and any important patterns or conventions discovered.

Conversation:
${textParts.slice(0, 4000)}

Respond with ONLY the summary paragraph, no extra formatting.`;

    // 10s timeout for summarization to avoid hanging the app
    const timeoutSignal = AbortSignal.timeout(10000);
    const combinedSignal = signal 
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const summaryText = (await provider.generate({ 
      model: config.summaryModel, 
      prompt,
      signal: combinedSignal 
    })) || "Previous conversation context was summarized.";

    return [
      { role: "user", blocks: [{ type: "text", text: `[CONVERSATION SUMMARY]\n${summaryText}\n[END SUMMARY]` }] },
      ...recentMessages,
    ];
  } catch (err) {
    if (process.env.MYAGENT_DEBUG === "1") {
      console.error(`[DEBUG] Memory summarization failed/skipped: ${err.message}`);
    }
    return [
      { role: "user", blocks: [{ type: "text", text: "[CONTEXT] Previous conversation was summarized. Maintain context and patterns." }] },
      ...recentMessages,
    ];
  }
}
