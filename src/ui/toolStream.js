// Module-level emitter so tools can forward live stdout chunks to any
// subscriber (e.g. the Ink TUI) without depending on the UI.
let streamCb = null;

export function setToolStreamCallback(cb) {
  streamCb = cb;
}

export function clearToolStreamCallback() {
  streamCb = null;
}

export function hasToolStreamCallback() {
  return typeof streamCb === "function";
}

export function emitToolStream(name, chunk) {
  if (streamCb) streamCb(name, chunk);
}
