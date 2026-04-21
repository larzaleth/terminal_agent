import chalk from "chalk";

export async function helpCommand() {
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
  ${chalk.white("/stats")}                Toggle per-turn token/cost chart in sidebar (TUI only)
  ${chalk.white("/mcp")}                  List connected MCP servers and their tools
  ${chalk.white("exit / quit")}           Exit the agent
`));
}
