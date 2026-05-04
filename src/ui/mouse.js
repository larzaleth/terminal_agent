// SGR mouse event parser + enable/disable helpers for TTY.
//
// SGR sequences look like: `\x1b[<B;X;Ym` or `\x1b[<B;X;YM`
//   B = button code (0=left, 1=middle, 2=right, 64=wheel-up, 65=wheel-down,
//       plus modifier bits: 4=shift, 8=meta, 16=ctrl, 32=motion)
//   X, Y = 1-based cell coordinates
//   uppercase `M` = press / wheel, lowercase `m` = release
//
// The parser consumes bytes from an arbitrary buffer and yields a list
// of structured events while returning the remaining (non-mouse) bytes so
// downstream consumers (Ink) only see normal keystrokes.

const SGR_PREFIX = "\x1b[<";
// Matches `B;X;Y` followed by `M` (press/wheel) or `m` (release).
const SGR_RE = /^(\d+);(\d+);(\d+)([Mm])/;

const MOD_SHIFT = 4;
const MOD_META = 8;
const MOD_CTRL = 16;
const MOD_MOTION = 32;
const WHEEL_BASE = 64;

function buttonName(code) {
  // Strip modifier bits before matching.
  const base = code & ~(MOD_SHIFT | MOD_META | MOD_CTRL | MOD_MOTION);
  if (base === 0) return "left";
  if (base === 1) return "middle";
  if (base === 2) return "right";
  return null;
}

/**
 * @param {number} code
 * @param {string} terminator "M" | "m"
 * @param {number} x
 * @param {number} y
 */
function decodeEvent(code, terminator, x, y) {
  const isWheel = (code & WHEEL_BASE) === WHEEL_BASE;
  if (isWheel) {
    // Wheel: bit 0 distinguishes up (0) from down (1) after masking modifiers.
    const wheelCode = code & ~(MOD_SHIFT | MOD_META | MOD_CTRL);
    return {
      type: "wheel",
      direction: wheelCode === WHEEL_BASE ? "up" : "down",
      x,
      y,
    };
  }

  const isMotion = (code & MOD_MOTION) === MOD_MOTION;
  if (isMotion) {
    return {
      type: "drag",
      button: buttonName(code) || "left",
      x,
      y,
    };
  }

  return {
    type: "click",
    button: buttonName(code) || "left",
    press: terminator === "M",
    x,
    y,
  };
}

/**
 * Consume a chunk of bytes, extract any SGR mouse sequences, and return
 * the remaining bytes (everything else, in order) plus a list of events.
 *
 * @param {string} chunk
 * @returns {{ events: object[], remaining: string }}
 */
export function _parseForTest(chunk) {
  if (!chunk) return { events: [], remaining: "" };

  const events = [];
  let remaining = "";
  let i = 0;

  while (i < chunk.length) {
    const rest = chunk.slice(i);
    if (rest.startsWith(SGR_PREFIX)) {
      const match = rest.slice(SGR_PREFIX.length).match(SGR_RE);
      if (match) {
        const [full, codeStr, xStr, yStr, term] = match;
        const evt = decodeEvent(Number(codeStr), term, Number(xStr), Number(yStr));
        if (evt) events.push(evt);
        i += SGR_PREFIX.length + full.length;
        continue;
      }
    }
    remaining += chunk[i];
    i++;
  }

  return { events, remaining };
}

// ────────────────────────────────────────────────────────────────────
// enable/disable: monkey-patch stdin.read AND stdin.emit so SGR bytes
// are stripped before Ink sees them, and so mouse events are delivered
// to a registered callback.
// ────────────────────────────────────────────────────────────────────

let callback = null;
const patched = new WeakMap(); // stdin → { origRead, origEmit }

export function setMouseCallback(cb) {
  callback = typeof cb === "function" ? cb : null;
}

export function clearMouseCallback() {
  callback = null;
}

function fireEvents(events) {
  if (!callback || events.length === 0) return;
  for (const evt of events) {
    try {
      callback(evt);
    } catch {
      /* swallow — never let a callback crash the terminal */
    }
  }
}

export function enableMouse(stdin = process.stdin, stdout = process.stdout) {
  if (!stdin || patched.has(stdin)) return;

  // Turn on mouse reporting in the terminal (best-effort; silent on pipes).
  if (stdout && stdout.isTTY && typeof stdout.write === "function") {
    // 1000: normal click, 1002: button-motion, 1006: SGR encoding.
    stdout.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
  }

  const origRead = stdin.read;
  const origEmit = stdin.emit;
  patched.set(stdin, { origRead, origEmit });

  if (origRead) {
    stdin.read = function patchedRead(size) {
      const chunk = origRead.call(stdin, size);
      if (chunk == null) return chunk;
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const { events, remaining } = _parseForTest(str);
      fireEvents(events);
      return remaining;
    };
  }

  if (origEmit) {
    stdin.emit = function patchedEmit(event, ...rest) {
      if (event === "data" && rest.length > 0) {
        const data = rest[0];
        const str = typeof data === "string" ? data : (data && data.toString ? data.toString("utf8") : "");
        const { events, remaining } = _parseForTest(str);
        fireEvents(events);
        if (!remaining) return false;
        return origEmit.call(stdin, event, remaining, ...rest.slice(1));
      }
      return origEmit.call(stdin, event, ...rest);
    };
  }
}

export function disableMouse(stdin = process.stdin, stdout = process.stdout) {
  if (!stdin || !patched.has(stdin)) return;
  const { origRead, origEmit } = patched.get(stdin);
  if (origRead) stdin.read = origRead;
  if (origEmit) stdin.emit = origEmit;
  patched.delete(stdin);

  if (stdout && stdout.isTTY && typeof stdout.write === "function") {
    stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
  }
}
