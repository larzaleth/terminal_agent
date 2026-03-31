#!/usr/bin/env node
import readline from "readline/promises";
import { runAgent } from "./agents.js";

async function main() {
  console.log("🤖 Coding Agent Ready!");
  console.log("Ketik 'exit' untuk keluar\n");

  const ask = async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const input = await rl.question("🧑 > ");
    rl.close();
    
    if (input.trim() === "exit") {
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
