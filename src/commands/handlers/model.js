import chalk from "chalk";
import { loadConfig } from "../../config/config.js";
import { inferProvider, clearProviderCache } from "../../llm/providers/index.js";

export async function modelCommand(args) {
  const config = loadConfig();
  const modelId = args[0];
  if (!modelId) {
    console.log(chalk.cyan("\n🤖 Current model:"));
    console.log(chalk.white(`  Provider: ${config.provider || "gemini"}`));
    console.log(chalk.white(`  Model:    ${config.model}`));
    console.log(
      chalk.dim(
        "\nUsage: /model <model-id>   e.g. gpt-4o-mini, claude-3-5-haiku-latest, gemini-2.0-flash\n"
      )
    );
    return;
  }

  // Accept "provider:model" too, e.g. "openai:gpt-4o-mini"
  let provider, model;
  if (modelId.includes(":")) {
    [provider, model] = modelId.split(":", 2);
  } else {
    provider = inferProvider(modelId) || config.provider || "gemini";
    model = modelId;
  }

  config.provider = provider;
  config.model = model;
  clearProviderCache();
  console.log(
    chalk.green(
      `✅ Switched to ${chalk.bold(`${provider}:${model}`)} (session only — edit agent.config.json to persist)\n`
    )
  );
}
