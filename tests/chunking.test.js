import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../src/rag/semantic.js";

test("chunkText: short input returns single chunk", () => {
  const chunks = chunkText("line1\nline2\nline3");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], "line1\nline2\nline3");
});

test("chunkText: empty returns empty array", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText(null), []);
});

test("chunkText: long input is split with overlap", () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
  const text = lines.join("\n");
  const chunks = chunkText(text, { maxLines: 40, overlap: 5 });

  // Should produce multiple chunks
  assert.ok(chunks.length > 1);

  // Each chunk should not exceed maxLines
  for (const c of chunks) {
    assert.ok(c.split("\n").length <= 40);
  }

  // Overlap: chunk[0] last line should appear near start of chunk[1]
  const firstEndLine = chunks[0].split("\n").pop();
  const secondStart = chunks[1].split("\n").slice(0, 10);
  assert.ok(secondStart.includes(firstEndLine));
});

test("chunkText: skips empty chunks", () => {
  // A blob of empty lines followed by content
  const text = "\n\n\n" + Array(50).fill("x").join("\n");
  const chunks = chunkText(text);
  for (const c of chunks) {
    assert.ok(c.trim().length > 0);
  }
});
