import fs from "fs";
import { getProvider } from "../llm/providers/index.js";
import { loadConfig } from "../config/config.js";
import { MEMORY_FILE } from "../config/constants.js";

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
// 🔹 SAVE (with smart truncate via LLM summary)
// ===========================
export async function saveMemory(memory) {
  const config = loadConfig();
  const maxTurns = config.maxMemoryTurns || 20;
  if (memory.length > maxTurns) {
    memory = await summarizeMemory(memory);
  }
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// ===========================
// 🔹 CLEAR
// ===========================
export function clearMemory() {
  fs.writeFileSync(MEMORY_FILE, "[]");
}

// ===========================
// 🔥 LLM-POWERED SUMMARIZATION
// ===========================
async function summarizeMemory(memory) {
  const config = loadConfig();
  const recentCount = 10;
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

    const summaryText = (await provider.generate({ model: config.summaryModel, prompt })) ||
      "Previous conversation context was summarized.";

    return [
      { role: "user", blocks: [{ type: "text", text: `[CONVERSATION SUMMARY]\n${summaryText}\n[END SUMMARY]` }] },
      ...recentMessages,
    ];
  } catch (err) {
    console.log(`⚠️ Memory summarization fallback: ${err.message}`);
    return [
      { role: "user", blocks: [{ type: "text", text: "[CONTEXT] Previous conversation was summarized. Maintain context and patterns." }] },
      ...recentMessages,
    ];
  }
}
