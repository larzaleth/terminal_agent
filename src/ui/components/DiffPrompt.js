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
  // Limit diff height to keep UI stable
  const lines = diffText.split("\n").slice(0, 10);

  return h(
    Box,
    { flexDirection: "column", paddingX: 1, backgroundColor: "yellow" },
    h(Text, { bold: true, color: "black" }, `PROPOSED EDIT: ${filePath}`),
    h(Text, { color: "black", dimColor: true }, `+${added} / -${removed} lines`),
    h(Box, { flexDirection: "column", marginTop: 0 }, ...lines.map((l, i) => h(Text, { key: i, color: "black" }, l))),
    h(
      Box,
      { gap: 2 },
      h(Text, { color: "black", bold: true }, "[a] APPROVE"),
      h(Text, { color: "black", bold: true }, "[r] REJECT"),
      h(Text, { color: "black", bold: true }, "[e] MANUAL")
    )
  );
}
