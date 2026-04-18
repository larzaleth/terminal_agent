import fs from "fs/promises";
import path from "path";
import { loadMemory } from "./memory.js";

/**
 * Export current memory as a markdown transcript.
 * Handles both normalized and legacy Gemini-style message shapes.
 */
export async function exportTranscript(outputPath = "transcript.md") {
  const memory = loadMemory();
  if (!memory || memory.length === 0) {
    throw new Error("No conversation memory to export.");
  }

  const ts = new Date().toISOString();
  let md = `# Agent Session Transcript\n\n`;
  md += `_Exported: ${ts}_\n`;
  md += `_Messages: ${memory.length}_\n\n---\n\n`;

  for (const msg of memory) {
    const role = (msg.role || "unknown").toUpperCase();
    const header = role === "USER" ? "🧑 User" : role === "MODEL" || role === "ASSISTANT" ? "🤖 Assistant" : role === "TOOL" ? "🔧 Tool" : role;
    md += `## ${header}\n\n`;

    // Gemini-style { role, parts: [...] }
    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (part.text) {
          md += `${part.text}\n\n`;
        } else if (part.functionCall) {
          md += `**🔧 Tool call:** \`${part.functionCall.name}\`\n\n`;
          md += `\`\`\`json\n${JSON.stringify(part.functionCall.args ?? {}, null, 2)}\n\`\`\`\n\n`;
        } else if (part.functionResponse) {
          const result = part.functionResponse.response?.result ?? "";
          md += `**📤 Tool result (${part.functionResponse.name}):**\n\n`;
          md += `\`\`\`\n${String(result).slice(0, 2000)}\n\`\`\`\n\n`;
        }
      }
    }
    // Normalized { role, blocks: [...] }
    else if (Array.isArray(msg.blocks)) {
      for (const b of msg.blocks) {
        if (b.type === "text") md += `${b.text}\n\n`;
        else if (b.type === "tool_call") {
          md += `**🔧 Tool call:** \`${b.name}\`\n\n`;
          md += `\`\`\`json\n${JSON.stringify(b.args ?? {}, null, 2)}\n\`\`\`\n\n`;
        } else if (b.type === "tool_result") {
          md += `**📤 Tool result:**\n\n\`\`\`\n${String(b.output).slice(0, 2000)}\n\`\`\`\n\n`;
        }
      }
    }
    // Fallback: plain content string
    else if (typeof msg.content === "string") {
      md += `${msg.content}\n\n`;
    }

    md += "---\n\n";
  }

  const abs = path.resolve(outputPath);
  await fs.writeFile(abs, md);
  return { path: abs, bytes: Buffer.byteLength(md), messages: memory.length };
}
