// Token budget per turn — agent stops cleanly when cumulative tokens cross threshold.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { _registerProviderForTests, clearProviderCache } from "../src/llm/providers/index.js";
import { runAgent } from "../src/core/agents.js";

let testDir;
let previousCwd;

beforeEach(() => {
  previousCwd = process.cwd();
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-"));
  process.chdir(testDir);
  clearProviderCache();
});

afterEach(() => {
  process.chdir(previousCwd);
  fs.rmSync(testDir, { recursive: true, force: true });
});

function makeStubProvider(scripts) {
  let callIndex = 0;
  const captured = [];
  return {
    captured,
    async *stream(opts) {
      const lastMsg = opts.messages[opts.messages.length - 1];
      const lastText = lastMsg?.blocks?.[0]?.text || "";
      captured.push({ count: opts.messages.length, lastRole: lastMsg?.role, lastText });
      const events = scripts[callIndex++] || [];
      for (const evt of events) yield evt;
    },
    async generate() { return ""; },
    async embed() { return []; },
  };
}

// list_dir is a built-in tool that doesn't write — safe to use in stub scripts.
const listDirCall = (id) => ({ type: "tool_call", id, name: "list_dir", args: { path: "." } });

test("token budget: agent stops after wrap-up when cumulative tokens exceed threshold", async () => {
  const stub = makeStubProvider([
    // Turn 1 — under budget. Calls a tool so the agent loops to turn 2.
    [
      { type: "text", text: "first " },
      listDirCall("c1"),
      { type: "usage", inputTokens: 300, outputTokens: 300 },
    ],
    // Turn 2 — pushes cumulative tokens OVER budget (1000). Still calls tool.
    [
      { type: "text", text: "second " },
      listDirCall("c2"),
      { type: "usage", inputTokens: 300, outputTokens: 300 },
    ],
    // Turn 3 — agent has seen the budget notice, emits final summary, no tool calls → ends.
    [
      { type: "text", text: "summary done" },
      { type: "usage", inputTokens: 50, outputTokens: 50 },
    ],
  ]);
  _registerProviderForTests("gemini", stub);

  let captured = "";
  const out = await runAgent("hello", {
    onText: (t) => { captured += t; },
    definition: {
      provider: "gemini",
      model: "gemini-3-flash",
      maxTokensPerTurn: 1000,
      skipPlanner: true,
      skipRag: true,
    },
  });

  assert.ok(out.includes("first"), "first turn text preserved");
  assert.ok(out.includes("second"), "second turn text preserved");
  assert.ok(out.includes("summary done"), "post-budget wrap-up turn text preserved");

  // Third stream call should see the budget-notice user message at the end of memory.
  assert.equal(stub.captured.length, 3, "exactly 3 stream calls");
  const thirdCall = stub.captured[2];
  assert.equal(thirdCall.lastRole, "user", "wrap-up turn sees user notice as latest message");
  assert.match(thirdCall.lastText, /Token budget reached/i);
  assert.match(captured, /Token budget reached/i);
});

test("token budget: agent runs to completion when budget is unset (default)", async () => {
  const stub = makeStubProvider([
    [
      { type: "text", text: "no limits here" },
      { type: "usage", inputTokens: 100000, outputTokens: 100000 },
    ],
  ]);
  _registerProviderForTests("gemini", stub);

  const out = await runAgent("hi", {
    definition: {
      provider: "gemini",
      model: "gemini-3-flash",
      skipPlanner: true,
      skipRag: true,
    },
    onText: () => {},
  });

  assert.match(out, /no limits here/);
});

test("token budget: hard-stops on second overage even if agent ignores wrap-up nudge", async () => {
  const stub = makeStubProvider([
    // Turn 1 — over budget already (300+300=600 > 500). Calls a tool so loop continues.
    [
      { type: "text", text: "doing work " },
      listDirCall("h1"),
      { type: "usage", inputTokens: 300, outputTokens: 300 },
    ],
    // Turn 2 — agent ignores the wrap-up nudge and burns more tokens with another tool call.
    [
      { type: "text", text: "ignoring nudge " },
      listDirCall("h2"),
      { type: "usage", inputTokens: 300, outputTokens: 300 },
    ],
    // Turn 3 should NEVER run — hard-stop kicks in at top of next iteration.
    [
      { type: "text", text: "SHOULD NOT APPEAR" },
      { type: "usage", inputTokens: 1, outputTokens: 1 },
    ],
  ]);
  _registerProviderForTests("gemini", stub);

  const out = await runAgent("hi", {
    definition: {
      provider: "gemini",
      model: "gemini-3-flash",
      maxTokensPerTurn: 500,
      skipPlanner: true,
      skipRag: true,
    },
    onText: () => {},
  });

  assert.ok(!out.includes("SHOULD NOT APPEAR"), "third turn must not run after hard stop");
  assert.equal(stub.captured.length, 2, "stream() must be called only twice");
});
