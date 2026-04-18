#!/usr/bin/env node
import readline from "readline/promises";
import fs from "fs";
import chalk from "chalk";
import ora from "ora";
import { formatDuration } from "../src/utils/utils.js";
import { getGlobalEnvPath, loadConfig } from "../src/config/config.js";
import { handleSlashCommand } from "../src/commands/slash.js";
import { runAgent } from "../src/core/agents.js";
import { globalTracker } from "../src/llm/cost-tracker.js";

// ===========================
// 🔑 API KEY SETUP (saved with restrictive permissions)
// ===========================
async function setupApiKey(rl) {
  const globalEnvPath = getGlobalEnvPath();
  // dotenv is already loaded via src/llm/llm.js → src/config/config.js chain.
  if (process.env.GEMINI_API_KEY) return;

  console.log(chalk.cyan.bold("\n👋 Welcome to AI Coding Agent!\n"));
  console.log(chalk.dim("Looks like you haven't set up your Gemini API Key yet.\n"));

  const key = await rl.question(chalk.yellow("🔑 Enter Gemini API Key (get it at https://aistudio.google.com): "));
  if (!key.trim()) {
    console.error(chalk.red("❌ API Key cannot be empty!"));
    process.exit(1);
  }

  // 0600 — owner read/write only, prevents other users on the machine from reading the key.
  fs.writeFileSync(globalEnvPath, `GEMINI_API_KEY=${key.trim()}\n`, { mode: 0o600 });
  console.log(chalk.green(`\n✅ API Key saved to ${globalEnvPath}\n`));
  process.env.GEMINI_API_KEY = key.trim();
}

// ===========================
// 🎨 BANNER
// ===========================
function showBanner() {
  console.log(chalk.cyan.bold(`
╔══════════════════════════════════════╗
║     🤖 AI Coding Agent v2.1        ║
║     Powered by Gemini               ║
╚══════════════════════════════════════╝`));
  console.log(chalk.dim("  Type your request, or use commands:"));
  console.log(chalk.dim("  /help  /clear  /index <folder>  /config  exit\n"));
}

// ===========================
// 🚀 MAIN
// ===========================
async function main() {
  // Single readline for the whole session — avoids repeated create/close overhead.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await setupApiKey(rl);
  showBanner();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log(chalk.dim("\n\n👋 Goodbye!\n"));
    rl.close();
    process.exit(0);
  });

  // Main REPL loop
  while (true) {
    const input = await rl.question(chalk.green.bold("🧑 > "));
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed === "exit" || trimmed === "quit") {
      console.log(chalk.dim("\n👋 Goodbye!\n"));
      rl.close();
      process.exit(0);
    }

    if (trimmed.startsWith("/")) {
      const handled = await handleSlashCommand(trimmed);
      if (handled) continue;
    }

    const spinner = ora({ text: chalk.dim("Thinking..."), spinner: "dots" });
    const startTime = Date.now();

    try {
      await runAgent(trimmed, {
        onPlan: (plan) => {
          spinner.stop();
          console.log(chalk.magenta.bold("\n📋 PLAN:"));
          plan.forEach((p, i) => console.log(chalk.magenta(`  ${i + 1}. ${p.step}`)));
          console.log("");
        },
        onThinking: () => spinner.start(chalk.dim("Thinking...")),
        onText: (text) => {
          spinner.stop();
          process.stdout.write(chalk.cyan(text));
        },
        onToolCall: (name, args) => {
          spinner.stop();
          const argSummary = args ? Object.values(args).map((v) => String(v).slice(0, 50)).join(", ") : "";
          console.log(chalk.yellow(`\n🔧 ${name}(${argSummary})`));
        },
        onToolResult: () => { /* tool handlers already log their own output */ },
        onDone: () => spinner.stop(),
        onError: (err) => spinner.fail(chalk.red(`Error: ${err.message}`)),
      });

      const duration = formatDuration(Date.now() - startTime);
      const config = loadConfig();
      const costSummary = globalTracker.getQuickSummary(config.model);
      console.log(chalk.dim(`\n⏱️  Done in ${duration}`));
      console.log(chalk.dim(`${costSummary}\n`));
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(`\n❌ Error: ${err.message}\n`));
    }
  }
}

main().catch((err) => {
  console.error(chalk.red(`\n❌ Fatal error: ${err.message}\n`));
  process.exit(1);
});
