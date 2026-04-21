import { Box, Text, Static } from "ink";
import { h } from "../h.js";
import { Message } from "./Message.js";

/**
 * Message list with two regions:
 *  - <Static>: finalized messages — written once, scroll back in the real terminal history.
 *  - Dynamic:  the in-progress assistant message (streaming text + tool calls).
 */
export function MessageList({ finalized, pending, focusedToolId }) {
  return h(
    Box,
    { flexDirection: "column" },
    h(
      Static,
      { items: finalized },
      (msg) => h(Message, { key: msg.id, message: msg })
    ),
    pending
      ? h(Message, { message: pending, focusedToolId })
      : finalized.length === 0
        ? h(
            Box,
            { paddingX: 1, marginTop: 1 },
            h(
              Text,
              { color: "gray", italic: true },
              "Type your request below. /help for commands, Ctrl+C to quit."
            )
          )
        : null
  );
}
