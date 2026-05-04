import { Box, Text, useInput } from "ink";
import { h } from "../h.js";

export function ConfirmPrompt({ message, reason, onResolve }) {
  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) return onResolve(true);
    if (input === "n" || input === "N" || key.escape) return onResolve(false);
  });

  return h(
    Box,
    { flexDirection: "column", paddingX: 1, backgroundColor: "yellow" },
    h(Text, { bold: true, color: "black" }, "CONFIRMATION REQUIRED"),
    reason ? h(Text, { color: "black", dimColor: true }, `(${reason})`) : null,
    h(Box, { marginTop: 0 }, h(Text, { color: "black" }, message)),
    h(
      Box,
      { gap: 2 },
      h(Text, { color: "black", bold: true }, "[y] ALLOW"),
      h(Text, { color: "black", bold: true }, "[n] DENY")
    )
  );
}
