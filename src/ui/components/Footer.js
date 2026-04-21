import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { h } from "../h.js";

function formatElapsed(ms) {
  if (!ms || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m${rem.toString().padStart(2, "0")}s`;
}

function getHints(status, canCancel, scrollOffset) {
  if (scrollOffset > 0) {
    return [
      { key: "PgUp/PgDn", label: "scroll" },
      { key: "G / End", label: "jump to bottom" },
      { key: "Ctrl+C", label: "exit" },
    ];
  }
  switch (status) {
    case "awaiting_edit":
      return [
        { key: "a/Enter", label: "approve" },
        { key: "r/Esc", label: "reject" },
        { key: "e", label: "edit manually" },
      ];
    case "awaiting_confirm":
      return [
        { key: "y/Enter", label: "allow" },
        { key: "n/Esc", label: "deny" },
      ];
    case "thinking":
    case "tool_running":
      return [
        ...(canCancel ? [{ key: "Esc", label: "cancel" }] : []),
        { key: "PgUp", label: "scroll history" },
        { key: "Ctrl+C", label: "exit" },
      ];
    default:
      return [
        { key: "Enter", label: "send" },
        { key: "↑/↓", label: "focus tool" },
        { key: "PgUp/PgDn", label: "scroll history" },
        { key: "Ctrl+L", label: "clear" },
        { key: "/help", label: "commands" },
      ];
  }
}

export function Footer({ status, message, elapsedMs = 0, canCancel = false, scrollOffset = 0 }) {
  const hints = getHints(status, canCancel, scrollOffset);
  const isWorking = status === "thinking" || status === "tool_running";
  const elapsedStr = isWorking ? formatElapsed(elapsedMs) : "";

  return h(
    Box,
    { paddingX: 1, justifyContent: "space-between" },
    h(
      Box,
      null,
      ...hints.flatMap((hint, i) => [
        h(Text, { key: `k${i}`, color: "cyan", bold: true }, hint.key),
        h(
          Text,
          { key: `l${i}`, color: "gray" },
          ` ${hint.label}${i < hints.length - 1 ? "  " : ""}`
        ),
      ])
    ),
    isWorking
      ? h(
          Box,
          null,
          h(Text, { color: "yellow" }, h(Spinner, { type: "dots" })),
          h(
            Text,
            { color: elapsedMs > 30_000 ? "red" : "yellow" },
            ` ${status === "tool_running" ? "running" : "thinking"} ${elapsedStr}`
          ),
          message ? h(Text, { color: "gray" }, ` — ${message}`) : null
        )
      : scrollOffset > 0
        ? h(Text, { color: "magenta", italic: true }, `📜 scrolled up ${scrollOffset} row-units`)
        : message
          ? h(Text, { color: "gray", italic: true }, message)
          : null
  );
}
