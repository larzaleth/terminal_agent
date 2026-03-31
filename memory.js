import fs from "fs";

const MEMORY_FILE = "memory.json";

export function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
}

export function saveMemory(memory) {
  // Save memory context. For a robust production agent, we would need 
  // careful summarization or pair-aware truncation.
  
  // Limit memory length if it gets absurdly long
  if (memory.length > 50) {
    // Slice off older context. Important: we must ensure we don't break functionCall / functionResponse pairs,
    // so just keep the last 30 turns.
    memory = memory.slice(-30);
  }
  
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// Deprecated since agents.js manages array directly in the ReAct loop
export function addMemory(memory, message) {
  memory.push(message);
  saveMemory(memory);
}
