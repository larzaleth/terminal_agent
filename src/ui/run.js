import { render } from "ink";
import { h } from "./h.js";
import { App } from "./App.js";

export function startTui() {
  // Silence direct console.log from tools so they don't clobber Ink's rendering.
  // Tool activity is surfaced through the UI via ToolCallBlock components.
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  const instance = render(h(App));

  return {
    instance,
    restore() {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}
