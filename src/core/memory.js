import fs from "fs";
import { ai } from "../llm/llm.js";
import { config } from "../config/config.js";
import { MEMORY_FILE } from "../config/constants.js";

// ===========================
// 🔹 LOAD
// ===========================
export function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  try {
    const data = fs.readFileSync(MEMORY_FILE, "utf-8");
    if (!data.trim()) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// ===========================
// 🔹 SAVE (with smart truncate via LLM summary)
// ===========================
export async function saveMemory(memory) {
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
  const recentCount = 10;
  const oldMessages = memory.slice(0, -recentCount);
  const recentMessages = memory.slice(-recentCount);

  const textParts = oldMessages
    .map((msg) => {
      const role = msg.role || "unknown";
      const texts = (msg.parts || [])
        .filter((p) => p.text)
        .map((p) => p.text)
        .join("\n");
      return texts ? `[${role}]: ${texts}` : null;
    })
    .filter(Boolean)
    .join("\n---\n");

  if (!textParts.trim()) {
    return [
      { role: "user", parts: [{ text: "[CONTEXT] Previous conversation history was cleared to save memory." }] },
      ...recentMessages,
    ];
  }

  try {
    const response = await ai.models.generateContent({
      model: config.summaryModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Summarize this conversation history into a concise context paragraph.
Focus on: what was discussed, what files were modified, what decisions were made, and any important patterns or conventions discovered.

Conversation:
${textParts.slice(0, 4000)}

Respond with ONLY the summary paragraph, no extra formatting.`,
            },
          ],
        },
      ],
      config: { temperature: 0.1 },
    });

    const summaryText = response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Previous conversation context was summarized.";

    return [
      { role: "user", parts: [{ text: `[CONVERSATION SUMMARY]\n${summaryText}\n[END SUMMARY]` }] },
      ...recentMessages,
    ];
  } catch (err) {
    console.log(`⚠️ Memory summarization fallback: ${err.message}`);
    return [
      { role: "user", parts: [{ text: "[CONTEXT] Previous conversation was summarized. Maintain context and patterns." }] },
      ...recentMessages,
    ];
  }
}
