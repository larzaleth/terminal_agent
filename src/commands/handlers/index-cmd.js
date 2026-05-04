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
    const stats = await buildIndex(folder);
    if (stats && typeof stats === "object") {
      const { successfulChunks = 0, failedChunks = 0, files = 0 } = stats;
      const detail = `${successfulChunks} chunks from ${files} files` +
        (failedChunks > 0 ? `, ${failedChunks} failed` : "");
      spinner.succeed(chalk.green(`Index built: ${detail}`));
    } else {
      spinner.succeed(chalk.green("Index built successfully."));
    }
  } catch (err) {
    spinner.fail(chalk.red(`Index failed: ${err.message}`));
  }
}
