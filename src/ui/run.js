import { render } from "ink";
import { h } from "./h.js";
import { App } from "./App.js";

const ENTER_ALT = "\x1b[?1049h\x1b[H";
const EXIT_ALT = "\x1b[?1049l";

export function startTui() {
  // Silence direct console output from tools/SDKs — Ink owns the screen now.
  // Tool activity surfaces through the UI via ToolCallBlock components.
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  // Alternate screen buffer — TUI takes over, original scrollback preserved
  // and restored on exit (vim/htop/less pattern).
  process.stdout.write(ENTER_ALT);

  const cleanup = () => {
    process.stdout.write(EXIT_ALT);
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  const instance = render(h(App), { exitOnCtrlC: false });
  instance.waitUntilExit().then(cleanup);

  return { instance, cleanup };
}
