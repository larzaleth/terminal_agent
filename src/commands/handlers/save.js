import chalk from "chalk";
import { exportTranscript } from "../../core/transcript.js";

export async function saveCommand(args) {
  const filename = args[0] || `transcript-${Date.now()}.md`;
  try {
    const info = await exportTranscript(filename);
    console.log(chalk.green(`\n✅ Transcript saved: ${info.path}`));
    console.log(chalk.dim(`   ${info.messages} messages, ${(info.bytes / 1024).toFixed(1)} KB\n`));
  } catch (err) {
    console.log(chalk.red(`❌ ${err.message}\n`));
  }
}
