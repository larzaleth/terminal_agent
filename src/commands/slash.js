import chalk from "chalk";
import ora from "ora";
import { clearMemory } from "../core/memory.js";
import { buildIndex } from "../rag/semantic.js";
import { loadConfig } from "../config/config.js";
import { getCacheStats, clearCache, cleanExpiredCache } from "../rag/cache.js";
import { globalTracker, viewCostHistory } from "../llm/cost-tracker.js";

// All imports hoisted statically — previous dynamic imports on every /command
// invocation caused first-call latency of 100-300ms.
export async function handleSlashCommand(input) {
  const [cmd, ...args] = input.trim().split(" ");
  const config = loadConfig();

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

    case "/clear":
      clearMemory();
      console.log(chalk.green("✅ Memory cleared.\n"));
      return true;

    case "/index": {
      const folder = args[0];
      if (!folder) {
        console.log(chalk.red("❌ Usage: /index <folder>"));
        return true;
      }
      const spinner = ora("Building semantic index...").start();
      try {
        await buildIndex(folder);
        spinner.succeed(chalk.green("Index built successfully."));
      } catch (err) {
        spinner.fail(chalk.red(`Index failed: ${err.message}`));
      }
      return true;
    }

    case "/config":
      console.log(chalk.cyan("\n⚙️ Current Configuration:"));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      console.log(chalk.dim("\nEdit agent.config.json to customize.\n"));
      return true;

    case "/cache": {
      const subCmd = args[0];
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
