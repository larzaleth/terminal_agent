import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { h } from "../h.js";

// Dynamic hints based on session state.
function getHints(status) {
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
      return [{ key: "Ctrl+C", label: "cancel" }];
    default:
      return [
        { key: "Enter", label: "send" },
        { key: "↑", label: "focus tool blocks" },
        { key: "Ctrl+L", label: "clear" },
        { key: "Ctrl+C", label: "exit" },
        { key: "/help", label: "commands" },
      ];
  }
}

export function Footer({ status, message }) {
  const hints = getHints(status);
  return h(
    Box,
    { paddingX: 1, justifyContent: "space-between" },
    h(
      Box,
      null,
      ...hints.flatMap((hint, i) => [
        h(Text, { key: `k${i}`, color: "cyan", bold: true }, hint.key),
        h(Text, { key: `l${i}`, color: "gray" }, ` ${hint.label}${i < hints.length - 1 ? "  " : ""}`),
      ])
    ),
    status === "thinking" || status === "tool_running"
      ? h(
          Box,
          null,
          h(Text, { color: "yellow" }, h(Spinner, { type: "dots" })),
          h(Text, { color: "gray" }, ` ${message || "Thinking..."}`)
        )
      : message
        ? h(Text, { color: "gray", italic: true }, message)
        : null
  );
}
