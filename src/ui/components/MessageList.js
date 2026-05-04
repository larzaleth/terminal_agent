import { Box, Text } from "ink";
import { h } from "../h.js";
import { ToolCallBlock } from "./ToolCallBlock.js";

/**
 * Given the currently-visible messages and whether a sticky header is shown,
 * compute the Y-range each tool_call block occupies inside the chat pane.
 *
 * Heuristic rows-per-block:
 *   - collapsed tool_call: 1 row
 *   - expanded tool_call:  2 rows of chrome + result line count (clamped)
 *   - text block:          ~max(1, ceil(len / 80))
 *   - plan block:          1 row per step
 *   - role header:         1 row per message
 *
 * Coordinates are chat-pane-relative (0-based). `hasHeader` shifts everything
 * down by 1 so the caller doesn't need to do arithmetic.
 */
export function computeToolRegions(messages, hasHeader = false) {
  const regions = [];
  let y = hasHeader ? 1 : 0;

  for (const msg of messages || []) {
    // Role header
    y += 1;
    for (const block of msg.blocks || []) {
      if (block.type === "text") {
        const text = block.text || "";
        const lines = Math.max(1, text.split("\n").length);
        y += lines;
      } else if (block.type === "plan") {
        y += Math.max(1, (block.steps || []).length);
      } else if (block.type === "tool_call") {
        if (block.expanded) {
          const resultText = typeof block.result === "string" ? block.result : "";
          const liveText = typeof block.liveOutput === "string" ? block.liveOutput : "";
          const body = resultText || liveText;
          const bodyLines = body ? Math.min(20, body.split("\n").length) : 1;
          const startY = y;
          // 2 chrome rows (header + args) + body
          const span = 2 + bodyLines;
          const endY = y + span - 1;
          regions.push({ toolId: block.id, startY, endY });
          y = endY + 1;
        } else {
          regions.push({ toolId: block.id, startY: y, endY: y });
          y += 1;
        }
      }
    }
    // Inter-message spacing
    y += 1;
  }

  return regions;
}

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
