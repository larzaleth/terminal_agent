// Pluggable confirmation interface for the plain CLI.

import readline from "readline/promises";
import { renderDiff, diffStats } from "../tools/diff.js";

async function readlineConfirm({ message }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} (Y/n) > `);
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}

async function readlineEditApproval({ filePath, oldContent, newContent }) {
  console.log(renderDiff(oldContent, newContent, filePath));
  const { added, removed } = diffStats(oldContent, newContent);
  console.log(`   Change: +${added} / -${removed} lines`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Apply this change? (Y/n/e=edit manually) > ");
  rl.close();
  const a = answer.trim().toLowerCase();
  if (a === "n") return { decision: "reject" };
  if (a === "e") return { decision: "manual" };
  return { decision: "approve" };
}

let impl = {
  confirm: readlineConfirm,
  editApproval: readlineEditApproval,
};

export function setPrompter(overrides) {
  impl = { ...impl, ...overrides };
}

export function resetPrompter() {
  impl = { confirm: readlineConfirm, editApproval: readlineEditApproval };
}

export function getPrompter() {
  return impl;
}
