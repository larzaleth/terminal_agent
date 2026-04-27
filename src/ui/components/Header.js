import { Box, Text } from "ink";
import { h } from "../h.js";

export function Header({ provider, model, cost, iteration, maxIterations }) {
  const costStr = `$${Number(cost || 0).toFixed(6)}`;
  return h(
    Box,
    {
      paddingX: 1,
      borderStyle: "single",
      borderColor: "blue",
      justifyContent: "space-between",
    },
    h(
      Box,
      { gap: 1 },
      h(Text, { bold: true, color: "blueBright" }, " AI AGENT"),
      h(Text, { color: "blue", dimColor: true }, "v2.5.0"),
      h(Text, { color: "gray" }, "┃"),
      h(Text, { color: "whiteBright" }, provider.toUpperCase()),
      h(Text, { color: "gray", dimColor: true }, "»"),
      h(Text, { color: "cyan" }, model)
    ),
    h(
      Box,
      { gap: 1 },
      h(
        Box,
        null,
        h(Text, { color: "gray", dimColor: true }, "COST "),
        h(Text, { color: "greenBright", bold: true }, costStr)
      ),
      iteration
        ? h(
            Box,
            null,
            h(Text, { color: "gray" }, " ┃ "),
            h(Text, { color: "gray", dimColor: true }, "STEP "),
            h(Text, { color: "yellowBright", bold: true }, `${iteration}`),
            h(Text, { color: "gray", dimColor: true }, `/${maxIterations}`)
          )
        : null
    )
  );
}
