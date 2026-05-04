import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { _registerProviderForTests, clearProviderCache } from "../src/llm/providers/index.js";
import { embedMany } from "../src/rag/semantic.js";
import { CACHE_DIR } from "../src/config/constants.js";

// Use an isolated temp cwd so cache writes don't pollute the project.
function withTempCwd(fn) {
  const orig = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "embed-many-"));
  process.chdir(tmp);
  return Promise.resolve(fn(tmp)).finally(() => {
    process.chdir(orig);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });
}

function makeBatchProvider() {
  const calls = { embed: 0, embedBatch: 0, batchSizes: [] };
  const provider = {
    name: "gemini",
    async embed(text) {
      calls.embed++;
      return [text.length, 1, 2]; // fake 3-d vector based on input length
    },
    async embedBatch(texts) {
      calls.embedBatch++;
      calls.batchSizes.push(texts.length);
      return texts.map((t) => [t.length, 1, 2]);
    },
  };
  return { provider, calls };
}

function makeNonBatchProvider() {
  const calls = { embed: 0 };
  const provider = {
    name: "gemini",
    async embed(text) {
      calls.embed++;
      return [text.length, 9];
    },
    // intentionally NO embedBatch — exercises fallback path
  };
  return { provider, calls };
}

test("embedMany: uses provider.embedBatch when available (single API call for small set)", async () => {
  await withTempCwd(async () => {
    clearProviderCache();
    const { provider, calls } = makeBatchProvider();
    _registerProviderForTests("gemini", provider);

    const result = await embedMany(["aaa", "bbbb", "ccccc"]);

    assert.equal(result.length, 3);
    assert.deepEqual(result[0], [3, 1, 2]);
    assert.deepEqual(result[1], [4, 1, 2]);
    assert.deepEqual(result[2], [5, 1, 2]);
    assert.equal(calls.embedBatch, 1, "must call embedBatch exactly once for one slice");
    assert.equal(calls.embed, 0, "single embed must not be invoked when batch path works");
    assert.deepEqual(calls.batchSizes, [3]);
  });
});

test("embedMany: cache hit short-circuits provider call", async () => {
  await withTempCwd(async () => {
    clearProviderCache();
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    const { provider, calls } = makeBatchProvider();
    _registerProviderForTests("gemini", provider);

    // First call populates cache for these strings
    await embedMany(["alpha", "beta"]);
    assert.equal(calls.embedBatch, 1);

    // Second call with same texts → ALL cache hits, zero provider calls
    const before = { ...calls };
    const out = await embedMany(["alpha", "beta"]);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], [5, 1, 2]);
    assert.equal(calls.embedBatch, before.embedBatch, "second call should not hit batch path");
    assert.equal(calls.embed, 0);
  });
});

test("embedMany: mixes cache hits with batch-fetched misses", async () => {
  await withTempCwd(async () => {
    clearProviderCache();
    const { provider, calls } = makeBatchProvider();
    _registerProviderForTests("gemini", provider);

    // Seed cache for 'A' only
    await embedMany(["A"]);
    assert.deepEqual(calls.batchSizes, [1]);

    // Now ask for [A, B, C] — only B and C should go to provider
    const out = await embedMany(["A", "B", "C"]);
    assert.equal(out.length, 3);
    assert.deepEqual(calls.batchSizes, [1, 2], "second call sends only the 2 misses");
  });
});

test("embedMany: falls back to per-item embed() when provider has no embedBatch", async () => {
  await withTempCwd(async () => {
    clearProviderCache();
    const { provider, calls } = makeNonBatchProvider();
    _registerProviderForTests("gemini", provider);

    const out = await embedMany(["x", "yy", "zzz"]);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0], [1, 9]);
    assert.equal(calls.embed, 3, "fallback path calls embed once per text");
  });
});

test("embedMany: batch failure leaves null entries (does not throw)", async () => {
  await withTempCwd(async () => {
    clearProviderCache();
    const provider = {
      name: "gemini",
      async embed(text) { return [text.length]; },
      async embedBatch() { throw new Error("simulated provider 500"); },
    };
    _registerProviderForTests("gemini", provider);

    const out = await embedMany(["one", "two"]);
    assert.equal(out.length, 2);
    assert.equal(out[0], null);
    assert.equal(out[1], null);
  });
});

test("embedMany: empty input returns empty array, no provider call", async () => {
  await withTempCwd(async () => {
    clearProviderCache();
    const { provider, calls } = makeBatchProvider();
    _registerProviderForTests("gemini", provider);

    const out = await embedMany([]);
    assert.deepEqual(out, []);
    assert.equal(calls.embedBatch, 0);
    assert.equal(calls.embed, 0);
  });
});
