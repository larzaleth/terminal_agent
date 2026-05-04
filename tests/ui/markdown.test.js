import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { h } from "../../src/ui/h.js";
import { Markdown } from "../../src/ui/markdown.js";
import { Message } from "../../src/ui/components/Message.js";
import { ToolCallBlock } from "../../src/ui/components/ToolCallBlock.js";

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");

test("Markdown: renders bold, italic and inline code", () => {
  const r = render(
    h(Markdown, { text: "Hello **world**, this is *italic* and `code`." })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("world"));
  assert.ok(out.includes("italic"));
  assert.ok(out.includes("code"));
  // Raw markdown delimiters should not leak through
  assert.ok(!out.includes("**world**"));
  assert.ok(!out.includes("`code`"));
  r.unmount();
});

test("Markdown: renders headings and bullet lists", () => {
  const r = render(
    h(Markdown, {
      text: "# Title\n## Sub\n- first item\n- second item",
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Title"));
  assert.ok(out.includes("Sub"));
  assert.ok(out.includes("• first item"));
  assert.ok(out.includes("• second item"));
  assert.ok(!out.includes("# Title"));
  r.unmount();
});

test("Markdown: renders fenced code blocks", () => {
  const r = render(
    h(Markdown, { text: "Here:\n```js\nconst x = 1;\n```\ndone." })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("const x = 1;"));
  assert.ok(out.includes("js"));
  assert.ok(out.includes("done."));
  assert.ok(!out.includes("```"));
  r.unmount();
});

test("Message: assistant text renders via Markdown (bold stripped)", () => {
  const r = render(
    h(Message, {
      message: {
        role: "assistant",
        blocks: [{ type: "text", text: "This is **important**." }],
      },
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Assistant"));
  assert.ok(out.includes("important"));
  assert.ok(!out.includes("**important**"));
  r.unmount();
});

test("ToolCallBlock: running tool with liveOutput shows the stream", () => {
  const r = render(
    h(ToolCallBlock, {
      tool: "run_command",
      args: { cmd: "npm install" },
      status: "running",
      liveOutput: "added 42 packages",
      expanded: true,
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("RUN_COMMAND"));
  assert.ok(out.includes("added 42 packages"));
  r.unmount();
});

test("ToolCallBlock: running tool without liveOutput falls back to placeholder", () => {
  const r = render(
    h(ToolCallBlock, {
      tool: "run_command",
      args: { cmd: "npm test" },
      status: "running",
      expanded: true,
    })
  );
  const out = stripAnsi(r.lastFrame());
  assert.ok(out.includes("Executing..."));
  r.unmount();
});
