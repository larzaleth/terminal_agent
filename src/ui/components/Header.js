import { Box, Text } from "ink";
import { h } from "../h.js";

export function Header({ provider, model, cost, iteration, maxIterations }) {
  const costStr = `$${Number(cost || 0).toFixed(6)}`;
  const providerLabel = provider ? String(provider).toUpperCase() : "";
  return h(
    Box,
    {
      paddingX: 1,
      gap: 2,
      backgroundColor: "blue",
    },
    h(
      Box,
      { gap: 1 },
      h(Text, { bold: true, color: "white" }, "AI AGENT"),
      h(Text, { color: "white", dimColor: true }, "v2.5.0"),
      h(Text, { color: "white" }, "┃"),
      providerLabel
        ? h(Text, { color: "yellowBright", bold: true }, providerLabel)
        : null,
      providerLabel ? h(Text, { color: "white" }, "┃") : null,
      h(Text, { color: "cyanBright", bold: true }, model || "")
    ),
    h(
      Box,
      { gap: 1, flexGrow: 1, justifyContent: "flex-end" },
      h(Text, { color: "white" }, "COST"),
      h(Text, { color: "greenBright", bold: true }, costStr),
      iteration
        ? h(
            Box,
            { gap: 1 },
            h(Text, { color: "white" }, "┃"),
            h(Text, { color: "white" }, `STEP ${iteration}/${maxIterations || 25}`)
          )
        : null
    )
  );
}
