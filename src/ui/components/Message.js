import { Box, Text } from "ink";
import { h } from "../h.js";
import { ToolCallBlock } from "./ToolCallBlock.js";
import { Markdown } from "../markdown.js";

function roleHeader(role) {
  switch (role) {
    case "user":
      return h(Text, { bold: true, color: "green" }, "🧑 You");
    case "assistant":
      return h(Text, { bold: true, color: "cyan" }, "🤖 Assistant");
    case "tool":
      return h(Text, { bold: true, color: "yellow" }, "🔧 Tool");
    case "system":
      return h(Text, { bold: true, color: "magenta" }, "📋 Plan");
    default:
      return h(Text, { bold: true }, role);
  }
}

export function Message({ message, focusedToolId }) {
  const { role, blocks = [] } = message;
  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(Box, { paddingLeft: 1 }, roleHeader(role)),
    ...blocks.map((block, idx) => {
      const key = `b${idx}`;
      if (block.type === "text") {
        const text = block.text || "";
        // User input is rendered as plain text; assistant/system/tool use Markdown.
        if (role === "user") {
          return h(
            Box,
            { key, paddingLeft: 3 },
            h(Text, { color: "white", wrap: "wrap" }, text)
          );
        }
        return h(
          Box,
          { key, paddingLeft: 3, flexDirection: "column" },
          h(Markdown, {
            text,
            color: role === "system" ? "magenta" : "whiteBright",
          })
        );
      }
      if (block.type === "plan") {
        return h(
          Box,
          { key, flexDirection: "column", paddingLeft: 3 },
          ...block.steps.map((s, i) =>
            h(Text, { key: `s${i}`, color: "magenta" }, `  ${i + 1}. ${s.step}`)
          )
        );
      }
      if (block.type === "tool_call") {
        return h(ToolCallBlock, {
          key,
          tool: block.tool,
          args: block.args,
          status: block.status,
          result: block.result,
          liveOutput: block.liveOutput,
          expanded: block.expanded,
          focused: focusedToolId === block.id,
        });
      }
      return null;
    })
  );
}
