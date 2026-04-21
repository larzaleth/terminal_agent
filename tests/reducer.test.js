import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, initialState } from "../src/ui/reducer.js";

test("reducer: add_user_message appends a user message block", () => {
  const s = reducer(initialState, { type: "add_user_message", text: "hello" });
  assert.equal(s.finalized.length, 1);
  assert.equal(s.finalized[0].role, "user");
  assert.equal(s.finalized[0].blocks[0].text, "hello");
});

test("reducer: start_turn creates pending assistant and resets scroll", () => {
  const pre = { ...initialState, scrollOffset: 5 };
  const s = reducer(pre, { type: "start_turn" });
  assert.ok(s.pending);
  assert.equal(s.pending.role, "assistant");
  assert.equal(s.status, "thinking");
  assert.equal(s.scrollOffset, 0);
  assert.ok(typeof s.turnStartedAt === "number");
});

test("reducer: append_text merges with the last text block", () => {
  let s = reducer(initialState, { type: "start_turn" });
  s = reducer(s, { type: "append_text", text: "foo" });
  s = reducer(s, { type: "append_text", text: "bar" });
  const last = s.pending.blocks[s.pending.blocks.length - 1];
  assert.equal(last.type, "text");
  assert.equal(last.text, "foobar");
  assert.equal(s.pending.blocks.length, 1);
});

test("reducer: tool_start + tool_end updates status and recent list", () => {
  let s = reducer(initialState, { type: "start_turn" });
  s = reducer(s, { type: "tool_start", id: "t1", name: "read_file", args: { path: "a.js" } });
  assert.equal(s.status, "tool_running");
  s = reducer(s, { type: "tool_end", id: "t1", name: "read_file", result: "ok", error: false });
  assert.equal(s.currentTool, null);
  assert.deepEqual(s.recentTools, [{ name: "read_file", status: "done" }]);
  const toolBlock = s.pending.blocks.find((b) => b.type === "tool_call");
  assert.equal(toolBlock.status, "done");
  assert.equal(toolBlock.result, "ok");
});

test("reducer: tool_stream_chunk appends liveOutput to running tool only", () => {
  let s = reducer(initialState, { type: "start_turn" });
  s = reducer(s, { type: "tool_start", id: "t1", name: "run_command", args: { cmd: "npm i" } });
  s = reducer(s, { type: "tool_stream_chunk", name: "run_command", chunk: "added " });
  s = reducer(s, { type: "tool_stream_chunk", name: "run_command", chunk: "42 packages" });
  const block = s.pending.blocks.find((b) => b.type === "tool_call");
  assert.equal(block.liveOutput, "added 42 packages");
  assert.equal(block.expanded, true);
});

test("reducer: tool_stream_chunk trims to ~2000 chars", () => {
  let s = reducer(initialState, { type: "start_turn" });
  s = reducer(s, { type: "tool_start", id: "t1", name: "run_command", args: {} });
  const huge = "x".repeat(3000);
  s = reducer(s, { type: "tool_stream_chunk", name: "run_command", chunk: huge });
  const block = s.pending.blocks.find((b) => b.type === "tool_call");
  assert.equal(block.liveOutput.length, 2000);
});

test("reducer: commit_turn moves pending to finalized and snapshots metrics", () => {
  let s = reducer(initialState, { type: "start_turn" });
  s = reducer(s, { type: "append_text", text: "result" });
  s = reducer(s, {
    type: "commit_turn",
    turnEntry: { tokens: 123, cost: 0.0015, durationMs: 8000 },
  });
  assert.equal(s.pending, null);
  assert.equal(s.finalized.length, 1);
  assert.equal(s.turnHistory.length, 1);
  assert.equal(s.turnHistory[0].tokens, 123);
  assert.equal(s.turnHistory[0].cost, 0.0015);
  assert.ok(typeof s.turnHistory[0].ts === "number");
});

test("reducer: turnHistory is capped at 20 entries", () => {
  let s = { ...initialState };
  for (let i = 0; i < 25; i++) {
    s = reducer(s, { type: "start_turn" });
    s = reducer(s, {
      type: "commit_turn",
      turnEntry: { tokens: i, cost: i * 0.0001, durationMs: 1000 },
    });
  }
  assert.equal(s.turnHistory.length, 20);
  // Newest kept, oldest dropped
  assert.equal(s.turnHistory[s.turnHistory.length - 1].tokens, 24);
  assert.equal(s.turnHistory[0].tokens, 5);
});

test("reducer: toggle_stats flips statsExpanded", () => {
  let s = reducer(initialState, { type: "toggle_stats" });
  assert.equal(s.statsExpanded, true);
  s = reducer(s, { type: "toggle_stats" });
  assert.equal(s.statsExpanded, false);
});

test("reducer: scroll clamps between 0 and (total-1)", () => {
  let s = { ...initialState, finalized: [1, 2, 3].map((n) => ({ id: `x${n}`, role: "user", blocks: [] })) };
  s = reducer(s, { type: "scroll", delta: 100 });
  assert.equal(s.scrollOffset, 2);
  s = reducer(s, { type: "scroll", delta: -100 });
  assert.equal(s.scrollOffset, 0);
});

test("reducer: clear_history resets messages but preserves cost + turnHistory", () => {
  let s = reducer(initialState, { type: "add_user_message", text: "hi" });
  s = reducer(s, { type: "set_cost", cost: 0.5, tokens: 100, cacheHitRate: 10 });
  s = reducer(s, { type: "start_turn" });
  s = reducer(s, {
    type: "commit_turn",
    turnEntry: { tokens: 10, cost: 0.01, durationMs: 500 },
  });
  s = reducer(s, { type: "toggle_stats" });
  s = reducer(s, { type: "clear_history" });
  assert.equal(s.finalized.length, 0);
  assert.equal(s.cost, 0.5);
  assert.equal(s.turnHistory.length, 1);
  assert.equal(s.statsExpanded, true);
});
