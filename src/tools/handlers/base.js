import fs from "fs/promises";
import { getPrompter } from "../../ui/prompter.js";

/**
 * Check if a file or directory exists.
 */
export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask user for permission to execute a command or destructive action.
 */
export async function confirmExecution(cmd, reason) {
  const tag = reason ? ` (${reason})` : "";
  return getPrompter().confirm({ message: `Agent wants to run${tag}: \`${cmd}\``, reason });
}

export const UNSAFE_PATH_MSG =
  "❌ Error: Path is outside the working directory. For security, the agent can only access files inside the current project.";

export const FILE_PREVIEW_NOTICE = "\n... (truncated, file preview only)";
