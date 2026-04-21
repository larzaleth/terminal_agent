import { Box, Text } from "ink";
import { h } from "../h.js";
import { Message } from "./Message.js";

/**
 * Bounded + scrollable message list.
 *
 *  scrollOffset = 0  → newest messages at the bottom (default)
 *  scrollOffset > 0  → shift the visible window backward by that many "rows"
 *                      so the user can read older history.
 *
 * Older messages are preserved in memory.json and exportable via /save.
 */
export function MessageList({ finalized, pending, focusedToolId, maxRows, scrollOffset = 0 }) {
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

  const { visible, hiddenAbove, hiddenBelow } = windowWithOffset(all, maxRows, scrollOffset);

  return h(
    Box,
    { flexDirection: "column" },
    hiddenAbove > 0
      ? h(
          Box,
          { paddingX: 1 },
          h(
            Text,
            { color: "gray", italic: true },
            `↑ ${hiddenAbove} earlier ${hiddenAbove === 1 ? "message" : "messages"} — PgUp to scroll, /save to export full transcript`
          )
        )
      : null,
    ...visible.map((msg) =>
      h(Message, { key: msg.id, message: msg, focusedToolId })
    ),
    hiddenBelow > 0
      ? h(
          Box,
          { paddingX: 1 },
          h(
            Text,
            { color: "magenta", italic: true },
            `↓ ${hiddenBelow} newer ${hiddenBelow === 1 ? "message" : "messages"} — PgDn / G to return to bottom`
          )
        )
      : null
  );
}

// ─── Heuristic: roughly how many rows does a message occupy? ─────────
function estimateRows(msg) {
  let rows = 1;
  for (const b of msg.blocks || []) {
    if (b.type === "text") {
      const text = b.text || "";
      rows += Math.max(1, Math.ceil(text.length / 90));
    } else if (b.type === "plan") {
      rows += (b.steps || []).length + 1;
    } else if (b.type === "tool_call") {
      if (b.expanded) {
        const argLines = b.args ? JSON.stringify(b.args, null, 2).split("\n").length : 1;
        const resLines =
          typeof b.result === "string" ? Math.min(12, b.result.split("\n").length) : 1;
        rows += 4 + argLines + resLines;
      } else {
        rows += 1;
      }
    }
  }
  return rows + 1;
}

function windowWithOffset(all, maxRows, scrollOffset) {
  const budget = maxRows && maxRows > 0 ? maxRows : Infinity;

  // Pick last-N messages that fit, shifted by scrollOffset "row units".
  // Each scroll tick ≈ 1 message-row of offset.
  const picked = [];
  let total = 0;
  let skipped = 0;

  for (let i = all.length - 1; i >= 0; i--) {
    const rows = estimateRows(all[i]);

    if (skipped < scrollOffset) {
      // Skip newer messages until we exhaust the offset.
      skipped += rows;
      continue;
    }

    if (total + rows > budget && picked.length > 0) break;
    picked.unshift(all[i]);
    total += rows;
  }

  const firstIdx = picked.length > 0 ? all.indexOf(picked[0]) : all.length;
  const lastIdx = picked.length > 0 ? all.indexOf(picked[picked.length - 1]) : -1;
  return {
    visible: picked,
    hiddenAbove: firstIdx,
    hiddenBelow: all.length - 1 - lastIdx,
  };
}
