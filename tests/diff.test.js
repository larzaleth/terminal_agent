import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDiff, diffStats } from "../src/tools/diff.js";

test("diffStats: counts additions and removals", () => {
  const { added, removed } = diffStats("a\nb\nc", "a\nX\nY\nc");
  assert.equal(added, 2);
  assert.equal(removed, 1);
});

test("diffStats: no change", () => {
  const { added, removed } = diffStats("same\ntext", "same\ntext");
  assert.equal(added, 0);
  assert.equal(removed, 0);
});

test("renderDiff: produces output containing + and - markers", () => {
  const out = renderDiff("old line\nshared\n", "new line\nshared\n", "test.txt");
  // strip ANSI for assertion
  const clean = out.replace(/\u001b\[[0-9;]*m/g, "");
  assert.ok(clean.includes("--- test.txt"));
  assert.ok(clean.includes("+++ test.txt"));
  assert.ok(clean.includes("- old line"));
  assert.ok(clean.includes("+ new line"));
});
