// Pluggable prompter interface — abstracts user confirmation away from any
// specific UI. Default implementation uses readline (legacy REPL mode).
// The Ink TUI swaps in its own implementation via `setPrompter()`.

import readline from "readline/promises";

async function readlineConfirm({ message }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} (Y/n) > `);
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}

let impl = {
  confirm: readlineConfirm,
};

export function setPrompter(overrides) {
  impl = { ...impl, ...overrides };
}

export function resetPrompter() {
  impl = { confirm: readlineConfirm };
}

export function getPrompter() {
  return impl;
}
