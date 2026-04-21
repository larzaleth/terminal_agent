import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { h } from "../../src/ui/h.js";
import { Header } from "../../src/ui/components/Header.js";
import { Footer } from "../../src/ui/components/Footer.js";
import { Sidebar } from "../../src/ui/components/Sidebar.js";
import { ToolCallBlock } from "../../src/ui/components/ToolCallBlock.js";
import { Message } from "../../src/ui/components/Message.js";

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");

test("Header: shows provider, model and cost", () => {
  const r = render(
    h(Header, { provider: "gemini", model: "gemini-2.5-flash", cost: 0.00123, iteration: 0 })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("AI Coding Agent"));
  assert.ok(out.includes("gemini"));
  assert.ok(out.includes("gemini-2.5-flash"));
  assert.ok(out.includes("$0.001230"));
  r.unmount();
});

test("Header: shows iteration counter when running", () => {
  const r = render(
    h(Header, { provider: "openai", model: "gpt-4o-mini", cost: 0, iteration: 3, maxIterations: 25 })
  );
  assert.ok(stripAnsi(r.lastFrame()).includes("iter 3/25"));
  r.unmount();
});

test("Footer: idle state shows default hints", () => {
  const r = render(h(Footer, { status: "idle" }));
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Enter"));
  assert.ok(out.includes("send"));
  assert.ok(out.includes("/help"));
  r.unmount();
});

test("Footer: awaiting_edit shows approve/reject/edit", () => {
  const r = render(h(Footer, { status: "awaiting_edit" }));
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("approve"));
  assert.ok(out.includes("reject"));
  assert.ok(out.includes("edit manually"));
  r.unmount();
});

test("Sidebar: displays session info", () => {
  const r = render(
    h(Sidebar, {
      provider: "anthropic",
      model: "claude-3-5-haiku-latest",
      status: "idle",
      cost: 0.0015,
      tokens: 1234,
      cacheHitRate: 45.5,
      recentTools: [
        { name: "read_file", status: "done" },
        { name: "edit_file", status: "done" },
      ],
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("anthropic"));
  assert.ok(out.includes("Recent tools"));
  assert.ok(out.includes("read_file"));
  assert.ok(out.includes("$0.001500"));
  assert.ok(out.includes("45.5%"));
  r.unmount();
});

test("Sidebar: shows per-turn placeholder when no history", () => {
  const r = render(
    h(Sidebar, {
      provider: "gemini",
      model: "gemini-2.5-flash",
      status: "idle",
      cost: 0,
      tokens: 0,
      cacheHitRate: 0,
      turnHistory: [],
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Per-turn stats"));
  assert.ok(out.includes("no turns yet"));
  r.unmount();
});

test("Sidebar: renders sparkline and summary when turnHistory present", () => {
  const r = render(
    h(Sidebar, {
      provider: "gemini",
      model: "gemini-2.5-flash",
      status: "idle",
      cost: 0,
      tokens: 0,
      cacheHitRate: 0,
      turnHistory: [
        { tokens: 100, cost: 0.001, durationMs: 2000, ts: 1 },
        { tokens: 250, cost: 0.003, durationMs: 5000, ts: 2 },
      ],
      statsExpanded: false,
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Per-turn stats"));
  assert.ok(out.includes("tok"));
  assert.ok(out.includes("cost"));
  assert.ok(out.includes("2 turn(s)"));
  r.unmount();
});

test("Sidebar: expanded stats view shows avg + last breakdown", () => {
  const r = render(
    h(Sidebar, {
      provider: "gemini",
      model: "gemini-2.5-flash",
      status: "idle",
      cost: 0,
      tokens: 0,
      cacheHitRate: 0,
      turnHistory: [
        { tokens: 100, cost: 0.001, durationMs: 2000, ts: 1 },
        { tokens: 500, cost: 0.005, durationMs: 4000, ts: 2 },
      ],
      statsExpanded: true,
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Last tok"));
  assert.ok(out.includes("Avg tok"));
  assert.ok(out.includes("Turns"));
  r.unmount();
});

test("ToolCallBlock: collapsed shows only summary", () => {
  const r = render(
    h(ToolCallBlock, {
      tool: "read_file",
      args: { path: "src/utils.js" },
      status: "done",
      result: "1: line\n2: line",
      expanded: false,
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("read_file"));
  assert.ok(out.includes("path=src/utils.js"));
  assert.ok(out.includes("▶"));
  assert.ok(!out.includes("1: line"));
  r.unmount();
});

test("ToolCallBlock: expanded shows args + result", () => {
  const r = render(
    h(ToolCallBlock, {
      tool: "read_file",
      args: { path: "a.js" },
      status: "done",
      result: "contents here",
      expanded: true,
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("▼"));
  assert.ok(out.includes("contents here"));
  assert.ok(out.includes("args:"));
  assert.ok(out.includes("result:"));
  r.unmount();
});

test("Message: user role renders header + text", () => {
  const r = render(
    h(Message, {
      message: {
        role: "user",
        blocks: [{ type: "text", text: "refactor this file" }],
      },
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("You"));
  assert.ok(out.includes("refactor this file"));
  r.unmount();
});

test("Message: assistant with tool_call block", () => {
  const r = render(
    h(Message, {
      message: {
        role: "assistant",
        blocks: [
          { type: "text", text: "Reading the file..." },
          {
            type: "tool_call",
            id: "t1",
            tool: "read_file",
            args: { path: "a.js" },
            status: "running",
          },
        ],
      },
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Assistant"));
  assert.ok(out.includes("Reading the file..."));
  assert.ok(out.includes("read_file"));
  r.unmount();
});
