import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { h } from "../h.js";
import { sparkline, formatTokens, formatCost } from "../sparkline.js";

function Stat({ label, value, color = "white" }) {
  return h(
    Box,
    { justifyContent: "space-between" },
    h(Text, { color: "gray" }, label),
    h(Text, { color }, value ?? "—")
  );
}

function TurnChart({ turnHistory = [], expanded = false }) {
  if (turnHistory.length === 0) {
    return h(
      Box,
      { marginTop: 1, flexDirection: "column" },
      h(Text, { bold: true, color: "cyan" }, "  Per-turn stats"),
      h(Text, { color: "gray" }, "─".repeat(26)),
      h(Text, { color: "gray", italic: true }, "  (no turns yet — /stats to toggle)")
    );
  }

  const tokens = turnHistory.map((t) => t.tokens || 0);
  const costs = turnHistory.map((t) => t.cost || 0);
  const durations = turnHistory.map((t) => t.durationMs || 0);

  const last = turnHistory[turnHistory.length - 1];
  const avgTokens = Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length);
  const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
  const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 100) / 10;

  return h(
    Box,
    { marginTop: 1, flexDirection: "column" },
    h(Text, { bold: true, color: "cyan" }, "  Per-turn stats"),
    h(Text, { color: "gray" }, "─".repeat(26)),
    h(
      Box,
      null,
      h(Text, { color: "gray" }, "tok "),
      h(Text, { color: "green" }, sparkline(tokens, 20))
    ),
    h(
      Box,
      null,
      h(Text, { color: "gray" }, "cost"),
      h(Text, { color: "yellow" }, " " + sparkline(costs, 20))
    ),
    expanded
      ? h(
          Box,
          { flexDirection: "column", marginTop: 1 },
          h(Stat, {
            label: "Last tok",
            value: formatTokens(last.tokens),
            color: "green",
          }),
          h(Stat, {
            label: "Last $",
            value: formatCost(last.cost),
            color: "green",
          }),
          h(Stat, {
            label: "Last time",
            value: `${(last.durationMs / 1000).toFixed(1)}s`,
            color: "white",
          }),
          h(Text, { color: "gray" }, "─".repeat(26)),
          h(Stat, {
            label: "Avg tok",
            value: formatTokens(avgTokens),
            color: "cyan",
          }),
          h(Stat, {
            label: "Avg $",
            value: formatCost(avgCost),
            color: "cyan",
          }),
          h(Stat, {
            label: "Avg time",
            value: `${avgDuration.toFixed(1)}s`,
            color: "cyan",
          }),
          h(Stat, {
            label: "Turns",
            value: `${turnHistory.length}`,
            color: "white",
          })
        )
      : h(Text, { color: "gray", italic: true }, `  ${turnHistory.length} turn(s) — /stats for detail`)
  );
}

export function Sidebar({
  provider,
  model,
  status,
  currentTool,
  recentTools = [],
  cost,
  tokens,
  cacheHitRate,
  mcpServers = [],
  turnHistory = [],
  statsExpanded = false,
}) {
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
          ...recentTools
            .slice(-5)
            .reverse()
            .map((t, i) =>
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

    h(TurnChart, { turnHistory, expanded: statsExpanded }),

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
