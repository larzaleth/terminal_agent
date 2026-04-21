// Minimal xterm SGR mouse support.
//
// We enable SGR 1006 extended mouse reporting + basic button events (1000),
// and swallow the matching escape sequences before ink sees them as keypresses.
// Only wheel-up/down are translated into scroll callbacks today; click support
// can be layered on later without touching callers.
//
// Sequence shape (button release uses trailing `m`, press uses `M`):
//   ESC [ < BUTTON ; X ; Y M/m
//
// Wheel buttons are 64 (up) / 65 (down). Modifier bits (shift/ctrl/alt) are
// OR'd into the high bits but we mask them away when classifying.

const ENABLE = "\x1b[?1000h\x1b[?1006h";
const DISABLE = "\x1b[?1006l\x1b[?1000l";

// eslint-disable-next-line no-control-regex
const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)[Mm]/g;

let cb = null;
let installed = false;
let originalEmit = null;

export function setMouseCallback(fn) {
  cb = fn;
}

export function clearMouseCallback() {
  cb = null;
}

function classify(btnRaw) {
  const btn = btnRaw & 0b01000011; // strip modifier bits, keep button + wheel flag
  if (btn === 64) return { type: "wheel", direction: "up" };
  if (btn === 65) return { type: "wheel", direction: "down" };
  if (btn === 0) return { type: "click", button: "left" };
  if (btn === 2) return { type: "click", button: "right" };
  return null;
}

function stripMouseSequences(chunk) {
  if (typeof chunk !== "string") return chunk;
  if (!chunk.includes("\x1b[<")) return chunk;

  // Walk the chunk: for each mouse sequence, invoke callback, then remove it
  // from the string so ink doesn't see garbage keystrokes.
  SGR_RE.lastIndex = 0;
  let m;
  const parts = [];
  let lastIdx = 0;
  while ((m = SGR_RE.exec(chunk)) !== null) {
    parts.push(chunk.slice(lastIdx, m.index));
    lastIdx = m.index + m[0].length;
    const event = classify(parseInt(m[1], 10));
    if (event && cb) {
      try {
        cb(event);
      } catch {
        /* swallow bad handlers */
      }
    }
  }
  parts.push(chunk.slice(lastIdx));
  return parts.join("");
}

export function enableMouse(stdin = process.stdin, stdout = process.stdout) {
  if (installed) return;
  if (!stdout.isTTY) return; // no-op when piped
  stdout.write(ENABLE);

  // Intercept stdin `emit('data', …)` to strip mouse bytes before ink sees
  // them. Ink's useInput subscribes via process.stdin.on('data', …) so we
  // patch emit (the shared code path) rather than wrapping every listener.
  originalEmit = stdin.emit.bind(stdin);
  stdin.emit = (event, chunk, ...rest) => {
    if (event === "data") {
      const asString = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      const stripped = stripMouseSequences(asString);
      if (stripped === "") return true; // fully consumed, don't propagate
      if (stripped !== asString) {
        return originalEmit("data", Buffer.isBuffer(chunk) ? Buffer.from(stripped) : stripped, ...rest);
      }
    }
    return originalEmit(event, chunk, ...rest);
  };

  installed = true;
}

export function disableMouse(stdin = process.stdin, stdout = process.stdout) {
  if (!installed) return;
  try {
    stdout.write(DISABLE);
  } catch {
    /* stdout may be closed during shutdown */
  }
  if (originalEmit) {
    stdin.emit = originalEmit;
    originalEmit = null;
  }
  installed = false;
}

// Test-only: exported for unit tests to exercise the parser without stdin.
export function _parseForTest(chunk) {
  const events = [];
  const prev = cb;
  cb = (e) => events.push(e);
  const remaining = stripMouseSequences(chunk);
  cb = prev;
  return { events, remaining };
}
