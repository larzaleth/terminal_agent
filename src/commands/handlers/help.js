import chalk from "chalk";

export async function helpCommand() {
  console.log(chalk.cyan(`
📋 Available Commands:
  ${chalk.white("/help")}                 Show this help
  ${chalk.white("/new")}                  Start a fresh conversation (clears context)
  ${chalk.white("/list")}                 List all saved sessions
  ${chalk.white("/session save <name>")}  Save current context to a named session
  ${chalk.white("/resume <name>")}        Resume a saved session
  ${chalk.white("/index <folder>")}       Build semantic index for a folder
  ${chalk.white("/config")}               Show current configuration
  ${chalk.white("/cost")}                 Cost tracking (report/history/reset)
  ${chalk.white("/model [id]")}           Show or change the active model
  ${chalk.white("/save [file]")}          Export transcript to markdown
  ${chalk.white("/mcp")}                  List connected MCP servers
  ${chalk.white("/yolo [on|off]")}        Toggle full automation (no permission prompts)
  ${chalk.white("exit / quit")}           Exit the agent
`));
}
