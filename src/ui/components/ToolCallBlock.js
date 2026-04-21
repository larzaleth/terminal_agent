import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { h } from "../h.js";

const TOOL_ICON = {
  read_file: "📄",
  write_file: "✍️",
  edit_file: "✏️",
  list_dir: "📂",
  grep_search: "🔍",
  create_dir: "📁",
  delete_file: "🗑️",
  get_file_info: "ℹ️",
  run_command: "🚀",
};

function truncateInline(s, max = 60) {
  if (typeof s !== "string") s = JSON.stringify(s);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function argsSummary(args) {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args)
    .map(([k, v]) => `${k}=${truncateInline(v, 40)}`)
    .join(", ");
}

export function ToolCallBlock({ tool, args, status, result, liveOutput, expanded, focused }) {
  const icon = TOOL_ICON[tool] || "🔧";
  const statusColor = status === "running" ? "yellow" : status === "error" ? "red" : "green";
  const statusMark = status === "running" ? h(Spinner, { type: "dots" }) : status === "error" ? "✗" : "✓";

  const header = h(
    Box,
    null,
    h(Text, { color: focused ? "cyan" : statusColor }, expanded ? "▼ " : "▶ "),
    h(Text, null, `${icon} `),
    h(Text, { bold: true, color: focused ? "cyan" : "white" }, tool),
    h(Text, { color: "gray" }, `(${argsSummary(args)})`),
    h(Text, { color: statusColor }, "  "),
    typeof statusMark === "string"
      ? h(Text, { color: statusColor }, statusMark)
      : h(Text, { color: statusColor }, statusMark)
  );

  if (!expanded) return h(Box, { flexDirection: "column", marginLeft: 2 }, header);

  const argsLines = args && Object.keys(args).length
    ? JSON.stringify(args, null, 2).split("\n")
    : ["(no args)"];

  const resultText = status === "running"
    ? (liveOutput && liveOutput.trim() ? liveOutput : "(running…)")
    : typeof result === "string"
      ? result.length > 1200
        ? result.slice(0, 1200) + "\n…(truncated — full result preserved in memory)"
        : result
      : JSON.stringify(result || "", null, 2);

  return h(
    Box,
    {
      flexDirection: "column",
      marginLeft: 2,
      paddingX: 1,
      borderStyle: "round",
      borderColor: focused ? "cyan" : "gray",
    },
    header,
    h(Text, { color: "gray", italic: true }, "  args:"),
    ...argsLines.map((line, i) => h(Text, { key: `a${i}`, color: "gray" }, `  ${line}`)),
    h(Text, { color: "gray", italic: true }, "  result:"),
    ...resultText.split("\n").map((line, i) =>
      h(Text, { key: `r${i}`, color: status === "error" ? "red" : "white" }, `  ${line}`)
    )
  );
}
