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

test("mouse: motion with left button held is reported as drag", () => {
  // Button 0 + motion bit (32) = 32.
  const { events } = _parseForTest("\x1b[<32;15;8M");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "drag");
  assert.equal(events[0].button, "left");
  assert.equal(events[0].x, 15);
  assert.equal(events[0].y, 8);
});

test("mouse: press + drag + release sequence fires in order", () => {
  const { events } = _parseForTest(
    "\x1b[<0;5;5M" + // press at (5,5)
    "\x1b[<32;5;7M" + // drag to (5,7)
    "\x1b[<32;5;10M" + // drag to (5,10)
    "\x1b[<0;5;10m"   // release (lowercase m = release)
  );
  assert.equal(events.length, 4);
  assert.equal(events[0].type, "click");
  assert.equal(events[0].press, true);
  assert.equal(events[1].type, "drag");
  assert.equal(events[2].type, "drag");
  assert.equal(events[3].type, "click");
  assert.equal(events[3].press, false);
});

test("mouse: enable/disable monkey-patches stdin.read AND stdin.emit", async () => {
  const { EventEmitter } = await import("node:events");
  const { enableMouse, disableMouse } = await import("../src/ui/mouse.js");

  const fakeStdin = Object.assign(new EventEmitter(), {
    buffer: "hi\x1b[<64;10;5Mworld",
    read(_size) {
      const b = this.buffer;
      this.buffer = "";
      return b || null;
    },
  });
  const fakeStdout = { isTTY: true, write: () => {} };

  const origRead = fakeStdin.read;
  const origEmit = fakeStdin.emit;
  enableMouse(fakeStdin, fakeStdout);

  // read() should now strip the mouse bytes out
  const chunk = fakeStdin.read();
  assert.equal(chunk, "hiworld");
  assert.notEqual(fakeStdin.read, origRead);
  assert.notEqual(fakeStdin.emit, origEmit);

  disableMouse(fakeStdin, fakeStdout);
  assert.equal(fakeStdin.read, origRead);
  assert.equal(fakeStdin.emit, origEmit);
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
