import { classifyCommand } from "../command-classifier.js";
import { runWithSpawn } from "../shell-runner.js";
import { confirmExecution } from "./base.js";

export default async function ({ cmd }) {
  if (!cmd || cmd.trim() === "") return "❌ Error: Command cannot be empty.";

  const { verdict, reason } = classifyCommand(cmd);

  if (verdict === "blocked") {
    return `🛑 Blocked: Refusing to run potentially dangerous command.\nReason: ${reason}\n💡 If you genuinely need this, run it manually outside the agent.`;
  }

  if (verdict === "confirm") {
    const ok = await confirmExecution(cmd, reason);
    if (!ok) {
      return "🚫 Cancelled: User denied permission to run command.";
    }
  }

  return runWithSpawn(cmd);
}
