import { test } from "node:test";
import assert from "node:assert/strict";
import { diffStats } from "../src/tools/diff.js";

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
