#!/usr/bin/env node
import readline from "readline/promises";
import fs from "fs";
import chalk from "chalk";
import ora from "ora";
import { formatDuration, writeFileAtomicSync } from "../src/utils/utils.js";
import { getGlobalEnvPath, loadConfig, loadGlobalEnv } from "../src/config/config.js";
import { getProviderApiKeySpec, upsertEnvValue } from "../src/config/provider-env.js";
import { handleSlashCommand } from "../src/commands/slash.js";
import { runAgent } from "../src/core/agents.js";
import { getAgent, listAgents } from "../src/core/agents/index.js";
import { globalTracker } from "../src/llm/cost-tracker.js";
import { shutdownMcp } from "../src/mcp/client.js";
import { startWatcher, stopWatcher } from "../src/rag/watcher.js";
import { log } from "../src/utils/logger.js";

// ===========================
// 🔑 API KEY SETUP
// ===========================
async function setupApiKey(rl, provider = loadConfig().provider) {
  const globalEnvPath = getGlobalEnvPath();
  const spec = getProviderApiKeySpec(provider);
  if (process.env[spec.envVar]) return;

  console.log(chalk.cyan.bold("\n👋 Welcome to AI Coding Agent!\n"));
  console.log(chalk.dim(`Looks like you haven't set up your ${spec.label} API Key yet.\n`));

  const key = await rl.question(
    chalk.yellow(`🔑 Enter ${spec.label} API Key (get it at ${spec.setupUrl}): `)
  );
  if (!key.trim()) {
    console.error(chalk.red("❌ API Key cannot be empty!"));
    process.exit(1);
  }

  const existing = fs.existsSync(globalEnvPath) ? fs.readFileSync(globalEnvPath, "utf-8") : "";
  writeFileAtomicSync(globalEnvPath, upsertEnvValue(existing, spec.envVar, key.trim()));
  try {
    fs.chmodSync(globalEnvPath, 0o600);
  } catch {
    /* best-effort on Windows */
  }
  console.log(chalk.green(`\n✅ ${spec.label} API Key saved to ${globalEnvPath}\n`));
  process.env[spec.envVar] = key.trim();
}

// ===========================
// 🎨 BANNER (readline mode only)
// ===========================
function showBanner() {
  const config = loadConfig();
  const provider = getProviderApiKeySpec(config.provider).label;
  console.log(chalk.cyan.bold(`
╔══════════════════════════════════════╗
║     🤖 AI Coding Agent v2.5.1      ║
║     Powered by ${provider.padEnd(18)}║
╚══════════════════════════════════════╝`));
  console.log(chalk.dim("  Type your request, or use commands:"));
  console.log(chalk.dim("  /help  /clear  /index <folder>  /config  exit\n"));
}

// ===========================
// 🧪 TUI MODE (Pure CLI — no Ink)
// ===========================
async function runTui() {
  showBanner();
  const { startTui } = await import("../src/ui/run.js");
  startWatcher();
  startTui();
  // startTui now manages its own event loop and process.exit
}

// ===========================
// 🔁 READLINE MODE (fallback for non-TTY, CI, --no-tui)
// ===========================
async function runReadline() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await setupApiKey(rl, loadConfig().provider);
  showBanner();

  process.on("SIGINT", async () => {
    console.log(chalk.dim("\n\n👋 Goodbye!\n"));
    stopWatcher();
    await shutdownMcp().catch(() => {});
    rl.close();
    process.exit(0);
  });

  startWatcher();

  while (true) {
    const input = await rl.question(chalk.green.bold("🧑 > "));
    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === "exit" || trimmed === "quit") {
      console.log(chalk.dim("\n👋 Goodbye!\n"));
      stopWatcher();
      await shutdownMcp().catch(() => {});
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
        onToolResult: () => {},
        onDone: () => spinner.stop(),
        onError: (err) => {
          log.error(err);
          spinner.fail(chalk.red(`Error: ${err.message}`));
        },
      });

      const duration = formatDuration(Date.now() - startTime);
      const config = loadConfig();
      const costSummary = globalTracker.getQuickSummary(config.model);
      console.log(chalk.dim(`\n⏱️  Done in ${duration}`));
      console.log(chalk.dim(`${costSummary}\n`));
    } catch (err) {
      log.error(err);
      spinner.stop();
      console.error(chalk.red(`\n❌ Error: ${err.message}\n`));
    }
  }
}

