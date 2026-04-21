import { Box, Text, useInput } from "ink";
import { h } from "../h.js";
import { renderDiff, diffStats } from "../../tools/diff.js";

/**
 * Interactive diff preview prompt. Fills the input area while awaiting a decision.
 *  a / Enter → approve
 *  r / Esc   → reject
 *  e         → manual edit (cancels the agent's edit)
 */
export function DiffPrompt({ filePath, oldContent, newContent, onResolve }) {
  const diffText = renderDiff(oldContent, newContent, filePath);
  const { added, removed } = diffStats(oldContent, newContent);

  useInput((input, key) => {
    if (input === "a" || key.return) return onResolve({ decision: "approve" });
    if (input === "r" || key.escape) return onResolve({ decision: "reject" });
    if (input === "e") return onResolve({ decision: "manual" });
  });

  // Split diff into lines & trim to terminal height minus UI chrome.
  const lines = diffText.split("\n").slice(0, 25);

  return h(
    Box,
    { flexDirection: "column", paddingX: 1, borderStyle: "double", borderColor: "yellow" },
    h(Text, { bold: true, color: "yellow" }, `✏️  Proposed edit: ${filePath}`),
    h(Text, { color: "gray" }, `   +${added} / -${removed} lines`),
    h(Box, { marginTop: 1, flexDirection: "column" }, ...lines.map((l, i) => h(Text, { key: i }, l))),
    h(
      Box,
      { marginTop: 1 },
      h(Text, { color: "green", bold: true }, "[a] approve"),
      h(Text, { color: "gray" }, "   "),
      h(Text, { color: "red", bold: true }, "[r] reject"),
      h(Text, { color: "gray" }, "   "),
      h(Text, { color: "cyan", bold: true }, "[e] edit manually")
    )
  );
}
