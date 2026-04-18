import chalk from "chalk";
import ora from "ora";
import { clearMemory } from "../core/memory.js";
import { buildIndex } from "../rag/semantic.js";
import { loadConfig } from "../config/config.js";
import { getCacheStats, clearCache, cleanExpiredCache } from "../rag/cache.js";
import { globalTracker, viewCostHistory } from "../llm/cost-tracker.js";
import { exportTranscript } from "../core/transcript.js";
import { inferProvider, clearProviderCache } from "../llm/providers/index.js";
import { listMcpStatus, initMcp, shutdownMcp } from "../mcp/client.js";

export async function handleSlashCommand(input) {
  const [cmd, ...args] = input.trim().split(" ");
  const config = loadConfig();

  switch (cmd) {
    case "/help":
      console.log(chalk.cyan(`
📋 Available Commands:
  ${chalk.white("/help")}                 Show this help
  ${chalk.white("/clear")}                Clear conversation memory
  ${chalk.white("/index <folder>")}       Build semantic index for a folder
  ${chalk.white("/config")}               Show current configuration
  ${chalk.white("/cache")}                Cache management (stats/clear/clean)
  ${chalk.white("/cost")}                 Cost tracking (report/history/reset)
  ${chalk.white("/model [id]")}           Show or change the active model (session only)
  ${chalk.white("/provider [name]")}      Show or switch LLM provider (gemini/openai/anthropic)
  ${chalk.white("/save [file]")}          Export session transcript to markdown
  ${chalk.white("/mcp")}                  List connected MCP servers and their tools
  ${chalk.white("exit / quit")}           Exit the agent
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
      console.log(chalk.dim("\nEdit agent.config.json to persist changes.\n"));
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

    case "/model":
    case "/switch": {
      const modelId = args[0];
      if (!modelId) {
        console.log(chalk.cyan("\n🤖 Current model:"));
        console.log(chalk.white(`  Provider: ${config.provider || "gemini"}`));
        console.log(chalk.white(`  Model:    ${config.model}`));
        console.log(chalk.dim("\nUsage: /model <model-id>   e.g. gpt-4o-mini, claude-3-5-haiku-latest, gemini-2.0-flash\n"));
        return true;
      }

      // Accept "provider:model" too, e.g. "openai:gpt-4o-mini"
      let provider, model;
      if (modelId.includes(":")) {
        [provider, model] = modelId.split(":", 2);
      } else {
        provider = inferProvider(modelId) || config.provider || "gemini";
        model = modelId;
      }

      config.provider = provider;
      config.model = model;
      clearProviderCache();
      console.log(chalk.green(`✅ Switched to ${chalk.bold(`${provider}:${model}`)} (session only — edit agent.config.json to persist)\n`));
      return true;
    }

    case "/provider": {
      const name = args[0];
      if (!name) {
        console.log(chalk.cyan(`\n🏭 Current provider: ${chalk.bold(config.provider || "gemini")}\n`));
        console.log(chalk.dim("Available: gemini, openai, anthropic\n"));
        return true;
      }
      const valid = ["gemini", "openai", "anthropic", "claude"];
      if (!valid.includes(name)) {
        console.log(chalk.red(`❌ Unknown provider '${name}'. Valid: ${valid.join(", ")}\n`));
        return true;
      }
      config.provider = name === "claude" ? "anthropic" : name;
      clearProviderCache();
      console.log(chalk.green(`✅ Provider switched to ${chalk.bold(config.provider)}. Run /model <id> to pick a model for this provider.\n`));
      return true;
    }

    case "/save": {
      const filename = args[0] || `transcript-${Date.now()}.md`;
      try {
        const info = await exportTranscript(filename);
        console.log(chalk.green(`\n✅ Transcript saved: ${info.path}`));
        console.log(chalk.dim(`   ${info.messages} messages, ${(info.bytes / 1024).toFixed(1)} KB\n`));
      } catch (err) {
        console.log(chalk.red(`❌ ${err.message}\n`));
      }
      return true;
    }

    case "/mcp": {
      const sub = args[0];
      if (sub === "stop") {
        await shutdownMcp();
        console.log(chalk.green("🔌 All MCP servers disconnected.\n"));
        return true;
      }
      const spinner = ora("Connecting to MCP servers...").start();
      try {
        await initMcp();
        spinner.stop();
      } catch (err) {
        spinner.fail(chalk.red(`MCP init failed: ${err.message}`));
        return true;
      }
      const status = listMcpStatus();
      if (status.length === 0) {
        console.log(chalk.yellow(`\n🔌 No MCP servers configured.`));
        console.log(chalk.dim(`   Add to agent.config.json: "mcpServers": { "name": { "command": "npx", "args": [...] } }\n`));
        return true;
      }
      console.log(chalk.cyan("\n🔌 MCP Servers:"));
      for (const s of status) {
        console.log(chalk.white(`  ${s.server} (${s.tools.length} tools)`));
        for (const t of s.tools) console.log(chalk.dim(`    • ${t}`));
      }
      console.log("");
      return true;
    }

    default:
      return false;
  }
}
