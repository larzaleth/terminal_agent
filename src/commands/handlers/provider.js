import chalk from "chalk";
import { loadConfig } from "../../config/config.js";
import { clearProviderCache } from "../../llm/providers/index.js";

export async function providerCommand(args) {
  const config = loadConfig();
  const name = args[0];
  if (!name) {
    console.log(chalk.cyan(`\n🏭 Current provider: ${chalk.bold(config.provider || "gemini")}\n`));
    console.log(chalk.dim("Available: gemini, openai, anthropic\n"));
    return;
  }
  const valid = ["gemini", "openai", "anthropic", "claude"];
  if (!valid.includes(name)) {
    console.log(chalk.red(`❌ Unknown provider '${name}'. Valid: ${valid.join(", ")}\n`));
    return;
  }
  config.provider = name === "claude" ? "anthropic" : name;
  clearProviderCache();
  console.log(
    chalk.green(
      `✅ Provider switched to ${chalk.bold(config.provider)}. Run /model <id> to pick a model for this provider.\n`
    )
  );
}
