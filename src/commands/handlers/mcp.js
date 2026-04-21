import chalk from "chalk";
import ora from "ora";
import { listMcpStatus, initMcp, shutdownMcp } from "../../mcp/client.js";

export async function mcpCommand(args) {
  const sub = args[0];
  if (sub === "stop") {
    await shutdownMcp();
    console.log(chalk.green("🔌 All MCP servers disconnected.\n"));
    return;
  }
  const spinner = ora("Connecting to MCP servers...").start();
  try {
    await initMcp();
    spinner.stop();
  } catch (err) {
    spinner.fail(chalk.red(`MCP init failed: ${err.message}`));
    return;
  }
  const status = listMcpStatus();
  if (status.length === 0) {
    console.log(chalk.yellow(`\n🔌 No MCP servers configured.`));
    console.log(
      chalk.dim(
        `   Add to agent.config.json: "mcpServers": { "name": { "command": "npx", "args": [...] } }\n`
      )
    );
    return;
  }
  console.log(chalk.cyan("\n🔌 MCP Servers:"));
  for (const s of status) {
    console.log(chalk.white(`  ${s.server} (${s.tools.length} tools)`));
    for (const t of s.tools) console.log(chalk.dim(`    • ${t}`));
  }
  console.log("");
}
