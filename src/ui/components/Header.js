import { Box, Text } from "ink";
import { h } from "../h.js";

export function Header({ provider, model, cost, iteration, maxIterations }) {
  const costStr = `$${Number(cost || 0).toFixed(6)}`;
  return h(
    Box,
    {
      paddingX: 1,
      borderStyle: "round",
      borderColor: "cyan",
      justifyContent: "space-between",
    },
    h(
      Box,
      null,
      h(Text, { bold: true, color: "cyan" }, "🤖 AI Coding Agent"),
      h(Text, { color: "gray" }, "  v2.4")
    ),
    h(
      Box,
      null,
      h(Text, { color: "magenta" }, `${provider}`),
      h(Text, { color: "gray" }, ":"),
      h(Text, { color: "white" }, `${model}`),
      h(Text, { color: "gray" }, "  │  "),
      h(Text, { color: "green" }, costStr),
      iteration
        ? h(
            Text,
            { color: "yellow" },
            `  │  iter ${iteration}/${maxIterations}`
          )
        : null
    )
  );
}
