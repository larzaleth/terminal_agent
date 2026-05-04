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

const TOOL_ERROR_PREFIX = "\u274c";
const TOOL_CANCEL_PREFIX = "\u{1f6ab}";
const TOOL_SUCCESS_PREFIX = "\u2705";

/**
 * Run a shell command with live streaming output.
 * @param {string} cmd - Command to execute.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<string>} Command output or error message.
 */
export function runWithSpawn(cmd, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const shellSpec = resolveCommandShell();

    const child = spawn(shellSpec.shell, [...shellSpec.args, cmd], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let stderrBuf = "";
    let stdoutDropped = 0;
    let stderrDropped = 0;
    let timedOut = false;
    let aborted = false;

    const finish = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
      resolve(message);
    };

    const onAbort = () => {
      aborted = true;
      void terminateChildProcess(child);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      void terminateChildProcess(child);
    }, COMMAND_TIMEOUT_MS);

    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const next = appendBoundedBuffer(stdoutBuf, text, COMMAND_MAX_BUFFER);
      stdoutDropped += stdoutBuf.length + text.length - next.length;
      stdoutBuf = next;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      const next = appendBoundedBuffer(stderrBuf, text, COMMAND_MAX_BUFFER);
      stderrDropped += stderrBuf.length + text.length - next.length;
      stderrBuf = next;
      process.stderr.write(text);
    });

    child.on("error", (err) => {
      finish(`${TOOL_ERROR_PREFIX} Error: Failed to spawn command: ${err.message}`);
    });

    child.on("close", (code) => {
      if (aborted) {
        return finish(`${TOOL_CANCEL_PREFIX} Cancelled: Command was aborted by user.`);
      }
      if (timedOut) {
        return finish(`${TOOL_ERROR_PREFIX} Error: Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s and was killed.`);
      }
      if (code === 0) {
        let combined = "";
        if (stdoutBuf.trim()) combined += stdoutBuf;
        if (stderrBuf.trim()) combined += (combined ? "\n" : "") + stderrBuf;

        const out = combined.trim() === "" ? "(no output)" : truncate(combined, MAX_COMMAND_OUTPUT_CHARS);
        return finish(`${TOOL_SUCCESS_PREFIX} Success (exit 0):\n${out}`);
      }

      let errorMsg = `${TOOL_ERROR_PREFIX} Error: Command failed (exit code: ${code})\n\n`;
      if (stderrBuf) {
        const stderrOut =
          stderrDropped > 0
            ? `[showing last ${stderrBuf.length} chars, ${stderrDropped} earlier chars omitted]\n${stderrBuf}`
            : stderrBuf;
        errorMsg += `Stderr:\n${truncate(stderrOut, 2000)}\n\n`;
      }
      if (stdoutBuf) {
        const stdoutOut =
          stdoutDropped > 0
            ? `[showing last ${stdoutBuf.length} chars, ${stdoutDropped} earlier chars omitted]\n${stdoutBuf}`
            : stdoutBuf;
        errorMsg += `Stdout:\n${truncate(stdoutOut, 2000)}`;
      }
      errorMsg += "\n\nTip: Check command syntax and permissions.";
      finish(errorMsg);
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
