import { Box, Text, useInput } from "ink";
import { h } from "../h.js";

export function ConfirmPrompt({ message, reason, onResolve }) {
  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) return onResolve(true);
    if (input === "n" || input === "N" || key.escape) return onResolve(false);
  });

  return h(
    Box,
    { flexDirection: "column", paddingX: 1, borderStyle: "double", borderColor: "yellow" },
    h(Text, { bold: true, color: "yellow" }, "⚠️  Confirmation required"),
    reason ? h(Text, { color: "gray" }, `   (${reason})`) : null,
    h(Box, { marginTop: 1 }, h(Text, { color: "white" }, message)),
    h(
      Box,
      { marginTop: 1 },
      h(Text, { color: "green", bold: true }, "[y/Enter] allow"),
      h(Text, { color: "gray" }, "   "),
      h(Text, { color: "red", bold: true }, "[n/Esc] deny")
    )
  );
}
