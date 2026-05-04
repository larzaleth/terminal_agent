// Integration test: runAgent honors AgentDefinition (tool filtering + prompt override).
//
// Uses a stub provider to avoid real LLM calls. Verifies:
//   1. Tools NOT in allowedTools are unavailable to the agent.
//   2. systemPromptOverride replaces the default senior prompt.
//   3. model/provider/maxIterations overrides are respected.
//   4. Loop detection (sliding window) does NOT false-positive on
//      different tool args within the window.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { _registerProviderForTests, clearProviderCache } from "../src/llm/providers/index.js";
import { runAgent } from "../src/core/agents.js";
import { getAgent } from "../src/core/agents/index.js";
import { MEMORY_FILE } from "../src/config/constants.js";

let testDir;
let previousCwd;

beforeEach(() => {
  previousCwd = process.cwd();
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-it-"));
  process.chdir(testDir);
  clearProviderCache();
});

afterEach(() => {
  process.chdir(previousCwd);
  fs.rmSync(testDir, { recursive: true, force: true });
});

/**
 * Build a stub provider that yields a scripted sequence of stream events.
 * Each invocation of `stream()` pops the next batch from `scripts`.
 */
function makeStubProvider(scripts) {
  let callIndex = 0;
  const capturedCalls = [];
  return {
    capturedCalls,
    async *stream(opts) {
      capturedCalls.push({
        model: opts.model,
        systemInstruction: opts.systemInstruction,
        toolNames: (opts.tools || []).map((t) => t.name),
        messageCount: opts.messages.length,
      });
      const events = scripts[callIndex++] || [];
      for (const evt of events) yield evt;
    },
    async generate() {
      return "";
    },
    async embed() {
      return [];
    },
  };
}

test("runAgent(definition): filters tools to only allowedTools", async () => {
  const analyzer = getAgent("analyzer");
  const stub = makeStubProvider([
    // First turn: agent emits text then stops (no tool calls)
    [
      { type: "text", text: "done" },
      { type: "usage", inputTokens: 10, outputTokens: 2 },
    ],
  ]);
  _registerProviderForTests("gemini", stub);

  await runAgent("inspect the project", {
    definition: analyzer,
    onText: () => {},
  });

  assert.equal(stub.capturedCalls.length, 1);
  const call = stub.capturedCalls[0];

  // Only read-only tools should be visible.
  assert.deepEqual(call.toolNames.sort(), ["get_file_info", "grep_search", "list_dir", "read_file"]);
  // Write / delete / shell tools MUST be absent.
  for (const forbidden of ["write_file", "edit_file", "delete_file", "run_command", "batch_edit", "create_dir"]) {
    assert.ok(!call.toolNames.includes(forbidden), `${forbidden} must not be exposed to analyzer`);
  }
});

test("runAgent(definition): systemPromptOverride replaces default prompt", async () => {
  const analyzer = getAgent("analyzer");
  const stub = makeStubProvider([
    [{ type: "text", text: "ok" }, { type: "usage", inputTokens: 1, outputTokens: 1 }],
  ]);
  _registerProviderForTests("gemini", stub);

  await runAgent("audit", { definition: analyzer, onText: () => {} });

  const prompt = stub.capturedCalls[0].systemInstruction;
  assert.ok(prompt.includes("read-only"), "analyzer prompt must mention read-only mode");
  assert.ok(!prompt.includes("Diagnose before executing"), "senior prompt phrases must NOT leak in");
});

test("runAgent(definition): model override is honored", async () => {
  const stub = makeStubProvider([
    [{ type: "text", text: "ok" }, { type: "usage", inputTokens: 1, outputTokens: 1 }],
  ]);
  _registerProviderForTests("gemini", stub);

  await runAgent("hi", {
    definition: { name: "x", description: "", model: "my-custom-model", skipPlanner: true, skipRag: true },
    onText: () => {},
  });

  assert.equal(stub.capturedCalls[0].model, "my-custom-model");
});

test("runAgent without definition uses default (all built-in tools)", async () => {
  const stub = makeStubProvider([
    [{ type: "text", text: "ok" }, { type: "usage", inputTokens: 1, outputTokens: 1 }],
  ]);
  _registerProviderForTests("gemini", stub);

  await runAgent("hi", { onText: () => {} });

  const toolNames = stub.capturedCalls[0].toolNames;
  assert.ok(toolNames.includes("write_file"), "default agent has full write access");
  assert.ok(toolNames.includes("run_command"), "default agent can run commands");
});

test("runAgent: loop detection does NOT fire on different tool args within window", async () => {
  const stub = makeStubProvider([
    // Turn 1: call read_file with path A
    [
      { type: "tool_call", id: "t1", name: "read_file", args: { path: "a.js" } },
      { type: "usage", inputTokens: 1, outputTokens: 1 },
    ],
    // Turn 2: call read_file with path B (different args → not a dupe)
    [
      { type: "tool_call", id: "t2", name: "read_file", args: { path: "b.js" } },
      { type: "usage", inputTokens: 1, outputTokens: 1 },
    ],
    // Turn 3: different file again
    [
      { type: "tool_call", id: "t3", name: "read_file", args: { path: "c.js" } },
      { type: "usage", inputTokens: 1, outputTokens: 1 },
    ],
    // Turn 4: finish
    [
      { type: "text", text: "done" },
      { type: "usage", inputTokens: 1, outputTokens: 1 },
    ],
  ]);
  _registerProviderForTests("gemini", stub);

  const result = await runAgent("read these", {
    definition: { name: "x", description: "", allowedTools: ["read_file"], skipPlanner: true, skipRag: true, maxIterations: 10 },
    onText: () => {},
  });

  // Loop detector should NOT have kicked in — 4 turns executed.
  assert.equal(stub.capturedCalls.length, 4);
  assert.ok(!result.includes("Loop detected"), "must not trigger on different args");
});

test("runAgent: loop detection DOES fire on identical repeated calls", async () => {
  const sameCall = { type: "tool_call", id: "x", name: "read_file", args: { path: "same.js" } };
  const stub = makeStubProvider([
    [sameCall, { type: "usage", inputTokens: 1, outputTokens: 1 }],
    [sameCall, { type: "usage", inputTokens: 1, outputTokens: 1 }],
    [sameCall, { type: "usage", inputTokens: 1, outputTokens: 1 }],
    // After detection, agent is expected to emit a final summary.
    [{ type: "text", text: "giving up" }, { type: "usage", inputTokens: 1, outputTokens: 1 }],
  ]);
  _registerProviderForTests("gemini", stub);

  const result = await runAgent("loop me", {
    definition: { name: "x", description: "", allowedTools: ["read_file"], skipPlanner: true, skipRag: true, maxIterations: 10 },
    onText: () => {},
  });

  assert.ok(result.includes("Loop detected"), "must trigger after 3 identical calls");
});

test("runAgent: persists memory to disk after run completes", async () => {
  const stub = makeStubProvider([
    [{ type: "text", text: "hello world" }, { type: "usage", inputTokens: 5, outputTokens: 2 }],
  ]);
  _registerProviderForTests("gemini", stub);

  await runAgent("hi", {
    definition: { name: "x", description: "", skipPlanner: true, skipRag: true },
    onText: () => {},
  });

  assert.ok(fs.existsSync(MEMORY_FILE), "memory.json must be written");
  const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  assert.ok(memory.length >= 2, "memory should contain user + assistant messages");
  assert.equal(memory[0].role, "user");
});
