import { test } from "node:test";
import assert from "node:assert/strict";
import { SLASH_COMMANDS, handleSlashCommand } from "../src/commands/slash.js";

// Silence chalk output during tests.
const origLog = console.log;
function muteConsole() {
  console.log = () => {};
}
function restoreConsole() {
  console.log = origLog;
}

test("slash: registry exposes all known commands", () => {
  assert.ok(SLASH_COMMANDS.includes("/help"));
  assert.ok(SLASH_COMMANDS.includes("/clear"));
  assert.ok(SLASH_COMMANDS.includes("/model"));
  assert.ok(SLASH_COMMANDS.includes("/switch"));
  assert.ok(SLASH_COMMANDS.includes("/provider"));
  assert.ok(SLASH_COMMANDS.includes("/save"));
  assert.ok(SLASH_COMMANDS.includes("/mcp"));
  assert.ok(SLASH_COMMANDS.includes("/cache"));
  assert.ok(SLASH_COMMANDS.includes("/cost"));
  assert.ok(SLASH_COMMANDS.includes("/config"));
  assert.ok(SLASH_COMMANDS.includes("/index"));
});

test("slash: unknown command returns false", async () => {
  const result = await handleSlashCommand("/nonexistent");
  assert.equal(result, false);
});

test("slash: /help returns true (handled)", async () => {
  muteConsole();
  try {
    const result = await handleSlashCommand("/help");
    assert.equal(result, true);
  } finally {
    restoreConsole();
  }
});

test("slash: /model without args returns true and prints current model", async () => {
  muteConsole();
  try {
    const result = await handleSlashCommand("/model");
    assert.equal(result, true);
  } finally {
    restoreConsole();
  }
});

test("slash: /switch aliases to /model handler", async () => {
  muteConsole();
  try {
    const result = await handleSlashCommand("/switch");
    assert.equal(result, true);
  } finally {
    restoreConsole();
  }
});

test("slash: /provider with invalid name still returns true (printed error)", async () => {
  muteConsole();
  try {
    const result = await handleSlashCommand("/provider bogus");
    assert.equal(result, true);
  } finally {
    restoreConsole();
  }
});
