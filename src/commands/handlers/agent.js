import chalk from "chalk";
import { listAgents, getAgent } from "../../core/agents/index.js";
import { runAgent } from "../../core/agents.js";
import { globalTracker } from "../../llm/cost-tracker.js";
import { loadConfig } from "../../config/config.js";

/**
 * `/agent` — list / run specialized agents.
 *
 * Usage:
 *   /agent                     → list available agents
 *   /agent list                → same as above
 *   /agent info <name>         → show full definition
 *   /agent run <name> <req...> → invoke agent inline
 */
export async function agentCommand(args = []) {
  const [sub, ...rest] = args;

  if (!sub || sub === "list") {
    const agents = listAgents();
    if (agents.length === 0) {
      console.log(chalk.yellow("No agents registered."));
      return;
    }
    console.log(chalk.cyan.bold("\n🤖 Registered agents:\n"));
    for (const a of agents) {
      const toolCount = a.allowedTools?.length ?? "all";
      console.log(
        `  ${chalk.green.bold(a.name.padEnd(12))} ${chalk.dim(`(tools: ${toolCount})`)}  ${a.description || ""}`
      );
    }
    console.log(chalk.dim("\nRun: /agent run <name> <your request>\n"));
    return;
  }

  if (sub === "info") {
    const name = rest[0];
    if (!name) {
      console.log(chalk.red("Usage: /agent info <name>"));
      return;
    }
    const def = getAgent(name);
    console.log(chalk.cyan.bold(`\n🤖 ${def.name}\n`));
    console.log(`  ${chalk.dim("description:")}     ${def.description || "(none)"}`);
    console.log(`  ${chalk.dim("allowedTools:")}    ${def.allowedTools?.join(", ") || "all"}`);
    console.log(`  ${chalk.dim("disableMcp:")}      ${def.disableMcp ? "yes" : "no"}`);
    console.log(`  ${chalk.dim("model:")}           ${def.model || "(inherit config)"}`);
    console.log(`  ${chalk.dim("provider:")}        ${def.provider || "(inherit config)"}`);
    console.log(`  ${chalk.dim("maxIterations:")}   ${def.maxIterations || "(inherit config)"}`);
    console.log(`  ${chalk.dim("skipPlanner:")}     ${def.skipPlanner ? "yes" : "no"}`);
    console.log(`  ${chalk.dim("skipRag:")}         ${def.skipRag ? "yes" : "no"}`);
    if (def.systemPromptOverride) {
      const preview = def.systemPromptOverride.slice(0, 200).replace(/\n/g, " ");
      console.log(`  ${chalk.dim("systemPrompt:")}    ${preview}${def.systemPromptOverride.length > 200 ? "…" : ""}`);
    }
    console.log();
    return;
  }

  if (sub === "run") {
    const name = rest[0];
    const request = rest.slice(1).join(" ").trim();
    if (!name || !request) {
      console.log(chalk.red("Usage: /agent run <name> <your request>"));
      return;
    }
    const def = getAgent(name);
    console.log(chalk.cyan.bold(`\n🤖 Invoking '${def.name}' agent...\n`));

    const cfg = loadConfig();
    const startCost = globalTracker.getStats(def.model || cfg.model).cost.total;
    const start = Date.now();

    await runAgent(request, {
      definition: def,
      onText: (t) => process.stdout.write(t),
      onToolCall: (n, a) => process.stdout.write(chalk.blue(`\n  ⟳ ${n} `) + chalk.dim(JSON.stringify(a).slice(0, 80)) + "\n"),
      onToolResult: (n, p) => process.stdout.write(chalk.green(`\n  ✓ ${n}`) + chalk.dim(` ${(p || "").split("\n")[0].slice(0, 80)}\n`)),
      onError: (err) => console.error(chalk.red(`\n❌ ${err.message}`)),
    });

    const endCost = globalTracker.getStats(def.model || cfg.model).cost.total;
    const durationMs = Date.now() - start;
    console.log();
    console.log(chalk.dim(
      `⏱ ${(durationMs / 1000).toFixed(1)}s │ 💰 $${(endCost - startCost).toFixed(6)}\n`
    ));
    return;
  }

  console.log(chalk.red(`Unknown subcommand: ${sub}. Try: /agent list | info <n> | run <n> <req>`));
}
