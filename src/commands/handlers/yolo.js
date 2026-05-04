import fs from "fs/promises";
import chalk from "chalk";
import { loadConfig, findConfigPath } from "../../config/config.js";

export async function yoloCommand(args) {
  const config = loadConfig();

  // `args` is always an array (slash router splits the command).
  const flag = (Array.isArray(args) ? args[0] : args)?.toLowerCase();

  if (flag === "on" || flag === "true" || flag === "1") {
    config.autoApprove = true;
  } else if (flag === "off" || flag === "false" || flag === "0") {
    config.autoApprove = false;
  } else {
    // Toggle when no explicit value is given
    config.autoApprove = !config.autoApprove;
  }
  
  // Persist to agent.config.json
  try {
    const configPath = findConfigPath();
    let currentFileConfig = {};
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      currentFileConfig = JSON.parse(raw);
    } catch {
      // file might not exist, that's fine
    }
    
    currentFileConfig.autoApprove = config.autoApprove;
    await fs.writeFile(configPath, JSON.stringify(currentFileConfig, null, 2));
  } catch (err) {
    console.warn(chalk.dim(`  (Note: Could not persist to agent.config.json: ${err.message})`));
  }
  
  const status = config.autoApprove ? chalk.green.bold("ON (YOLO Mode)") : chalk.red.bold("OFF (Safe Mode)");
  console.log(`\n🚀 Full Automation: ${status}`);
  if (config.autoApprove) {
    console.log(chalk.yellow("⚠️  Warning: The agent will now execute commands and edits without asking for permission (Persistent)."));
  } else {
    console.log(chalk.gray("ℹ️  Safe mode enabled. The agent will ask for permission before sensitive actions."));
  }
}
