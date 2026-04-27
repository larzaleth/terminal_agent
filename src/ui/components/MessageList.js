import { Box, Text } from "ink";
import { h } from "../h.js";
import { ToolCallBlock } from "./ToolCallBlock.js";

/**
 * MessageList with virtualized-ish scrolling.
 * It takes the full history and slices it based on scrollOffset.
 */
export function MessageList({ finalized, pending, focusedToolId, scrollOffset = 0 }) {
  const all = pending ? [...finalized, pending] : finalized;

  if (all.length === 0) {
    return h(Box, { paddingY: 1 }, h(Text, { color: "gray" }, "Type a message below to get started."));
  }

  // To implement scroll, we basically take a window of the messages.
  // Since messages have variable height, we'll just show the last N messages
  // and let the user scroll through the message array itself.
  
  // Base view: show last 5 messages.
  // If scrollOffset > 0, we shift that window back.
  const windowSize = 5;
  const start = Math.max(0, all.length - windowSize - scrollOffset);
  const end = Math.max(0, all.length - scrollOffset);
  const visible = all.slice(start, end);

  return h(
    Box,
    { flexDirection: "column" },
    ...visible.map((msg) => {
      const roleLabel = msg.role === "user" ? "YOU" : msg.role === "assistant" ? "AGENT" : "SYSTEM";
      const roleColor = msg.role === "user" ? "green" : msg.role === "assistant" ? "cyan" : "yellow";

      const blocks = (msg.blocks || []).map((b, bi) => {
        if (b.type === "text" && b.text) {
          return h(Text, { key: `t${bi}` }, b.text);
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
        { key: msg.id, flexDirection: "column", marginBottom: 1 },
        h(Text, { bold: true, color: roleColor }, roleLabel),
        ...blocks
      );
    })
  );
}
