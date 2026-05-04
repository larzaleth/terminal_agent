import { Box, Text } from "ink";
import { h } from "../h.js";
import { ToolCallBlock } from "./ToolCallBlock.js";

// Tiny interactive area to prevent terminal "blinking" / shaking
const MAX_INTERACTIVE_LINES = 5;

function truncateText(text) {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= MAX_INTERACTIVE_LINES) return text;
  const hidden = lines.length - MAX_INTERACTIVE_LINES;
  // Show the LATEST lines during interaction so the user sees the progress (e.g. "creating file...")
  return `... (${hidden} lines hidden above)\n` + lines.slice(-MAX_INTERACTIVE_LINES).join("\n");
}

/**
 * Renders a single message (either finalized or pending).
 */
export function MessageItem({ msg, focusedToolId, isInteractive = false }) {
  if (!msg) return null;

  const roleLabel = msg.role === "user" ? "YOU" : msg.role === "assistant" ? "AGENT" : "SYSTEM";
  const roleColor = msg.role === "user" ? "green" : msg.role === "assistant" ? "cyan" : "yellow";

  const blocks = (msg.blocks || []).map((b, bi) => {
    if (b.type === "text" && b.text) {
      const text = isInteractive ? truncateText(b.text) : b.text;
      return h(Text, { key: `t${bi}` }, text);
    }
    if (b.type === "tool_call") {
      return h(ToolCallBlock, {
        key: `tc${bi}`,
        tool: b.tool,
        args: b.args,
        status: b.status,
        result: b.result,
        liveOutput: b.liveOutput,
        expanded: b.expanded,
        focused: focusedToolId === b.id,
      });
    }
    return null;
  });

  return h(
    Box,
    { flexDirection: "column", marginBottom: 1, paddingX: 1 },
    h(Text, { bold: true, color: roleColor }, roleLabel),
    ...blocks
  );
}
