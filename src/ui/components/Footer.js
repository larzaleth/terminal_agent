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

function statusLabel(status) {
  if (status === "thinking") return "THINKING";
  if (status === "writing") return "WRITING";
  if (status === "tool_running") return "RUNNING TOOL";
  if (status === "awaiting_edit") return "AWAITING APPROVAL";
  if (status === "awaiting_confirm") return "AWAITING CONFIRMATION";
  return "";
}

export function Footer({ status, message, elapsedMs = 0, canCancel = false, toast = null, model = "", cost = 0 }) {
  const isWorking = status === "thinking" || status === "writing" || status === "tool_running";
  const elapsedStr = isWorking ? formatElapsed(elapsedMs) : "";
  const costStr = `$${Number(cost || 0).toFixed(4)}`;

  if (toast) {
    return h(Box, { paddingX: 1, marginBottom: 1 }, h(Text, { color: toast.color || "cyan", bold: true }, `★ ${toast.text}`));
  }

  return h(
    Box,
    { paddingX: 1, justifyContent: "space-between", marginBottom: 1 },
    // Left: model + cost
    h(
      Box,
      {},
      h(Text, { color: "cyan", bold: true }, model),
      h(Text, { color: "gray" }, ` [${costStr}]`)
    ),
    // Right: status indicator
    isWorking
      ? h(
          Box,
          {},
          h(Text, { color: "yellow", bold: true }, `● ${statusLabel(status)} `),
          h(Text, { color: "gray" }, elapsedStr)
        )
      : message
        ? h(Text, { color: "gray" }, message)
        : h(Text, { color: "gray" }, "PageUp/Dn: scroll  Ctrl+C: exit")
  );
}
