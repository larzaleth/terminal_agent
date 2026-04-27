import { spawn } from "child_process";
import {
  resolveCommandShell,
  resolveTerminationPlan,
  appendBoundedBuffer,
  truncate,
} from "../utils/utils.js";
import {
  COMMAND_TIMEOUT_MS,
  COMMAND_MAX_BUFFER,
  MAX_COMMAND_OUTPUT_CHARS,
} from "../config/constants.js";
import { emitToolStream, hasToolStreamCallback } from "../ui/toolStream.js";

/**
 * Run a shell command with live streaming output.
 * @param {string} cmd - Command to execute.
 * @returns {Promise<string>} - Command output or error message.
 */
export function runWithSpawn(cmd) {
  return new Promise((resolve) => {
    const shellSpec = resolveCommandShell();

    const child = spawn(shellSpec.shell, [...shellSpec.args, cmd], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let stderrBuf = "";
    let stdoutDropped = 0;
    let stderrDropped = 0;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      void terminateChildProcess(child);
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const next = appendBoundedBuffer(stdoutBuf, text, COMMAND_MAX_BUFFER);
      stdoutDropped += stdoutBuf.length + text.length - next.length;
      stdoutBuf = next;
      if (hasToolStreamCallback()) emitToolStream("run_command", text);
      else process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      const next = appendBoundedBuffer(stderrBuf, text, COMMAND_MAX_BUFFER);
      stderrDropped += stderrBuf.length + text.length - next.length;
      stderrBuf = next;
      if (hasToolStreamCallback()) emitToolStream("run_command", text);
      else process.stderr.write(text);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(`❌ Error: Failed to spawn command: ${err.message}`);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return resolve(
          `❌ Error: Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s and was killed.`
        );
      }
      if (code === 0) {
        const stdoutOut =
          stdoutDropped > 0
            ? `[showing last ${stdoutBuf.length} chars, ${stdoutDropped} earlier chars omitted]\n${stdoutBuf}`
            : stdoutBuf;
        const out =
          stdoutBuf.trim() === "" ? "(no output)" : truncate(stdoutOut, MAX_COMMAND_OUTPUT_CHARS);
        return resolve(`✅ Success (exit 0):\n${out}`);
      }
      
      let errorMsg = `❌ Error: Command failed (exit code: ${code})\n\n`;
      if (stderrBuf) {
        const stderrOut =
          stderrDropped > 0
            ? `[showing last ${stderrBuf.length} chars, ${stderrDropped} earlier chars omitted]\n${stderrBuf}`
            : stderrBuf;
        errorMsg += `📝 Stderr:\n${truncate(stderrOut, 2000)}\n\n`;
      }
      if (stdoutBuf) {
        const stdoutOut =
          stdoutDropped > 0
            ? `[showing last ${stdoutBuf.length} chars, ${stdoutDropped} earlier chars omitted]\n${stdoutBuf}`
            : stdoutBuf;
        errorMsg += `📄 Stdout:\n${truncate(stdoutOut, 2000)}`;
      }
      errorMsg += `\n\n💡 Tip: Check command syntax and permissions.`;
      resolve(errorMsg);
    });
  });
}

/**
 * Terminate a child process using the best platform-specific method.
 * @param {import('child_process').ChildProcess} child
 */
export async function terminateChildProcess(child) {
  const pid = child?.pid;
  const plan = resolveTerminationPlan(pid);
  if (!plan) return false;

  if (plan.mode === "signal") {
    try {
      child.kill(plan.signal);
      return true;
    } catch {
      return false;
    }
  }

  return new Promise((resolve) => {
    const killer = spawn(plan.command, plan.args, { stdio: "ignore" });
    killer.on("error", () => resolve(false));
    killer.on("close", () => resolve(true));
  });
}
