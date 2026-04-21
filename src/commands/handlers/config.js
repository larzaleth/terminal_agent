import chalk from "chalk";
import { loadConfig } from "../../config/config.js";

export async function configCommand() {
  const config = loadConfig();
  console.log(chalk.cyan("\n⚙️ Current Configuration:"));
  console.log(chalk.white(JSON.stringify(config, null, 2)));
  console.log(chalk.dim("\nEdit agent.config.json to persist changes.\n"));
}
