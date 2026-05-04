#!/usr/bin/env node

import fs from "fs";
import readline from "readline/promises";
import chalk from "chalk";
import { formatDuration, writeFileAtomicSync } from "../src/utils/utils.js";
import { getGlobalEnvPath, loadConfig, loadGlobalEnv } from "../src/config/config.js";
import { getProviderApiKeySpec, upsertEnvValue } from "../src/config/provider-env.js";
import { log } from "../src/utils/logger.js";
import { getPackageVersion } from "../src/utils/version.js";

function showHelp() {
  console.log(`
${chalk.cyan.bold("AI Coding Agent")} ${chalk.dim("v" + getPackageVersion())}

${chalk.bold("Usage:")}
  myagent                       Start interactive CLI mode
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

async function setupApiKey(rl, provider) {
  const globalEnvPath = getGlobalEnvPath();
  const spec = getProviderApiKeySpec(provider);
  if (process.env[spec.envVar]) return;

  console.log(chalk.cyan.bold("\nWelcome to AI Coding Agent!\n"));
  console.log(chalk.dim(`Looks like you haven't set up your ${spec.label} API Key yet.\n`));

  const key = await rl.question(
    chalk.yellow(`Enter ${spec.label} API Key (get it at ${spec.setupUrl}): `)
  );
  if (!key.trim()) {
    console.error(chalk.red("API Key cannot be empty!"));
    process.exit(1);
  }

  const existing = fs.existsSync(globalEnvPath) ? fs.readFileSync(globalEnvPath, "utf-8") : "";
  writeFileAtomicSync(globalEnvPath, upsertEnvValue(existing, spec.envVar, key.trim()));
  try {
    fs.chmodSync(globalEnvPath, 0o600);
  } catch {
    /* best-effort on Windows */
  }
  console.log(chalk.green(`\n${spec.label} API Key saved to ${globalEnvPath}\n`));
  process.env[spec.envVar] = key.trim();
}

function showBanner() {
  const config = loadConfig();
  const provider = getProviderApiKeySpec(config.provider).label;
  const version = getPackageVersion();
  console.log(chalk.cyan.bold(`\nAI Coding Agent v${version} | ${provider}\n`));
  console.log(chalk.dim("Type your request, or use commands:"));
  console.log(chalk.dim("/help  /clear  /index <folder>  /config  exit\n"));
}

async function runInteractiveCli() {
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
    console.log(chalk.dim("\n\nGoodbye!\n"));
    stopWatcher();
    await shutdownMcp().catch(() => {});
    rl.close();
    process.exit(0);
  });

  startWatcher();

  while (true) {
    const input = await rl.question(chalk.green.bold("> "));
    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === "exit" || trimmed === "quit") {
      console.log(chalk.dim("\nGoodbye!\n"));
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
          console.log(chalk.magenta.bold("\nPLAN:"));
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
          console.log(chalk.yellow(`\n${name}(${argSummary})`));
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
      console.log(chalk.dim(`\nDone in ${duration}`));
      console.log(chalk.dim(`${costSummary}\n`));
    } catch (err) {
      log.error(err);
      spinner.stop();
      console.error(chalk.red(`\nError: ${err.message}\n`));
    }
  }
}

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
    console.error(chalk.red(err.message));
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
        process.stderr.write(chalk.blue(`\n  > ${name}`) + chalk.gray(` ${summary}\n`));
      },
      onToolResult: (name) => {
        process.stderr.write(chalk.green(`  ok ${name}\n`));
      },
      onError: (err) => {
        log.error(err);
        process.stderr.write(chalk.red(`\n${err.message}\n`));
      },
    });
  } finally {
    await shutdownMcp().catch(() => {});
  }

  const endCost = globalTracker.getStats(def.model || config.model).cost.total;
  process.stderr.write(
    chalk.dim(`\n${formatDuration(Date.now() - startMs)} | $${(endCost - startCost).toFixed(6)}\n`)
  );
}

async function main() {
  const argv = process.argv;

  if (argv.includes("--help") || argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(getPackageVersion());
    process.exit(0);
  }

  loadGlobalEnv();

  if (argv.includes("--init")) {
    const { runInit } = await import("../src/commands/init.js");
    const force = argv.includes("--force");
    const nonInteractive = argv.includes("--yes") || argv.includes("-y");
    await runInit({ force, nonInteractive });
    process.exit(0);
  }

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

  const config = loadConfig();
  const { envVar } = getProviderApiKeySpec(config.provider);
  if (!process.env[envVar]) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await setupApiKey(rl, config.provider);
    rl.close();
  }

  await runInteractiveCli();
}

main().catch((err) => {
  log.error("Fatal:", err);
  console.error(chalk.red(`\nFatal error: ${err.message}\n`));
  process.exit(1);
});
