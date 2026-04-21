import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { h } from "../h.js";

function Stat({ label, value, color = "white" }) {
  return h(
    Box,
    { justifyContent: "space-between" },
    h(Text, { color: "gray" }, label),
    h(Text, { color }, value ?? "—")
  );
}

export function Sidebar({ provider, model, status, currentTool, recentTools = [], cost, tokens, cacheHitRate, mcpServers = [] }) {
  return h(
    Box,
    {
      flexDirection: "column",
      paddingX: 1,
      borderStyle: "round",
      borderColor: "gray",
      minWidth: 28,
    },
    h(Text, { bold: true, color: "cyan" }, "  Session"),
    h(Box, { marginY: 0 }, h(Text, { color: "gray" }, "─".repeat(26))),

    h(Stat, { label: "Provider", value: provider, color: "magenta" }),
    h(Stat, { label: "Model", value: truncMid(model, 16), color: "white" }),

    h(Box, { marginTop: 1 }, h(Text, { bold: true, color: "cyan" }, "  Activity")),
    h(Box, null, h(Text, { color: "gray" }, "─".repeat(26))),

    status === "idle"
      ? h(Text, { color: "green" }, "● idle")
      : h(
          Box,
          null,
          h(Text, { color: "yellow" }, h(Spinner, { type: "dots" })),
          h(Text, { color: "yellow" }, ` ${status}`)
        ),
    currentTool ? h(Text, { color: "gray" }, `  → ${currentTool}`) : null,

    recentTools.length > 0
      ? h(
          Box,
          { marginTop: 1, flexDirection: "column" },
          h(Text, { bold: true, color: "cyan" }, "  Recent tools"),
          h(Text, { color: "gray" }, "─".repeat(26)),
          ...recentTools.slice(-5).reverse().map((t, i) =>
            h(
              Box,
              { key: `rt${i}` },
              h(Text, { color: t.status === "error" ? "red" : "green" }, t.status === "error" ? "✗ " : "✓ "),
              h(Text, { color: "white" }, truncMid(t.name, 22))
            )
          )
        )
      : null,

    h(Box, { marginTop: 1 }, h(Text, { bold: true, color: "cyan" }, "  Cost")),
    h(Box, null, h(Text, { color: "gray" }, "─".repeat(26))),
    h(Stat, { label: "Spent", value: `$${(cost || 0).toFixed(6)}`, color: "green" }),
    h(Stat, { label: "Tokens", value: (tokens || 0).toLocaleString(), color: "white" }),
    h(Stat, { label: "Cache", value: `${cacheHitRate || 0}%`, color: "cyan" }),

    mcpServers.length > 0
      ? h(
          Box,
          { marginTop: 1, flexDirection: "column" },
          h(Text, { bold: true, color: "cyan" }, "  MCP"),
          h(Text, { color: "gray" }, "─".repeat(26)),
          ...mcpServers.map((s, i) =>
            h(
              Text,
              { key: `mcp${i}`, color: "green" },
              `● ${s.server} (${s.tools?.length ?? 0})`
            )
          )
        )
      : null
  );
}

function truncMid(s, max) {
  if (!s) return "—";
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(-half)}`;
}
