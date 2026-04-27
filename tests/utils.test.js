import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isSafePath,
  wordCount,
  retry,
  formatDuration,
  truncate,
  appendBoundedBuffer,
  resolveCommandShell,
  resolveTerminationPlan,
  detectShell,
  writeFileAtomic,
  writeFileAtomicSync,
} from "../src/utils/utils.js";

test("isSafePath: relative inside cwd is safe", () => {
  assert.equal(isSafePath("src/utils/utils.js"), true);
  assert.equal(isSafePath("./README.md"), true);
});

test("isSafePath: traversal is blocked", () => {
  assert.equal(isSafePath("../etc/passwd"), false);
  assert.equal(isSafePath("src/../../outside"), false);
});

test("isSafePath: absolute outside cwd is blocked", () => {
  assert.equal(isSafePath("/etc/passwd"), false);
  assert.equal(isSafePath("/root/.ssh/id_rsa"), false);
});

test("isSafePath: rejects non-strings and empty", () => {
  assert.equal(isSafePath(""), false);
  assert.equal(isSafePath(null), false);
  assert.equal(isSafePath(undefined), false);
  assert.equal(isSafePath(123), false);
});

test("wordCount: handles whitespace variations", () => {
  assert.equal(wordCount("hello world"), 2);
  assert.equal(wordCount("  multiple   spaces   here  "), 3);
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount(null), 0);
});

test("formatDuration: ms vs s", () => {
  assert.equal(formatDuration(500), "500ms");
  assert.equal(formatDuration(1500), "1.5s");
});

test("truncate: leaves short strings alone", () => {
  assert.equal(truncate("short", 100), "short");
});

test("truncate: adds marker on long strings", () => {
  const long = "a".repeat(200);
  const result = truncate(long, 50);
  assert.ok(result.startsWith("a".repeat(50)));
  assert.ok(result.includes("truncated"));
});

test("appendBoundedBuffer: keeps the newest output within the cap", () => {
  const result = appendBoundedBuffer("abcdef", "ghijkl", 8);
  assert.equal(result, "efghijkl");
});

test("retry: returns result on success", async () => {
  let calls = 0;
  const result = await retry(async () => {
    calls++;
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("retry: retries on 429 and succeeds", async () => {
  let calls = 0;
  const result = await retry(
    async () => {
      calls++;
      if (calls < 3) {
        const err = new Error("rate limit exceeded 429");
        throw err;
      }
      return "recovered";
    },
    { baseDelay: 1, maxDelay: 5, onRetry: () => {} }
  );
  assert.equal(result, "recovered");
  assert.equal(calls, 3);
});

test("retry: does not retry on non-retryable errors", async () => {
  let calls = 0;
  await assert.rejects(
    retry(
      async () => {
        calls++;
        throw new Error("Bad input");
      },
      { baseDelay: 1, maxRetries: 3 }
    )
  );
  assert.equal(calls, 1);
});

test("resolveCommandShell: Windows defaults to PowerShell", () => {
  assert.deepEqual(resolveCommandShell("win32", {}), {
    shell: "powershell.exe",
    args: ["-NoLogo", "-NoProfile", "-Command"],
    label: "powershell.exe",
  });
});

test("resolveTerminationPlan: Windows uses taskkill tree termination", () => {
  assert.deepEqual(resolveTerminationPlan(1234, "win32"), {
    mode: "command",
    command: "taskkill.exe",
    args: ["/pid", "1234", "/T", "/F"],
  });
});

test("resolveTerminationPlan: POSIX uses SIGKILL", () => {
  assert.deepEqual(resolveTerminationPlan(1234, "linux"), {
    mode: "signal",
    signal: "SIGKILL",
  });
});

test("resolveTerminationPlan: invalid pid returns null", () => {
  assert.equal(resolveTerminationPlan(0, "win32"), null);
  assert.equal(resolveTerminationPlan(undefined, "linux"), null);
});

test("resolveCommandShell: Windows can opt into cmd", () => {
  assert.deepEqual(
    resolveCommandShell("win32", { MYAGENT_WINDOWS_SHELL: "cmd", ComSpec: "C:\\Windows\\System32\\cmd.exe" }),
    {
      shell: "C:\\Windows\\System32\\cmd.exe",
      args: ["/c"],
      label: "C:\\Windows\\System32\\cmd.exe",
    }
  );
});

test("resolveCommandShell: non-Windows uses sh for execution but keeps shell label", () => {
  assert.deepEqual(resolveCommandShell("linux", { SHELL: "/bin/zsh" }), {
    shell: "/bin/sh",
    args: ["-c"],
    label: "/bin/zsh",
  });
});

test("detectShell: returns the resolved shell label", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  const origWindowsShell = process.env.MYAGENT_WINDOWS_SHELL;
  const origComSpec = process.env.ComSpec;

  Object.defineProperty(process, "platform", { value: "win32" });
  process.env.MYAGENT_WINDOWS_SHELL = "cmd";
  process.env.ComSpec = "cmd.exe";

  try {
    assert.equal(detectShell(), "cmd.exe");
  } finally {
    Object.defineProperty(process, "platform", platformDescriptor);
    if (origWindowsShell === undefined) delete process.env.MYAGENT_WINDOWS_SHELL;
    else process.env.MYAGENT_WINDOWS_SHELL = origWindowsShell;
    if (origComSpec === undefined) delete process.env.ComSpec;
    else process.env.ComSpec = origComSpec;
  }
});

test("writeFileAtomicSync: replaces file contents without leaving temp files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-atomic-"));
  const filePath = path.join(dir, "state.json");

  try {
    writeFileAtomicSync(filePath, "first");
    writeFileAtomicSync(filePath, "second");
    assert.equal(fs.readFileSync(filePath, "utf8"), "second");
    const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeFileAtomic: replaces file contents without leaving temp files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-atomic-"));
  const filePath = path.join(dir, "state.json");

  try {
    await writeFileAtomic(filePath, "alpha");
    await writeFileAtomic(filePath, "beta");
    assert.equal(fs.readFileSync(filePath, "utf8"), "beta");
    const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
