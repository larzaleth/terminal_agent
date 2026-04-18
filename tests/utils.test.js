import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafePath, wordCount, retry, formatDuration, truncate } from "../src/utils/utils.js";

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
    { baseDelay: 1, maxDelay: 5 }
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
