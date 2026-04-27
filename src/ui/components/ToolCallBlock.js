import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { h } from "../h.js";

const TOOL_ICON = {
  read_file: "󰈙",
  write_file: "󰏫",
  edit_file: "󰏫",
  list_dir: "󰉓",
  grep_search: "󰍉",
  create_dir: "󰉋",
  delete_file: "󰩹",
  get_file_info: "󰋽",
  run_command: "󰚗",
  batch_edit: "󰒔",
};

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
  const icon = TOOL_ICON[tool] || "󱗼";
  const isRunning = status === "running";
  const isError = status === "error";
  const statusColor = isRunning ? "yellow" : isError ? "red" : "green";
  
  const header = h(
    Box,
    { gap: 1 },
    h(Text, { color: statusColor }, isRunning ? h(Spinner, { type: "dots" }) : isError ? "" : ""),
    h(Text, { color: statusColor }, icon),
    h(Text, { bold: true, color: focused ? "cyan" : "white" }, tool.toUpperCase()),
    !expanded && h(Text, { color: "gray", dimColor: true }, `(${argsSummary(args)})`)
  );

  if (!expanded) return h(Box, { flexDirection: "column", marginLeft: 2, marginY: 0 }, header);

  const resultText = isRunning
    ? (liveOutput && liveOutput.trim() ? liveOutput : "Executing...")
    : typeof result === "string"
      ? result.length > 1200
        ? result.slice(0, 1200) + "\n…(truncated)"
        : result
      : JSON.stringify(result || "", null, 2);

  return h(
    Box,
    {
      flexDirection: "column",
      marginLeft: 2,
      paddingX: 1,
      borderStyle: "single",
      borderColor: focused ? "cyan" : "gray",
      paddingY: 0,
      marginBottom: 1,
    },
    header,
    h(
      Box,
      { flexDirection: "column", marginLeft: 2, marginTop: 1 },
      h(Text, { color: "blue", dimColor: true, bold: true }, "INPUT"),
      h(Text, { color: "gray" }, JSON.stringify(args, null, 2)),
      h(Box, { marginTop: 1 }),
      h(Text, { color: "blue", dimColor: true, bold: true }, "OUTPUT"),
      ...resultText.split("\n").map((line, i) =>
        h(Text, { key: `r${i}`, color: isError ? "red" : "white" }, line)
      )
    )
  );
}
