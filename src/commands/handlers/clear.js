import chalk from "chalk";
import { clearMemory } from "../../core/memory.js";

export async function clearCommand() {
  clearMemory();
  console.log(chalk.green("✅ Memory cleared.\n"));
}
