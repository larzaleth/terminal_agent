import { test } from "node:test";
import assert from "node:assert/strict";
import { computeToolRegions } from "../../src/ui/components/MessageList.js";
import {
  setToolRegions,
  findToolAt,
  clearToolRegions,
  getToolRegions,
} from "../../src/ui/clickRegistry.js";

test("clickRegistry: set/find/clear round-trip", () => {
  setToolRegions([
    { toolId: "t1", startY: 2, endY: 4 },
    { toolId: "t2", startY: 5, endY: 10 },
  ]);
  assert.equal(findToolAt(3), "t1");
  assert.equal(findToolAt(7), "t2");
  assert.equal(findToolAt(0), null);
  assert.equal(findToolAt(100), null);
  assert.equal(getToolRegions().length, 2);
  clearToolRegions();
  assert.equal(getToolRegions().length, 0);
  assert.equal(findToolAt(3), null);
});

test("computeToolRegions: single collapsed tool block", () => {
  const regions = computeToolRegions(
    [
      {
        id: "m1",
        role: "assistant",
        blocks: [
          { type: "text", text: "hi" },
          { type: "tool_call", id: "tool-a", expanded: false, status: "done" },
        ],
      },
    ],
    false
  );
  assert.equal(regions.length, 1);
  assert.equal(regions[0].toolId, "tool-a");
  assert.equal(regions[0].startY, regions[0].endY); // 1 row for collapsed
});

test("computeToolRegions: multiple tools get non-overlapping ranges", () => {
  const regions = computeToolRegions(
    [
      {
        id: "m1",
        role: "assistant",
        blocks: [
          { type: "tool_call", id: "a", expanded: false, status: "done" },
          { type: "tool_call", id: "b", expanded: false, status: "done" },
          { type: "tool_call", id: "c", expanded: false, status: "done" },
        ],
      },
    ],
    false
  );
  assert.equal(regions.length, 3);
  assert.ok(regions[0].endY < regions[1].startY);
  assert.ok(regions[1].endY < regions[2].startY);
});

test("computeToolRegions: expanded block spans more rows than collapsed", () => {
  const regions = computeToolRegions(
    [
      {
        id: "m1",
        role: "assistant",
        blocks: [
          {
            type: "tool_call",
            id: "big",
            expanded: true,
            status: "done",
            args: { path: "/tmp/x" },
            result: "a\nb\nc\nd\ne",
          },
        ],
      },
    ],
    false
  );
  const span = regions[0].endY - regions[0].startY;
  assert.ok(span > 3, `expected expanded tool to span > 3 rows, got ${span}`);
});

test("computeToolRegions: header offset pushes regions down by 1 row", () => {
  const msg = {
    id: "m1",
    role: "assistant",
    blocks: [{ type: "tool_call", id: "a", expanded: false, status: "done" }],
  };
  const withoutHeader = computeToolRegions([msg], false);
  const withHeader = computeToolRegions([msg], true);
  assert.equal(withHeader[0].startY, withoutHeader[0].startY + 1);
});