// ===========================
// 🤖 ONE-SHOT AGENT MODE (--agent <name> "request...")
// ===========================
async function runOneShotAgent(agentName, request) {
  const def = getAgent(agentName);
  const startCost = globalTracker.getStats(def.model || loadConfig().model).cost.total;
  const startMs = Date.now();

  await runAgent(request, {
    definition: def,
    onPlan: () => {},
    onThinking: () => {},
    onText: (t) => process.stdout.write(t),
    onToolCall: (name, args) => {
      const summary = Object.entries(args || {})
        .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
        .join(", ");
      process.stderr.write(chalk.blue(`\n  ⟳ ${name}`) + chalk.gray(` ${summary}\n`));
    },
    onToolResult: (name) => {
      process.stderr.write(chalk.green(`  ✓ ${name}\n`));
    },
    onError: (err) => {
      log.error(err);
      process.stderr.write(chalk.red(`\n❌ ${err.message}\n`));
    },
  });

  const endCost = globalTracker.getStats(def.model || loadConfig().model).cost.total;
  process.stderr.write(
    chalk.dim(
      `\n⏱ ${formatDuration(Date.now() - startMs)} │ 💰 $${(endCost - startCost).toFixed(6)}\n`
    )
  );
}

// ===========================
// 🚀 ENTRY — Hybrid TUI / Readline / One-shot
// ===========================
async function main() {
  loadGlobalEnv();
  const config = loadConfig();

  // One-shot agent mode: `myagent --agent analyzer "audit src/"`
  const agentFlagIdx = process.argv.indexOf("--agent");
  if (agentFlagIdx >= 0) {
    // Side-effect import to ensure registry is populated.
    await import("../src/core/agents/index.js");
    const agentName = process.argv[agentFlagIdx + 1];
    if (!agentName || agentName.startsWith("-")) {
      console.error(chalk.red("Usage: myagent --agent <name> [request...]"));
      console.error(chalk.dim("Available agents:"));
      for (const a of listAgents()) {
        console.error(chalk.dim(`  ${a.name.padEnd(12)} ${a.description || ""}`));
      }
      process.exit(1);
    }
    const request = process.argv.slice(agentFlagIdx + 2).join(" ").trim() || ".";

    // Need provider key
    let def;
    try {
      def = getAgent(agentName);
    } catch (err) {
      console.error(chalk.red(`❌ ${err.message}`));
      process.exit(1);
    }
    const providerName = def.provider || config.provider;
    const { envVar } = getProviderApiKeySpec(providerName);
    if (!process.env[envVar]) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await setupApiKey(rl, providerName);
      rl.close();
    }

    try {
      await runOneShotAgent(agentName, request);
    } finally {
      await shutdownMcp().catch(() => {});
    }
    process.exit(0);
  }

  const { envVar } = getProviderApiKeySpec(config.provider);
  const forceTui = process.argv.includes("--tui");
  const forceReadline =
    process.argv.includes("--no-tui") ||
    process.env.MYAGENT_NO_TUI === "1";
  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // Need a key before anything else — use a tiny readline just for that.
  if (!process.env[envVar]) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await setupApiKey(rl, config.provider);
    rl.close();
  }

  const useTui = forceTui || (isTty && !forceReadline);
  if (useTui) {
    await runTui();
  } else {
    await runReadline();
  }
}

main().catch((err) => {
  log.error("Fatal:", err);
  console.error(chalk.red(`\n❌ Fatal error: ${err.message}\n`));
  process.exit(1);
});
