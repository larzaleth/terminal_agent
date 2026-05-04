// Clipboard writer using the OSC 52 terminal escape sequence.
//
//   ESC ] 52 ; c ; <base64> ESC \
//
// Modern terminals (iTerm2, Kitty, Alacritty, WezTerm, Ghostty, Windows
// Terminal, recent xterm) honour this as "copy to system clipboard" without
// needing a native binary or a connection back to the host. Works over SSH
// and inside tmux (if `set -g set-clipboard on` is enabled).
//
// If stdout is not a TTY (tests, piping) we return false so callers can
// decide what to fall back to.

const OSC_PREFIX = "\x1b]52;c;";
const OSC_TERMINATOR = "\x1b\\";

// OSC 52 historically had a 100k payload ceiling in xterm. Keep well under.
const MAX_BYTES = 75_000;

export function writeClipboard(text, stdout = process.stdout) {
  if (typeof text !== "string") return false;
  if (!stdout || !stdout.isTTY) return false;

  let payload = text;
  // Truncate oversized selections with a visible marker so the user notices.
  if (Buffer.byteLength(payload, "utf8") > MAX_BYTES) {
    payload = payload.slice(0, MAX_BYTES) + "\n…[truncated]";
  }

  const b64 = Buffer.from(payload, "utf8").toString("base64");
  try {
    stdout.write(OSC_PREFIX + b64 + OSC_TERMINATOR);
    return true;
  } catch {
    return false;
  }
}

// Exported for tests — returns the exact escape sequence that would be sent.
export function buildOsc52(text) {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return OSC_PREFIX + b64 + OSC_TERMINATOR;
}

// ─── Text extraction helpers ─────────────────────────────────────────
// These run over the reducer state and produce plain-text snippets suitable
// for pasting elsewhere (no ANSI, no markdown formatting preserved — just
// the raw author intent).

function blockToText(block) {
  if (!block) return "";
  if (block.type === "text") return block.text || "";
  if (block.type === "plan") {
    return (block.steps || []).map((s, i) => `${i + 1}. ${s.step}`).join("\n");
  }
  if (block.type === "tool_call") {
    const args = block.args ? JSON.stringify(block.args) : "";
    const result = typeof block.result === "string" ? block.result : "";
    const header = `🔧 ${block.tool}(${args})`;
    return result ? `${header}\n${result}` : header;
  }
  return "";
}

function messageToText(msg) {
  if (!msg) return "";
  const role = msg.role || "";
  const header = role ? `## ${role}` : "";
  const body = (msg.blocks || []).map(blockToText).filter(Boolean).join("\n");
  return [header, body].filter(Boolean).join("\n");
}

export function extractLastAssistant(state) {
  if (!state) return "";
  const msgs = state.pending
    ? [...state.finalized, state.pending]
    : state.finalized;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") {
      return (msgs[i].blocks || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("\n")
        .trim();
    }
  }
  return "";
}

export function extractFocusedTool(state) {
  if (!state || !state.pending || state.focusedToolIdx < 0) return "";
  const tools = state.pending.blocks.filter((b) => b.type === "tool_call");
  const t = tools[state.focusedToolIdx];
  if (!t) return "";
  return blockToText(t);
}

export function extractCurrentTurn(state) {
  if (!state) return "";
  const pending = state.pending;
  if (pending) return messageToText(pending);
  // Otherwise return the last finalized assistant message.
  for (let i = state.finalized.length - 1; i >= 0; i--) {
    if (state.finalized[i].role === "assistant") {
      return messageToText(state.finalized[i]);
    }
  }
  return "";
}

export function extractAll(state) {
  if (!state) return "";
  const msgs = state.pending
    ? [...state.finalized, state.pending]
    : state.finalized;
  return msgs.map(messageToText).filter(Boolean).join("\n\n");
}
