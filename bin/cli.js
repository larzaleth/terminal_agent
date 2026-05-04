#!/usr/bin/env node
//
// Skinny entrypoint — only the modules required to PARSE FLAGS are imported
// at top level. Anything heavier (ink, chokidar, MCP, provider SDKs) is
// loaded via dynamic import() inside the specific mode that needs it.
// This keeps `--help`, `--version`, and `--init` cold-start under ~150ms.

import fs from "fs";
import readline from "readline/promises";
import chalk from "chalk";
import { formatDuration, writeFileAtomicSync } from "../src/utils/utils.js";
import { getGlobalEnvPath, loadConfig, loadGlobalEnv } from "../src/config/config.js";
import { getProviderApiKeySpec, upsertEnvValue } from "../src/config/provider-env.js";
import { log } from "../src/utils/logger.js";
import { getPackageVersion } from "../src/utils/version.js";

// ===========================
// 🆘 HELP / VERSION (instant — no heavy imports needed)
// ===========================
function showHelp() {
  console.log(`
${chalk.cyan.bold("AI Coding Agent")} ${chalk.dim("v" + getPackageVersion())}

${chalk.bold("Usage:")}
  myagent                       Start interactive TUI mode
  myagent --no-tui              Start readline mode (CI / non-TTY)
  myagent --agent <name> "..."  Run a specialized one-shot agent
  myagent --init [--yes|--force] Setup wizard (config + .agent + .gitignore)
  myagent --help                Show this help
  myagent --version             Show version

${chalk.bold("Examples:")}
  ${chalk.dim("# Bootstrap workspace")}
  myagent --init --yes

  ${chalk.dim("# Run analyzer agent on a folder")}
  myagent --agent analyzer "audit src/"

${chalk.bold("Docs:")} https://github.com/syarif-lbis/terminal_agent
`);
}

// ===========================
// 🔑 API KEY SETUP (only loaded in modes that need a key)
// ===========================
async function setupApiKey(rl, provider) {
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
// 🎨 BANNER
// ===========================
function showBanner() {
  const config = loadConfig();
  const provider = getProviderApiKeySpec(config.provider).label;
  const version = getPackageVersion();
  console.log(chalk.cyan.bold(`
╔══════════════════════════════════════╗
║     🤖 AI Coding Agent v${version.padEnd(13)}║
║     Powered by ${provider.padEnd(18)}║
╚══════════════════════════════════════╝`));
  console.log(chalk.dim("  Type your request, or use commands:"));
  console.log(chalk.dim("  /help  /clear  /index <folder>  /config  exit\n"));
}

// ===========================
// 🧪 TUI MODE (Ink + React — heavy, only loaded here)
// ===========================
async function runTui() {
  showBanner();
  const [{ startTui }, { startWatcher }] = await Promise.all([
    import("../src/ui/run.js"),
    import("../src/rag/watcher.js"),
  ]);
  startWatcher();
  startTui();
}

// ===========================
// 🔁 READLINE MODE (no Ink — used for CI, --no-tui, non-TTY)
// ===========================
async function runReadline() {
  // Lazy: ora (37ms), runAgent (pulls memory/RAG/MCP/providers), watcher (chokidar)
  const [
    { default: ora },
    { runAgent },
    { handleSlashCommand },
    { globalTracker },
    { shutdownMcp },
    { startWatcher, stopWatcher },
  ] = await Promise.all([
    import("ora"),
    import("../src/core/agents.js"),
    import("../src/commands/slash.js"),
    import("../src/llm/cost-tracker.js"),
    import("../src/mcp/client.js"),
    import("../src/rag/watcher.js"),
  ]);

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
  const [
    { runAgent },
    { getAgent, listAgents },
    { globalTracker },
    { shutdownMcp },
  ] = await Promise.all([
    import("../src/core/agents.js"),
    import("../src/core/agents/index.js"),
    import("../src/llm/cost-tracker.js"),
    import("../src/mcp/client.js"),
  ]);

  let def;
  try {
    def = getAgent(agentName);
  } catch (err) {
    console.error(chalk.red(`❌ ${err.message}`));
    console.error(chalk.dim("Available agents:"));
    for (const a of listAgents()) {
      console.error(chalk.dim(`  ${a.name.padEnd(12)} ${a.description || ""}`));
    }
    process.exit(1);
  }

  const config = loadConfig();
  const providerName = def.provider || config.provider;
  const { envVar } = getProviderApiKeySpec(providerName);
  if (!process.env[envVar]) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await setupApiKey(rl, providerName);
    rl.close();
  }

  const startCost = globalTracker.getStats(def.model || config.model).cost.total;
  const startMs = Date.now();

  try {
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
  } finally {
    await shutdownMcp().catch(() => {});
  }

  const endCost = globalTracker.getStats(def.model || config.model).cost.total;
  process.stderr.write(
    chalk.dim(
      `\n⏱ ${formatDuration(Date.now() - startMs)} │ 💰 $${(endCost - startCost).toFixed(6)}\n`
    )
  );
}

// ===========================
// 🚀 ENTRY — fast-path argv parsing
// ===========================
async function main() {
  const argv = process.argv;

  // ─── Instant info commands (no env load, no config load) ─────────────
  if (argv.includes("--help") || argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(getPackageVersion());
    process.exit(0);
  }

  loadGlobalEnv();

  // ─── Setup wizard: `myagent --init` ─────────────────────────────────
  if (argv.includes("--init")) {
    const { runInit } = await import("../src/commands/init.js");
    const force = argv.includes("--force");
    const nonInteractive = argv.includes("--yes") || argv.includes("-y");
    await runInit({ force, nonInteractive });
    process.exit(0);
  }

  // ─── One-shot agent mode ────────────────────────────────────────────
  const agentFlagIdx = argv.indexOf("--agent");
  if (agentFlagIdx >= 0) {
    const agentName = argv[agentFlagIdx + 1];
    if (!agentName || agentName.startsWith("-")) {
      const { listAgents } = await import("../src/core/agents/index.js");
      console.error(chalk.red("Usage: myagent --agent <name> [request...]"));
      console.error(chalk.dim("Available agents:"));
      for (const a of listAgents()) {
        console.error(chalk.dim(`  ${a.name.padEnd(12)} ${a.description || ""}`));
      }
      process.exit(1);
    }
    const request = argv.slice(agentFlagIdx + 2).join(" ").trim() || ".";
    await runOneShotAgent(agentName, request);
    process.exit(0);
  }

  // ─── Interactive (default) ──────────────────────────────────────────
  const config = loadConfig();
  const { envVar } = getProviderApiKeySpec(config.provider);
  const forceTui = argv.includes("--tui");
  const forceReadline =
    argv.includes("--no-tui") ||
    process.env.MYAGENT_NO_TUI === "1";
  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);

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
