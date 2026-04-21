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

const ENABLE = "\x1b[?1002h\x1b[?1006h";
const DISABLE = "\x1b[?1006l\x1b[?1002l";

// eslint-disable-next-line no-control-regex
const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)[Mm]/g;

let cb = null;
let installed = false;
let originalEmit = null;
let originalRead = null;

export function setMouseCallback(fn) {
  cb = fn;
}

export function clearMouseCallback() {
  cb = null;
}

function classify(btnRaw, x, y, press) {
  const isMotion = (btnRaw & 32) !== 0; // SGR motion bit
  const btn = btnRaw & 0b01000011; // strip modifier + motion bits, keep button + wheel flag
  if (btn === 64) return { type: "wheel", direction: "up", x, y };
  if (btn === 65) return { type: "wheel", direction: "down", x, y };
  if (btn === 0) {
    if (isMotion) return { type: "drag", button: "left", x, y };
    return { type: "click", button: "left", x, y, press };
  }
  if (btn === 2) {
    if (isMotion) return { type: "drag", button: "right", x, y };
    return { type: "click", button: "right", x, y, press };
  }
  // Release event (btn === 3 in some encodings) — mode 1006 uses lowercase `m`
  // with the original button id, so this branch rarely hits; `press=false`
  // on the click path covers releases.
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
    const terminator = m[0][m[0].length - 1]; // 'M' = press, 'm' = release
    const event = classify(
      parseInt(m[1], 10),
      parseInt(m[2], 10),
      parseInt(m[3], 10),
      terminator === "M"
    );
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

  // Ink v5 consumes stdin via `stdin.on('readable', ...)` + `stdin.read()`,
  // NOT via `.on('data', ...)`. So to strip mouse bytes before ink sees
  // them we must patch BOTH `.read()` (ink's path) and `.emit('data', ...)`
  // (fallback for any other listeners, e.g. readline helpers).
  originalRead = stdin.read.bind(stdin);
  stdin.read = (size) => {
    const chunk = originalRead(size);
    if (chunk === null || chunk === undefined) return chunk;
    const asString = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (!asString.includes("\x1b[<")) return chunk;
    const stripped = stripMouseSequences(asString);
    if (stripped === "") return null; // all mouse noise, pretend empty
    if (stripped === asString) return chunk;
    return Buffer.isBuffer(chunk) ? Buffer.from(stripped, "utf8") : stripped;
  };

  originalEmit = stdin.emit.bind(stdin);
  stdin.emit = (event, chunk, ...rest) => {
    if (event === "data") {
      const asString = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      if (typeof asString === "string" && asString.includes("\x1b[<")) {
        const stripped = stripMouseSequences(asString);
        if (stripped === "") return true;
        if (stripped !== asString) {
          return originalEmit(
            "data",
            Buffer.isBuffer(chunk) ? Buffer.from(stripped, "utf8") : stripped,
            ...rest
          );
        }
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
  if (originalRead) {
    stdin.read = originalRead;
    originalRead = null;
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
