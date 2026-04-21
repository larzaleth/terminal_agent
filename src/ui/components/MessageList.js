import { Box, Text } from "ink";
import { h } from "../h.js";
import { Message } from "./Message.js";

/**
 * Bounded message list. Shows the last N messages that fit within the
 * available rows budget. Uses a cheap height heuristic per message.
 *
 * Older messages are preserved in `memory.json` and can be exported via /save,
 * so truncating them from the view is cosmetic only.
 */
export function MessageList({ finalized, pending, focusedToolId, maxRows }) {
  const all = pending ? [...finalized, pending] : finalized;

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

  const visible = windowToFit(all, maxRows);
  const hiddenCount = all.length - visible.length;

  return h(
    Box,
    { flexDirection: "column" },
    hiddenCount > 0
      ? h(
          Box,
          { paddingX: 1 },
          h(
            Text,
            { color: "gray", italic: true },
            `… ${hiddenCount} earlier message${hiddenCount === 1 ? "" : "s"} hidden — use /save to export full transcript`
          )
        )
      : null,
    ...visible.map((msg) =>
      h(Message, { key: msg.id, message: msg, focusedToolId })
    )
  );
}

// ─── Heuristic: how many rows does a message roughly occupy? ─────────
function estimateRows(msg) {
  let rows = 1; // role header
  for (const b of msg.blocks || []) {
    if (b.type === "text") {
      // approximate wrap: 1 line per 90 chars
      const text = b.text || "";
      rows += Math.max(1, Math.ceil(text.length / 90));
    } else if (b.type === "plan") {
      rows += (b.steps || []).length + 1;
    } else if (b.type === "tool_call") {
      if (b.expanded) {
        const argLines = b.args ? JSON.stringify(b.args, null, 2).split("\n").length : 1;
        const resLines = typeof b.result === "string" ? Math.min(12, b.result.split("\n").length) : 1;
        rows += 4 + argLines + resLines;
      } else {
        rows += 1;
      }
    }
  }
  return rows + 1; // trailing blank
}

function windowToFit(all, maxRows) {
  if (!maxRows || maxRows <= 0) return all;

  // Walk from newest backwards, accumulating until we exceed the budget.
  const picked = [];
  let total = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const rows = estimateRows(all[i]);
    if (total + rows > maxRows && picked.length > 0) break;
    picked.unshift(all[i]);
    total += rows;
  }
  return picked;
}
