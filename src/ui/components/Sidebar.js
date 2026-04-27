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
  const isIdle = status === "idle";
  const statusColor = isIdle ? "green" : "yellow";

  return h(
    Box,
    {
      flexDirection: "column",
      paddingX: 1,
      borderStyle: "single",
      borderColor: "blue",
      minWidth: 30,
    },
    // Header
    h(
      Box,
      { marginBottom: 1, justifyContent: "center" },
      h(Text, { bold: true, color: "blueBright" }, " MONITOR")
    ),

    // Status Section
    h(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      h(Text, { color: "gray", dimColor: true }, "STATUS"),
      h(
        Box,
        null,
        h(Text, { color: statusColor }, isIdle ? "●" : h(Spinner, { type: "dots" })),
        h(Text, { color: statusColor, bold: true }, ` ${status.toUpperCase()}`)
      ),
      currentTool
        ? h(
            Box,
            { marginLeft: 2 },
            h(Text, { color: "gray" }, "↳ "),
            h(Text, { color: "white", dimColor: true }, truncMid(currentTool, 20))
          )
        : null
    ),

    h(Text, { color: "gray", dimColor: true }, "─".repeat(28)),

    // Session Info
    h(
      Box,
      { flexDirection: "column", marginY: 1 },
      h(Stat, { label: "PROVIDER", value: provider.toUpperCase(), color: "magentaBright" }),
      h(Stat, { label: "MODEL", value: truncMid(model, 16), color: "white" })
    ),

    h(Text, { color: "gray", dimColor: true }, "─".repeat(28)),

    // Metrics
    h(
      Box,
      { flexDirection: "column", marginY: 1 },
      h(Stat, {
        label: "SPENT",
        value: `$${(cost || 0).toFixed(6)}`,
        color: "greenBright",
      }),
      h(Stat, {
        label: "TOKENS",
        value: (tokens || 0).toLocaleString(),
        color: "whiteBright",
      }),
      h(Stat, {
        label: "CACHE",
        value: `${cacheHitRate || 0}%`,
        color: "cyanBright",
      })
    ),

    h(TurnChart, { turnHistory, expanded: statsExpanded }),

    // Tools Activity
    recentTools.length > 0 &&
      h(
        Box,
        { flexDirection: "column", marginTop: 1 },
        h(Text, { color: "gray", dimColor: true }, "RECENT TOOLS"),
        ...recentTools
          .slice(-4)
          .reverse()
          .map((t, i) =>
            h(
              Box,
              { key: `rt${i}` },
              h(Text, { color: t.status === "error" ? "red" : "green" }, t.status === "error" ? " " : " "),
              h(Text, { color: "gray", dimColor: true }, ` ${truncMid(t.name, 22)}`)
            )
          )
      ),

    // MCP Section
    mcpServers.length > 0 &&
      h(
        Box,
        { flexDirection: "column", marginTop: 1 },
        h(Text, { color: "gray", dimColor: true }, "MCP SERVERS"),
        ...mcpServers.map((s, i) =>
          h(
            Text,
            { key: `mcp${i}`, color: "cyan", dimColor: true },
            ` ${s.server} (${s.tools?.length ?? 0})`
          )
        )
      )
  );
}

function truncMid(s, max) {
  if (!s) return "—";
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(-half)}`;
}
