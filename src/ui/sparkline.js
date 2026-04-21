// Tiny zero-dependency sparkline renderer for the TUI sidebar.
// Maps a numeric series onto unicode bar characters.

const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values, width = 12) {
  if (!Array.isArray(values) || values.length === 0) return "";
  // Take the last `width` entries (right-aligned, newest at the right).
  const slice = values.slice(-width);
  const max = Math.max(...slice, 0);
  if (max === 0) return BARS[0].repeat(slice.length);
  return slice
    .map((v) => {
      const idx = Math.min(BARS.length - 1, Math.round((v / max) * (BARS.length - 1)));
      return BARS[Math.max(0, idx)];
    })
    .join("");
}

export function formatTokens(n) {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatCost(n) {
  if (!n || n === 0) return "$0";
  if (n < 0.001) return `$${n.toExponential(1)}`;
  return `$${n.toFixed(4)}`;
}
