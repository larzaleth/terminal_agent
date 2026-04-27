import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import chalk from "chalk";
import { MEMORY_FILE } from "../../config/constants.js";
import { loadMemory } from "../../core/memory.js";

const SESSION_DIR = ".agent_sessions";

/**
 * Slash command: /session [list|save|resume|delete] [name]
 */
export async function sessionCommand(args) {
  const action = args[0] || "list";
  const name = args[1];

  if (!fsSync.existsSync(SESSION_DIR)) {
    await fs.mkdir(SESSION_DIR, { recursive: true });
  }

  switch (action) {
    case "list":
      return await listSessions();
    case "save":
      return await saveSession(name);
    case "resume":
    case "load":
      return await resumeSession(name);
    case "delete":
    case "rm":
      return await deleteSession(name);
    default:
      console.log(chalk.red(`❌ Unknown session action: ${action}`));
      console.log(chalk.dim("Usage: /session [list | save <name> | resume <name> | delete <name>]"));
  }
}

async function listSessions() {
  const files = await fs.readdir(SESSION_DIR);
  const sessions = files.filter(f => f.endsWith(".json"));

  if (sessions.length === 0) {
    console.log(chalk.yellow("\n📭 No saved sessions found."));
    return;
  }

  console.log(chalk.cyan.bold("\n📂 Saved Sessions:"));
  for (const s of sessions) {
    const stats = await fs.stat(path.join(SESSION_DIR, s));
    const sessionName = s.replace(".json", "");
    console.log(`  • ${chalk.white(sessionName.padEnd(20))} ${chalk.dim(new Date(stats.mtime).toLocaleString())}`);
  }
  console.log("");
}

async function saveSession(name) {
  if (!name) {
    console.log(chalk.red("❌ Error: Session name required."));
    return;
  }

  const sessionPath = path.join(SESSION_DIR, `${name}.json`);
  if (!fsSync.existsSync(MEMORY_FILE)) {
    console.log(chalk.yellow("⚠️ No active memory to save."));
    return;
  }

  await fs.copyFile(MEMORY_FILE, sessionPath);
  console.log(chalk.green(`\n✅ Session saved as '${name}'`));
}

async function resumeSession(name) {
  if (!name) {
    console.log(chalk.red("❌ Error: Session name required."));
    return;
  }

  const sessionPath = path.join(SESSION_DIR, `${name}.json`);
  if (!fsSync.existsSync(sessionPath)) {
    console.log(chalk.red(`❌ Error: Session '${name}' not found.`));
    return;
  }

  await fs.copyFile(sessionPath, MEMORY_FILE);
  console.log(chalk.green(`\n✅ Session '${name}' resumed! Current memory updated.`));
  console.log(chalk.dim("💡 Type your next request to continue."));
}

async function deleteSession(name) {
  if (!name) {
    console.log(chalk.red("❌ Error: Session name required."));
    return;
  }

  const sessionPath = path.join(SESSION_DIR, `${name}.json`);
  if (!fsSync.existsSync(sessionPath)) {
    console.log(chalk.red(`❌ Error: Session '${name}' not found.`));
    return;
  }

  await fs.unlink(sessionPath);
  console.log(chalk.green(`\n🗑️ Session '${name}' deleted.`));
}

export const name = "/session";
