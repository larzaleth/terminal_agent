import { useEffect } from "react";
import { Box, Text } from "ink";
import { h } from "../h.js";
import { Message } from "./Message.js";
import { setToolRegions, setBlockRegions } from "../clickRegistry.js";

/**
 * Bounded + scrollable message list.
 * Simplified Message List.
 * Shows last N messages to keep performance high and avoid complex layout math.
 */
export function MessageList({ finalized, pending, focusedToolId }) {
  const all = pending ? [...finalized, pending] : finalized;

  // Just show the last 10 messages for maximum stability/performance.
  // User can /save to see full history.
  const visible = all.slice(-10);

  if (all.length === 0) {
    return h(
      Box,
      { paddingX: 1, paddingY: 1 },
      h(
        Text,
        { color: "gray", italic: true },
        "Type your request below. /help for commands, Ctrl+C to quit."
      )
    );
  }

  return h(
    Box,
    { flexDirection: "column" },
    all.length > 10 &&
      h(
        Box,
        { paddingX: 1 },
        h(
          Text,
          { color: "gray", dimColor: true },
          `... ${all.length - 10} older messages hidden (use /save to export)`
        )
      ),
    ...visible.map((msg) =>
      h(Message, { key: msg.id, message: msg, focusedToolId })
    )
  );
}
