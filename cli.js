#!/usr/bin/env node
import readline from "readline/promises";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import chalk from "chalk";
import ora from "ora";
import { formatDuration } from "./utils.js";

// ===========================
// 🔑 API KEY SETUP
// ===========================
async function setupApiKey() {
  const globalEnvPath = path.join(os.homedir(), ".myagent.env");
  dotenv.config({ path: globalEnvPath });

  if (!process.env.GEMINI_API_KEY) {
    console.log(chalk.cyan.bold("\n👋 Welcome to AI Coding Agent!\n"));
    console.log(chalk.dim("Looks like you haven't set up your Gemini API Key yet.\n"));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const key = await rl.question(chalk.yellow("🔑 Enter Gemini API Key (get it at https://aistudio.google.com): "));
    rl.close();

    if (!key.trim()) {
      console.error(chalk.red("❌ API Key cannot be empty!"));
      process.exit(1);
    }

    fs.writeFileSync(globalEnvPath, `GEMINI_API_KEY=${key.trim()}\n`);
    console.log(chalk.green(`\n✅ API Key saved to ${globalEnvPath}\n`));
    process.env.GEMINI_API_KEY = key.trim();
  }
}

// ===========================
// 🎨 BANNER
// ===========================
function showBanner() {
  console.log(chalk.cyan.bold(`
╔══════════════════════════════════════╗
║     🤖 AI Coding Agent v2.0        ║
║     Powered by Gemini               ║
╚══════════════════════════════════════╝`));
  console.log(chalk.dim("  Type your request, or use commands:"));
  console.log(chalk.dim("  /help  /clear  /index <folder>  /config  exit\n"));
}

// ===========================
// 📋 SLASH COMMANDS
// ===========================
async function handleSlashCommand(input, modules) {
  const [cmd, ...args] = input.trim().split(" ");

  switch (cmd) {
    case "/help":
      console.log(chalk.cyan(`
📋 Available Commands:
  ${chalk.white("/help")}            Show this help
  ${chalk.white("/clear")}           Clear conversation memory
  ${chalk.white("/index <folder>")}  Build semantic index for a folder
  ${chalk.white("/config")}          Show current configuration
  ${chalk.white("/cache")}           Cache management (stats/clear/clean)
  ${chalk.white("/cost")}            Cost tracking (report/history/reset)
  ${chalk.white("exit / quit")}      Exit the agent
`));
      return true;

    case "/clear": {
      const { clearMemory } = await import("./memory.js");
      clearMemory();
      console.log(chalk.green("✅ Memory cleared.\n"));
      return true;
    }

    case "/index": {
      const folder = args[0];
      if (!folder) {
        console.log(chalk.red("❌ Usage: /index <folder>"));
        return true;
      }
      const spinner = ora("Building semantic index...").start();
      try {
        const { buildIndex } = await import("./semantic.js");
        await buildIndex(folder);
        spinner.succeed(chalk.green("Index built successfully."));
      } catch (err) {
        spinner.fail(chalk.red(`Index failed: ${err.message}`));
      }
      return true;
    }

    case "/config": {
      const { config } = await import("./config.js");
      console.log(chalk.cyan("\n⚙️ Current Configuration:"));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      console.log(chalk.dim("\nEdit agent.config.json to customize.\n"));
      return true;
    }

    case "/cache": {
      const subCmd = args[0];
      const { getCacheStats, clearCache, cleanExpiredCache } = await import("./cache.js");

      if (subCmd === "stats") {
        const stats = getCacheStats();
        console.log(chalk.cyan("\n💾 Cache Statistics:"));
        console.log(chalk.white(`  Total Items: ${stats.totalItems}`));
        console.log(chalk.green(`  Valid Items: ${stats.validItems}`));
        console.log(chalk.yellow(`  Expired Items: ${stats.expiredItems}`));
        console.log(chalk.white(`  Total Size: ${stats.totalSizeKB} KB`));
        console.log(chalk.dim(`  TTL: ${stats.ttlHours} hour(s)\n`));
      } else if (subCmd === "clear") {
        clearCache();
      } else if (subCmd === "clean") {
        cleanExpiredCache();
      } else {
        console.log(chalk.yellow(`
💾 Cache Commands:
  ${chalk.white("/cache stats")}   Show cache statistics
  ${chalk.white("/cache clear")}   Clear all cached data
  ${chalk.white("/cache clean")}   Remove expired cache entries
`));
      }
      return true;
    }

    case "/cost": {
      const subCmd = args[0];
      const { globalTracker, viewCostHistory } = await import("./cost-tracker.js");
      const { config } = await import("./config.js");

      if (subCmd === "report") {
        globalTracker.displayReport(config.model);
      } else if (subCmd === "history") {
        const limit = parseInt(args[1]) || 10;
        viewCostHistory(limit);
      } else if (subCmd === "reset") {
        globalTracker.reset();
        console.log(chalk.green("✅ Cost tracker reset.\n"));
      } else {
        console.log(chalk.yellow(`
💰 Cost Tracking Commands:
  ${chalk.white("/cost report")}        Show current session cost report
  ${chalk.white("/cost history [n]")}   Show last n sessions (default: 10)
  ${chalk.white("/cost reset")}         Reset current session tracker
`));
      }
      return true;
    }

    default:
      return false;
  }
}

// ===========================
// 🚀 MAIN
// ===========================
async function main() {
  await setupApiKey();

  const { runAgent } = await import("./agents.js");

  showBanner();

  const prompt = async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const input = await rl.question(chalk.green.bold("🧑 > "));
    rl.close();

    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed === "exit" || trimmed === "quit") {
      console.log(chalk.dim("\n👋 Goodbye!\n"));
      process.exit(0);
    }

    // Handle slash commands
    if (trimmed.startsWith("/")) {
      const handled = await handleSlashCommand(trimmed);
      if (handled) return prompt();
    }

    const spinner = ora({ text: chalk.dim("Thinking..."), spinner: "dots" });
    const startTime = Date.now();

    try {
      await runAgent(trimmed, {
        onPlan: (plan) => {
          spinner.stop();
          console.log(chalk.magenta.bold("\n📋 PLAN:"));
          plan.forEach((p, i) => {
            console.log(chalk.magenta(`  ${i + 1}. ${p.step}`));
          });
          console.log("");
        },

        onThinking: () => {
          spinner.start(chalk.dim("Thinking..."));
        },

        onText: (text) => {
          spinner.stop();
          process.stdout.write(chalk.cyan(text));
        },

        onToolCall: (name, args) => {
          spinner.stop();
          const argSummary = args ? Object.values(args).map((v) => String(v).slice(0, 50)).join(", ") : "";
          console.log(chalk.yellow(`\n🔧 ${name}(${argSummary})`));
        },

        onToolResult: (name, preview) => {
          // Tool handlers already log their own output
        },

        onDone: () => {
          spinner.stop();
        },

        onError: (err) => {
          spinner.fail(chalk.red(`Error: ${err.message}`));
        },
      });

      const duration = formatDuration(Date.now() - startTime);
      
      // Show cost summary
      const { globalTracker } = await import("./cost-tracker.js");
      const { config } = await import("./config.js");
      const costSummary = globalTracker.getQuickSummary(config.model);
      
      console.log(chalk.dim(`\n⏱️  Done in ${duration}`));
      console.log(chalk.dim(`${costSummary}\n`));
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(`\n❌ Error: ${err.message}\n`));
    }

    prompt();
  };

  prompt();
}

main();
