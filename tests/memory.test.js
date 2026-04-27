import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadMemory, saveMemory, clearMemory, compressMemoryIfNeeded } from "../src/core/memory.js";
import { MEMORY_FILE } from "../src/config/constants.js";

test("Memory System", async (t) => {
  // Setup
  if (fs.existsSync(MEMORY_FILE)) {
    fs.renameSync(MEMORY_FILE, `${MEMORY_FILE}.bak`);
  }

  await t.test("clearMemory should empty the memory file", () => {
    clearMemory();
    const content = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
    assert.deepEqual(content, []);
  });

  await t.test("saveMemory and loadMemory should persist state", async () => {
    const memory = [{ role: "user", blocks: [{ type: "text", text: "hello" }] }];
    await saveMemory(memory);
    const loaded = loadMemory();
    assert.deepEqual(loaded, memory);
  });

  await t.test("compressMemoryIfNeeded should summarize long history", async () => {
    // Create a very long memory
    const longText = "a".repeat(60000); // Exceeds MAX_MEMORY_TOKENS (50k tokens ≈ 200k chars, wait, 50k tokens = 200k chars)
    // Actually 50k tokens is ~200k chars. Let's make it 250k chars.
    const veryLongText = "a".repeat(250000);
    
    const memory = [
      { role: "user", blocks: [{ type: "text", text: "step 1" }] },
      { role: "assistant", blocks: [{ type: "text", text: "doing step 1" }] },
      { role: "user", blocks: [{ type: "text", text: veryLongText }] },
      { role: "assistant", blocks: [{ type: "text", text: "that was a lot of text" }] },
    ];

    // This should trigger summarization
    const compressed = await compressMemoryIfNeeded(memory);
    
    // Check that it's compressed or context-cleared
    const firstMsgText = compressed[0].blocks[0].text;
    const isCompressed = compressed.length < memory.length || 
                        firstMsgText.includes("SUMMARY") || 
                        firstMsgText.includes("CONTEXT");
    assert.ok(isCompressed, `Expected memory to be compressed or context-cleared, but got ${compressed.length} messages. First message: ${firstMsgText}`);
  });

  // Cleanup
  if (fs.existsSync(`${MEMORY_FILE}.bak`)) {
    fs.renameSync(`${MEMORY_FILE}.bak`, MEMORY_FILE);
  } else {
    fs.unlinkSync(MEMORY_FILE);
  }
});
