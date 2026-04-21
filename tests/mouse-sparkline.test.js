import { test } from "node:test";
import assert from "node:assert/strict";
import { _parseForTest } from "../src/ui/mouse.js";
import { sparkline, formatTokens, formatCost } from "../src/ui/sparkline.js";

test("mouse: wheel-up event is parsed from SGR sequence", () => {
  const { events, remaining } = _parseForTest("\x1b[<64;10;5M");
  assert.equal(remaining, "");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "wheel");
  assert.equal(events[0].direction, "up");
});

test("mouse: wheel-down event is parsed", () => {
  const { events } = _parseForTest("\x1b[<65;10;5M");
  assert.equal(events[0].direction, "down");
});

test("mouse: left-click sequence", () => {
  const { events } = _parseForTest("\x1b[<0;12;6M");
  assert.equal(events[0].type, "click");
  assert.equal(events[0].button, "left");
});

test("mouse: mouse bytes are stripped so ink never sees them", () => {
  const input = "hello\x1b[<64;10;5Mworld\x1b[<65;1;1m!";
  const { events, remaining } = _parseForTest(input);
  assert.equal(remaining, "helloworld!");
  assert.equal(events.length, 2);
});

test("mouse: passthrough for non-mouse data", () => {
  const input = "no escape here";
  const { events, remaining } = _parseForTest(input);
  assert.equal(remaining, input);
  assert.equal(events.length, 0);
});

test("mouse: modifier bits are masked when classifying wheel", () => {
  // Shift+wheel-up = 64 | 4 = 68; we still want wheel-up.
  const { events } = _parseForTest("\x1b[<68;10;5M");
  assert.equal(events[0].direction, "up");
});

test("sparkline: empty array returns empty string", () => {
  assert.equal(sparkline([]), "");
});

test("sparkline: renders bars proportional to max", () => {
  const s = sparkline([0, 5, 10]);
  assert.equal(s.length, 3);
  // First should be lowest bar, last should be highest
  assert.equal(s[0], "▁");
  assert.equal(s[2], "█");
});

test("sparkline: takes only the last `width` values", () => {
  const s = sparkline([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
  assert.equal(s.length, 3);
});

test("sparkline: zero-only series renders a flat baseline", () => {
  const s = sparkline([0, 0, 0]);
  assert.equal(s, "▁▁▁");
});

test("formatTokens: switches units at 1k/1M thresholds", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(500), "500");
  assert.equal(formatTokens(1500), "1.5k");
  assert.equal(formatTokens(2_500_000), "2.5M");
});

test("formatCost: tiny values use exponential", () => {
  assert.equal(formatCost(0), "$0");
  assert.equal(formatCost(0.0001), "$1.0e-4");
  assert.equal(formatCost(0.01), "$0.0100");
});
