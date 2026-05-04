import { Box, Text } from "ink";
import { h } from "../h.js";

function truncateInline(s, max = 60) {
  if (typeof s !== "string") s = String(s);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function argsSummary(args) {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args)
    .map(([k, v]) => `${k}=${truncateInline(v, 20)}`)
    .join(", ");
}

export function ToolCallBlock({ tool, args, status, result, liveOutput, expanded, focused }) {
  const isRunning = status === "running";
  const isError = status === "error";
  const statusMarker = isRunning ? "⟳" : isError ? "!" : "✓";
  const statusColor = isRunning ? "yellow" : isError ? "red" : "green";
  const toolLabel = String(tool || "").toUpperCase();

  const header = h(
    Box,
    { gap: 1 },
    h(Text, { color: statusColor, bold: true }, statusMarker),
    h(Text, { color: focused ? "cyanBright" : "white", bold: true }, toolLabel),
    !expanded && h(Text, { color: "gray" }, `(${argsSummary(args)})`)
  );

  if (!expanded) return h(Box, { flexDirection: "column", marginLeft: 2 }, header);

  const resultText = isRunning
    ? (liveOutput && liveOutput.trim() ? liveOutput : "Executing...")
    : typeof result === "string"
      ? result.length > 800
        ? result.slice(0, 800) + "\n... (truncated)"
        : result
      : JSON.stringify(result || "", null, 2);

  return h(
    Box,
    {
      flexDirection: "column",
      marginLeft: 2,
      marginBottom: 1,
    },
    header,
    h(
      Box,
      { flexDirection: "column", marginLeft: 2, marginTop: 1 },
      h(Text, { color: "blue", bold: true }, "INPUT"),
      h(Text, { color: "blue", dimColor: true }, JSON.stringify(args || {})),
      h(Text, { color: isError ? "red" : "greenBright", bold: true }, "OUTPUT"),
      h(Text, { color: isError ? "red" : "gray" }, resultText)
    )
  );
}
