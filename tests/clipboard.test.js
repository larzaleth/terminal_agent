import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOsc52,
  writeClipboard,
  extractLastAssistant,
  extractFocusedTool,
  extractCurrentTurn,
  extractAll,
} from "../src/ui/clipboard.js";
import {
  setBlockRegions,
  extractTextInRange,
  getBlockRegions,
} from "../src/ui/clickRegistry.js";

test("buildOsc52: wraps payload in ESC ] 52 ; c ; <base64> ESC \\", () => {
  const seq = buildOsc52("hello");
  assert.ok(seq.startsWith("\x1b]52;c;"));
  assert.ok(seq.endsWith("\x1b\\"));
  const b64 = seq.slice("\x1b]52;c;".length, -2);
  assert.equal(Buffer.from(b64, "base64").toString("utf8"), "hello");
});

test("buildOsc52: UTF-8 survives the round-trip", () => {
  const seq = buildOsc52("héllo 世界 🚀");
  const b64 = seq.slice("\x1b]52;c;".length, -2);
  assert.equal(Buffer.from(b64, "base64").toString("utf8"), "héllo 世界 🚀");
});

test("writeClipboard: returns false when stdout is not a TTY", () => {
  const fakeStdout = { isTTY: false, write: () => {} };
  assert.equal(writeClipboard("test", fakeStdout), false);
});

test("writeClipboard: writes OSC 52 escape when stdout is a TTY", () => {
  const chunks = [];
  const fakeStdout = {
    isTTY: true,
    write: (s) => {
      chunks.push(s);
      return true;
    },
  };
  const ok = writeClipboard("hi", fakeStdout);
  assert.equal(ok, true);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].startsWith("\x1b]52;c;"));
});

test("extractLastAssistant: returns concatenated text of the last assistant msg", () => {
  const state = {
    finalized: [
      { role: "user", blocks: [{ type: "text", text: "hey" }] },
      {
        role: "assistant",
        blocks: [
          { type: "text", text: "sure, here's the plan:" },
          { type: "tool_call", id: "t1", tool: "read_file", args: {} },
          { type: "text", text: "done." },
        ],
      },
    ],
    pending: null,
  };
  const out = extractLastAssistant(state);
  assert.ok(out.includes("sure"));
  assert.ok(out.includes("done"));
  assert.ok(!out.includes("read_file")); // tool_call blocks excluded from last-assistant yank
});

test("extractFocusedTool: returns tool args + result", () => {
  const state = {
    pending: {
      role: "assistant",
      blocks: [
        { type: "tool_call", id: "t1", tool: "read_file", args: { path: "a.js" }, result: "file contents here" },
      ],
    },
    focusedToolIdx: 0,
  };
  const out = extractFocusedTool(state);
  assert.ok(out.includes("read_file"));
  assert.ok(out.includes("file contents here"));
});

test("extractCurrentTurn: uses pending first, falls back to last assistant", () => {
  const withPending = {
    pending: { role: "assistant", blocks: [{ type: "text", text: "streaming..." }] },
    finalized: [],
  };
  assert.ok(extractCurrentTurn(withPending).includes("streaming"));

  const noPending = {
    pending: null,
    finalized: [
      { role: "user", blocks: [{ type: "text", text: "q" }] },
      { role: "assistant", blocks: [{ type: "text", text: "answer" }] },
    ],
  };
  assert.ok(extractCurrentTurn(noPending).includes("answer"));
});

test("extractAll: concats every message with role headers", () => {
  const state = {
    finalized: [
      { role: "user", blocks: [{ type: "text", text: "Q" }] },
      { role: "assistant", blocks: [{ type: "text", text: "A" }] },
    ],
    pending: null,
  };
  const out = extractAll(state);
  assert.ok(out.includes("## user"));
  assert.ok(out.includes("## assistant"));
  assert.ok(out.includes("Q"));
  assert.ok(out.includes("A"));
});

test("clickRegistry: extractTextInRange returns overlapping block text", () => {
  setBlockRegions([
    { startY: 0, endY: 0, text: "🧑 You" },
    { startY: 1, endY: 1, text: "refactor this" },
    { startY: 2, endY: 2, text: "🤖 Assistant" },
    { startY: 3, endY: 5, text: "Sure, here's the plan..." },
    { startY: 6, endY: 6, text: "[read_file] {}" },
  ]);
  const mid = extractTextInRange(1, 3);
  assert.ok(mid.includes("refactor this"));
  assert.ok(mid.includes("Assistant"));
  assert.ok(mid.includes("Sure"));
  assert.ok(!mid.includes("read_file"));
  assert.equal(getBlockRegions().length, 5);
});

test("clickRegistry: extractTextInRange normalises reversed ranges", () => {
  setBlockRegions([
    { startY: 0, endY: 0, text: "a" },
    { startY: 1, endY: 1, text: "b" },
    { startY: 2, endY: 2, text: "c" },
  ]);
  assert.equal(extractTextInRange(2, 0), "a\nb\nc");
});

test("clickRegistry: empty registry returns empty string", () => {
  setBlockRegions([]);
  assert.equal(extractTextInRange(0, 100), "");
});
