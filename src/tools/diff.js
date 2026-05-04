import { diffLines } from "diff";

/**
 * Summary stats for a text change.
 */
export function diffStats(oldText, newText) {
  const parts = diffLines(oldText, newText);
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    const lines = p.value.split("\n").filter(Boolean).length;
    if (p.added) added += lines;
    else if (p.removed) removed += lines;
  }
  return { added, removed };
}
