import { Text, Box } from "ink";
import { h } from "./h.js";

/**
 * Minimal markdown → Ink renderer. Supports:
 *   - **bold**, *italic*, _italic_, `code`, [link](url)
 *   - # H1, ## H2, ### H3
 *   - - list items, > blockquotes
 *   - ``` fenced code blocks ```
 *
 * Good enough for assistant responses. Not a CommonMark parser.
 */

const INLINE_RE = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_|`[^`\n]+?`|\[[^\]]+?\]\([^)\n]+?\))/g;

function renderInline(text, keyPrefix = "i") {
  if (!text) return [];
  const parts = [];
  let lastIdx = 0;
  let match;
  let k = 0;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(
        h(Text, { key: `${keyPrefix}_${k++}` }, text.slice(lastIdx, match.index))
      );
    }
    const m = match[0];
    if (m.startsWith("**")) {
      parts.push(h(Text, { key: `${keyPrefix}_${k++}`, bold: true }, m.slice(2, -2)));
    } else if (m.startsWith("_") || m.startsWith("*")) {
      parts.push(h(Text, { key: `${keyPrefix}_${k++}`, italic: true }, m.slice(1, -1)));
    } else if (m.startsWith("`")) {
      parts.push(
        h(Text, { key: `${keyPrefix}_${k++}`, color: "yellow" }, m.slice(1, -1))
      );
    } else if (m.startsWith("[")) {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(m);
      if (lm) {
        parts.push(
          h(
            Text,
            { key: `${keyPrefix}_${k++}`, color: "blue", underline: true },
            lm[1]
          )
        );
      }
    }
    lastIdx = match.index + m.length;
  }
  if (lastIdx < text.length) {
    parts.push(h(Text, { key: `${keyPrefix}_${k++}` }, text.slice(lastIdx)));
  }
  return parts.length > 0 ? parts : [h(Text, { key: `${keyPrefix}_fallback` }, text)];
}

export function Markdown({ text, color = "whiteBright" }) {
  if (!text) return null;

  const lines = text.split("\n");
  const nodes = [];
  let inCode = false;
  let codeBuf = [];
  let codeLang = "";
  let key = 0;

  const flushCode = () => {
    if (codeBuf.length === 0) return;
    nodes.push(
      h(
        Box,
        {
          key: `c${key++}`,
          flexDirection: "column",
          paddingX: 1,
          borderStyle: "round",
          borderColor: "gray",
          marginY: 0,
        },
        codeLang
          ? h(Text, { color: "magenta", italic: true }, codeLang)
          : null,
        ...codeBuf.map((l, i) =>
          h(Text, { key: `cl${i}`, color: "cyan" }, l || " ")
        )
      )
    );
    codeBuf = [];
    codeLang = "";
  };

  for (const line of lines) {
    // Fenced code blocks
    if (/^```/.test(line)) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      nodes.push(
        h(Text, { key: `h${key++}`, bold: true, color: "cyan" }, line.slice(4))
      );
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        h(Text, { key: `h${key++}`, bold: true, color: "magenta" }, line.slice(3))
      );
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(
        h(
          Text,
          { key: `h${key++}`, bold: true, color: "magentaBright", underline: true },
          line.slice(2)
        )
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        h(
          Text,
          { key: `q${key++}`, color: "gray" },
          "│ ",
          ...renderInline(line.slice(2), `q${key}`)
        )
      );
      continue;
    }

    // List items
    const listMatch = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (listMatch) {
      const indent = listMatch[1];
      nodes.push(
        h(
          Text,
          { key: `l${key++}`, color },
          `${indent}• `,
          ...renderInline(listMatch[2], `l${key}`)
        )
      );
      continue;
    }

    // Numbered list
    const numMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
    if (numMatch) {
      nodes.push(
        h(
          Text,
          { key: `n${key++}`, color },
          `${numMatch[1]}${numMatch[2]}. `,
          ...renderInline(numMatch[3], `n${key}`)
        )
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      nodes.push(h(Text, { key: `e${key++}` }, " "));
      continue;
    }

    // Normal paragraph
    nodes.push(
      h(Text, { key: `p${key++}`, color, wrap: "wrap" }, ...renderInline(line, `p${key}`))
    );
  }

  if (inCode) flushCode();

  return h(Box, { flexDirection: "column" }, ...nodes);
}
