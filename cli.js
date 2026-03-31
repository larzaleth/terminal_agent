#!/usr/bin/env node
import readline from "readline/promises";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";

async function setupApiKey() {
  const globalEnvPath = path.join(os.homedir(), ".myagent.env");
  
  // Load existing .myagent.env if present
  dotenv.config({ path: globalEnvPath });
  
  if (!process.env.GEMINI_API_KEY) {
    console.log("👋 Selamat datang di AI Coding Agent!");
    console.log("Sepertinya Anda belum mengatur Gemini API Key di komputer ini.\n");
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const key = await rl.question("🔑 Masukkan Gemini API Key (dapatkan di https://aistudio.google.com): ");
    rl.close();
    
    if (!key.trim()) {
      console.error("❌ API Key tidak boleh kosong!");
      process.exit(1);
    }
    
    // Save to global file
    fs.writeFileSync(globalEnvPath, `GEMINI_API_KEY=${key.trim()}\n`);
    console.log(`\n✅ API Key berhasil disimpan secara aman di ${globalEnvPath}\n`);
    
    // Set for current process
    process.env.GEMINI_API_KEY = key.trim();
  }
}

async function main() {
  // Ensure Key exists before we even initialize LLM clients
  await setupApiKey();
  
  // Dynamic import AFTER API Key is guaranteed to exist
  const { runAgent } = await import("./agents.js");

  console.log("🤖 Coding Agent Ready!");
  console.log("Ketik 'exit' untuk keluar\n");

  const ask = async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const input = await rl.question("🧑 > ");
    rl.close();
    
    if (input.trim() === "exit" || input.trim() === "quit") {
      process.exit(0);
      return;
    }

    try {
      // Tampilkan indikator proses
      const startTime = Date.now();
      
      const res = await runAgent(input);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n🤖 Selesai dalam ${duration}s`);
    } catch (err) {
      console.error("\n❌ Error CLI:", err.message, "\n");
    }

    // Rekursif ke prompt selanjutnya
    ask();
  };

  ask();
}

main();
