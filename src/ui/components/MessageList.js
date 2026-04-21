import { useEffect } from "react";
import { Box, Text } from "ink";
import { h } from "../h.js";
import { Message } from "./Message.js";
import { setToolRegions } from "../clickRegistry.js";

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

  const hasMessages = all.length > 0;
  const { visible, hiddenAbove, hiddenBelow } = hasMessages
    ? windowWithOffset(all, maxRows, scrollOffset)
    : { visible: [], hiddenAbove: 0, hiddenBelow: 0 };
  const regions = hasMessages ? computeToolRegions(visible, hiddenAbove > 0) : [];

  useEffect(() => {
    setToolRegions(regions);
  });

  if (!hasMessages) {
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
function estimateBlockRows(b) {
  if (b.type === "text") {
    const text = b.text || "";
    // Split by newlines, then wrap long lines at ~90 chars.
    const lines = text.split("\n");
    return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 90)), 0);
  }
  if (b.type === "plan") return (b.steps || []).length + 1;
  if (b.type === "tool_call") {
    if (b.expanded) {
      const argLines = b.args ? JSON.stringify(b.args, null, 2).split("\n").length : 1;
      const resLines =
        typeof b.result === "string" ? Math.min(12, b.result.split("\n").length) : 1;
      // border-top + header + "args:" + argLines + "result:" + resLines + border-bot
      return 5 + argLines + resLines;
    }
    return 1;
  }
  return 1;
}

function estimateRows(msg) {
  let rows = 1; // role header
  for (const b of msg.blocks || []) rows += estimateBlockRows(b);
  return rows + 1; // marginBottom
}

// Compute [{toolId, startY, endY}] in chat-pane-relative rows.
function computeToolRegions(visible, hasHeader) {
  const regions = [];
  let y = 0;
  if (hasHeader) y += 1; // "↑ N earlier messages" line
  for (const msg of visible) {
    y += 1; // role header
    for (const b of msg.blocks || []) {
      const rows = estimateBlockRows(b);
      if (b.type === "tool_call") {
        regions.push({ toolId: b.id, startY: y, endY: y + rows - 1 });
      }
      y += rows;
    }
    y += 1; // marginBottom
  }
  return regions;
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

// Exported for unit tests.
export { computeToolRegions, estimateRows };
