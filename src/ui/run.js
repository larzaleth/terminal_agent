import readline from "readline";
import chalk from "chalk";
import { runAgent } from "../core/agents.js";
import { handleSlashCommand } from "../commands/slash.js";
import { loadConfig } from "../config/config.js";
import { MAX_ITERATIONS_DEFAULT } from "../config/constants.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { shutdownMcp } from "../mcp/client.js";
import { setPrompter, resetPrompter } from "./prompter.js";
import { setToolStreamCallback, clearToolStreamCallback } from "./toolStream.js";
import { renderDiff, diffStats } from "../tools/diff.js";

// ─── Pure CLI — zero blinking, zero lag ───────────────────────────────

/** Prompt user for input via the shared readline instance */
function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

/** 
 * Simple terminal highlight: 
 * Replaces `code` with cyan colored text without backticks.
 */
function highlight(text) {
  if (!text) return text;
  return text
    .replace(/\*\*([^*]+)\*\*/g, (_, p1) => chalk.white.bold(p1))
    .replace(/`([^`]+)`/g, (_, p1) => chalk.cyan(p1));
}

export function startTui() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  /**
   * Captures a single keypress for confirmation.
   * Enter = Yes, Esc = No.
   */
  async function confirmKey(promptText) {
    return new Promise((resolve) => {
      process.stdout.write(promptText);
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onData = (data) => {
        const hex = data.toString("hex");
        if (hex === "0d" || hex === "0a") { // Enter
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw);
          process.stdout.write(chalk.green(" Yes\n"));
          resolve("yes");
        } else if (hex === "1b") { // Esc
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw);
          process.stdout.write(chalk.red(" No\n"));
          resolve("no");
        } else if (hex === "65") { // 'e' for edit
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw);
          process.stdout.write(chalk.yellow(" Edit\n"));
          resolve("edit");
        } else if (hex === "03") { // Ctrl+C
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw);
          process.stdout.write("\n");
          process.exit(0);
        }
      };

      process.stdin.on("data", onData);
    });
  }

  // ── Prompter: confirmation / edit approval via raw keypresses ──────
  setPrompter({
    confirm: ({ message, reason }) =>
      (async () => {
        process.stdout.write(chalk.yellow.bold("\n⚠️  CONFIRM: ") + chalk.white(message) + (reason ? chalk.gray(` (${reason})`) : "") + "\n");
        const res = await confirmKey(chalk.yellow("  Apply? (Enter=Yes, Esc=No): "));
        return res === "yes";
      })(),
    editApproval: ({ filePath, oldContent, newContent }) =>
      (async () => {
        console.log(renderDiff(oldContent, newContent, filePath));
        const res = await confirmKey(chalk.yellow("  Apply? (Enter=Yes, Esc=No, E=Edit): "));
        if (res === "no") return { decision: "reject" };
        if (res === "edit") return { decision: "manual" };
        return { decision: "approve" };
      })(),
  });

  // ── Tool stream: pipe live output directly to stdout ───────────────
  let isAtLineStart = true;
  const INDENT = "      ";

  setToolStreamCallback((_name, chunk) => {
    const lines = chunk.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (isAtLineStart && lines[i].length > 0) {
        process.stdout.write(INDENT);
        isAtLineStart = false;
      }
      process.stdout.write(chalk.gray(lines[i]));
      if (i < lines.length - 1) {
        process.stdout.write("\n");
        isAtLineStart = true;
      }
    }
  });

  // ── Main loop ──────────────────────────────────────────────────────
  async function mainLoop() {
    while (true) {
      let input;
      try {
        const config = loadConfig();
        const modelInfo = chalk.dim.italic(`(${config.model})`);
        input = await ask(rl, `\n${modelInfo}\n` + chalk.green.bold("❯ "));
      } catch {
        break; // EOF / closed
      }

      const text = input.trim();
      if (!text) continue;

      // Exit
      if (text === "exit" || text === "quit") {
        console.log(chalk.gray("\n👋 Goodbye!\n"));
        await shutdownMcp().catch(() => {});
        break;
      }

      // Slash commands
      if (text.startsWith("/")) {
        try {
          const handled = await handleSlashCommand(text);
          if (!handled) console.log(chalk.red(`Unknown command: ${text}`));
          loadConfig(true);
        } catch (err) {
          console.log(chalk.red(`Error: ${err.message}`));
        }
        continue;
      }

      // ── Agent turn ──────────────────────────────────────────────
      const currentConfig = loadConfig(true);
      const turnStartStats = globalTracker.getStats(currentConfig.model);
      const turnStartTokens =
        turnStartStats.usage.generation.inputTokens +
        turnStartStats.usage.generation.outputTokens;
      const turnStartCost = turnStartStats.cost.total;
      const turnStartMs = Date.now();

      const controller = new AbortController();

      // Handle Ctrl+C during agent run (cancel current turn, don't exit app)
      const sigHandler = () => {
        controller.abort();
        console.log(chalk.yellow("\n⚠️ Cancelling..."));
      };
      process.once("SIGINT", sigHandler);

      let iter = 0;

      try {
        await runAgent(text, {
          signal: controller.signal,
          onPlan: (plan) => {
            if (!plan || plan.length === 0) return;
            console.log(chalk.cyan("\n[PLAN]"));
            plan.forEach((s, i) =>
              console.log(chalk.gray(`  ${i + 1}. ${s.step || s.action || s}`))
            );
            console.log();
          },
          onThinking: () => {
            iter++;
            // Only add newline if it's not the very first step
            const prefix = iter === 1 ? "" : "\n";
            process.stdout.write(prefix + chalk.dim(`· Thinking (${iter}/${currentConfig.maxIterations || MAX_ITERATIONS_DEFAULT})...\n`));
            isAtLineStart = true;
          },
          onText: (t) => {
            process.stdout.write(highlight(t));
            isAtLineStart = t.endsWith("\n");
          },
          onToolCall: (name, args) => {
            const argsStr = Object.entries(args || {})
              .map(([k, v]) => {
                const val = typeof v === "string" ? v : JSON.stringify(v);
                return `${k}=${val.length > 25 ? val.slice(0, 25) + "…" : val}`;
              })
              .join(", ");
            process.stdout.write(chalk.blue(`\n  ⟳ ${name}`) + chalk.gray(` ${highlight(argsStr)}\n`));
            isAtLineStart = true;
          },
          onToolResult: (name, preview) => {
            // Summary line
            const short = (preview || "").split("\n")[0].slice(0, 60);
            process.stdout.write(chalk.green(`\n  ✓ ${name}`) + chalk.gray(` ${highlight(short)}`));
            isAtLineStart = true;
          },
          onRetry: ({ attempt, maxRetries, delayMs, reason }) => {
            process.stdout.write(
              chalk.yellow(
                `\n  ↻ Retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s — ${reason}\n`
              )
            );
            isAtLineStart = true;
          },
          onDone: () => {
            process.stdout.write("\n");
          },
          onError: (err) => {
            process.stdout.write(chalk.red(`\n  ❌ ${err.message}\n`));
          },
        });
      } catch (err) {
        console.log(chalk.red(`\n❌ ${err.message}`));
      } finally {
        process.removeListener("SIGINT", sigHandler);

        // Cost summary for this turn
        const endStats = globalTracker.getStats(currentConfig.model);
        const endTokens =
          endStats.usage.generation.inputTokens +
          endStats.usage.generation.outputTokens;
        const turnTokens = Math.max(0, endTokens - turnStartTokens);
        const turnCost = Math.max(0, endStats.cost.total - turnStartCost);
        const turnMs = Date.now() - turnStartMs;

        // Save cost to file
        const turnEntry = { tokens: turnTokens, cost: turnCost, durationMs: turnMs };
        globalTracker.saveTurn(currentConfig.model, turnEntry);

        // Print turn summary
        const line = "─".repeat(Math.min(process.stdout.columns || 80, 80));
        console.log();
        console.log(chalk.cyan.bold(line));
        console.log(
          chalk.gray(
            `  ⏱ ${(turnMs / 1000).toFixed(1)}s | 📊 ${turnTokens.toLocaleString()} tokens | 💰 $${turnCost.toFixed(6)} (Rp${Math.ceil(turnCost * 16000).toLocaleString()})`
          )
        );
        console.log(chalk.cyan.bold(line));
      }
    }

    clearToolStreamCallback();
    resetPrompter();
    rl.close();
    process.exit(0);
  }

  mainLoop().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });

  return { cleanup: () => rl.close() };
}
