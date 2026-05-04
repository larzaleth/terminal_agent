import fs from "fs";
import path from "path";
import readline from "readline/promises";
import chalk from "chalk";
import { writeFileAtomicSync } from "../utils/utils.js";

// ─── Provider presets — sensible defaults so user can skip if unsure ──
const PROVIDER_PRESETS = {
  gemini: {
    label: "Gemini (Google)",
    model: "gemini-3-flash-preview",
    plannerModel: "gemini-3.1-pro-preview",
    summaryModel: "gemini-2.5-flash-lite",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
  },
  openai: {
    label: "OpenAI (GPT)",
    model: "gpt-4.1-mini",
    plannerModel: "gpt-4.1",
    summaryModel: "gpt-4.1-mini",
    apiKeyUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    model: "claude-3-5-haiku-latest",
    plannerModel: "claude-3-5-sonnet-latest",
    summaryModel: "claude-3-5-haiku-latest",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
  },
};

// Entries appended to .gitignore — only added if missing.
const GITIGNORE_ENTRIES = [
  "# myagent runtime artifacts",
  ".agent/",
  ".agent_cache/",
  ".agent_backups/",
  ".agent_sessions/",
  "index.json",
  "memory.json",
  "cost-report.json",
  "error.log",
  "*.bak",
];

const AGENT_DIR = ".agent";
const CONFIG_FILE = "agent.config.json";

/**
 * Run the `myagent --init` setup wizard.
 * Idempotent: safe to run multiple times — won't overwrite existing config
 * unless --force is passed.
 */
export async function runInit({ force = false, nonInteractive = false } = {}) {
  const cwd = process.cwd();
  console.log(chalk.cyan.bold("\n🚀 myagent setup wizard\n"));
  console.log(chalk.dim(`  Workspace: ${cwd}\n`));

  const configPath = path.join(cwd, CONFIG_FILE);
  const configExists = fs.existsSync(configPath);

  // ─── Step 1: Choose provider ─────────────────────────────────────
  let provider = "gemini";
  if (configExists && !force) {
    console.log(chalk.yellow(`⚠ ${CONFIG_FILE} already exists — keeping it (use --force to overwrite).\n`));
  } else if (!nonInteractive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log(chalk.white("Pick your default LLM provider:"));
      const keys = Object.keys(PROVIDER_PRESETS);
      keys.forEach((k, i) => {
        const p = PROVIDER_PRESETS[k];
        console.log(chalk.dim(`  ${i + 1}. ${p.label.padEnd(22)} default model: ${p.model}`));
      });
      const ans = (await rl.question(chalk.cyan("\n> Choice [1-3, default 1]: "))).trim();
      const idx = ans ? parseInt(ans, 10) - 1 : 0;
      if (idx >= 0 && idx < keys.length) provider = keys[idx];
    } finally {
      rl.close();
    }
  }

  // ─── Step 2: Write agent.config.json ─────────────────────────────
  if (!configExists || force) {
    const preset = PROVIDER_PRESETS[provider];
    const configBody = {
      promptVersion: "senior-v1.production",
      provider,
      model: preset.model,
      plannerModel: preset.plannerModel,
      summaryModel: preset.summaryModel,
      maxIterations: 250,
      maxMemoryTurns: 20,
      // Hard cap on cumulative tokens per /run command. 0 = unlimited (default).
      // Set a positive integer (e.g. 100000) to force the agent to wrap up.
      maxTokensPerTurn: 0,
      mcpServers: {},
      autoApprove: false,
    };
    writeFileAtomicSync(configPath, JSON.stringify(configBody, null, 2) + "\n");
    console.log(chalk.green(`✓ Created ${CONFIG_FILE} (provider: ${preset.label})`));
  }

  // ─── Step 3: Create .agent/ folder ───────────────────────────────
  const agentDir = path.join(cwd, AGENT_DIR);
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, "README.md"),
      `# .agent/\n\nWorkspace folder for myagent runtime state. Safe to delete — will be regenerated.\n`
    );
    console.log(chalk.green(`✓ Created ${AGENT_DIR}/ folder`));
  } else {
    console.log(chalk.dim(`• ${AGENT_DIR}/ already exists`));
  }

  // ─── Step 4: Update .gitignore (only add missing lines) ──────────
  const gitignorePath = path.join(cwd, ".gitignore");
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";
  const existingLines = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_ENTRIES.filter(
    (line) => line && !line.startsWith("#") && !existingLines.has(line)
  );

  if (missing.length > 0) {
    const header = "\n# myagent runtime artifacts (auto-added by `myagent --init`)\n";
    const block = (existing && !existing.endsWith("\n") ? "\n" : "") + header + missing.join("\n") + "\n";
    fs.appendFileSync(gitignorePath, block);
    console.log(chalk.green(`✓ Added ${missing.length} entries to .gitignore`));
  } else {
    console.log(chalk.dim(`• .gitignore already has all entries`));
  }

  // ─── Step 5: Final hint ──────────────────────────────────────────
  const apiKeyUrl = PROVIDER_PRESETS[provider]?.apiKeyUrl;
  console.log(chalk.cyan.bold("\n✅ Setup complete!\n"));
  console.log(chalk.white("Next steps:"));
  console.log(chalk.dim(`  1. Get your API key: ${apiKeyUrl || "(see provider docs)"}`));
  console.log(chalk.dim(`  2. Run: ${chalk.bold("myagent")} (will prompt for key on first run)`));
  console.log(chalk.dim(`  3. Inside agent: ${chalk.bold("/index .")} to build semantic index\n`));
}
