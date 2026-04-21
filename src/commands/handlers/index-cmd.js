import chalk from "chalk";
import ora from "ora";
import { buildIndex } from "../../rag/semantic.js";

export async function indexCommand(args) {
  const folder = args[0];
  if (!folder) {
    console.log(chalk.red("❌ Usage: /index <folder>"));
    return;
  }
  const spinner = ora("Building semantic index...").start();
  try {
    await buildIndex(folder);
    spinner.succeed(chalk.green("Index built successfully."));
  } catch (err) {
    spinner.fail(chalk.red(`Index failed: ${err.message}`));
  }
}
