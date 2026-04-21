import chalk from "chalk";
import { globalTracker, viewCostHistory } from "../../llm/cost-tracker.js";
import { loadConfig } from "../../config/config.js";

export async function costCommand(args) {
  const sub = args[0];
  const config = loadConfig();
  if (sub === "report") {
    globalTracker.displayReport(config.model);
  } else if (sub === "history") {
    const limit = parseInt(args[1]) || 10;
    viewCostHistory(limit);
  } else if (sub === "reset") {
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
}
