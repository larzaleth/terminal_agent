import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, buildBm25Index, scoreBm25, bm25Search } from "../src/rag/bm25.js";

test("tokenize: splits camelCase, snake_case, kebab-case", () => {
  assert.deepEqual(tokenize("getUserName"), ["get", "user", "name"]);
  assert.deepEqual(tokenize("snake_case_var"), ["snake", "case", "var"]);
  // kebab-case is split by the wordRe (hyphen is non-word)
  assert.deepEqual(tokenize("foo-bar-baz"), ["foo", "bar", "baz"]);
});

test("tokenize: drops 1-char tokens", () => {
  assert.deepEqual(tokenize("a is b"), ["is"]);
});

test("tokenize: handles Unicode letters", () => {
  // Non-ASCII letters preserved
  const tokens = tokenize("café_münchen");
  assert.ok(tokens.includes("café"));
  assert.ok(tokens.includes("münchen"));
});

test("tokenize: numbers tokenized separately from letters", () => {
  assert.deepEqual(tokenize("var123abc"), ["var", "123", "abc"]);
});

test("buildBm25Index: computes IDF correctly", () => {
  const docs = [
    "the cat sat on the mat",
    "the dog chased the cat",
    "fish swim in water",
  ];
  const idx = buildBm25Index(docs);

  // "the" appears in 2/3 docs → low IDF
  // "fish" appears in 1/3 docs → higher IDF
  const idfThe = idx.idf.get("the");
  const idfFish = idx.idf.get("fish");
  assert.ok(idfFish > idfThe, "rare terms must have higher IDF than common terms");
  assert.equal(idx.n, 3);
  assert.ok(idx.avgDl > 0);
});

test("scoreBm25: returns 0 when no query token matches doc", () => {
  const docs = ["alpha beta gamma"];
  const idx = buildBm25Index(docs);
  const score = scoreBm25(tokenize("xyzfoo"), idx.docs[0], idx.idf, idx.avgDl);
  assert.equal(score, 0);
});

test("scoreBm25: matching doc scores higher than non-matching", () => {
  const docs = [
    "user authentication and login service",
    "database connection pool config",
    "the quick brown fox jumps",
  ];
  const idx = buildBm25Index(docs);
  const queryTokens = tokenize("user authentication");

  const scores = idx.docs.map((d) => scoreBm25(queryTokens, d, idx.idf, idx.avgDl));
  assert.ok(scores[0] > scores[1], "doc with both terms must outscore unrelated");
  assert.ok(scores[0] > scores[2], "matching doc must outscore noise");
  assert.equal(scores[1], 0);
  assert.equal(scores[2], 0);
});

test("bm25Search: returns sorted matches, ignoring zero-score docs", () => {
  const docs = [
    "the user repository class",
    "user service helper functions",
    "image rendering pipeline",
    "user user user",  // very high TF on "user"
  ];
  const results = bm25Search("user repository", docs);
  assert.ok(results.length >= 2, "must find docs containing query terms");
  assert.equal(results[0].index, 0, "best match is the doc with both 'user' AND 'repository'");
  // doc 2 (image) should not be in results at all
  assert.ok(!results.some((r) => r.index === 2));
});

test("bm25Search: long-doc penalty (length normalization)", () => {
  // Two docs, both contain 'rare' once; one is much longer than the other.
  const shortDoc = "rare event";
  const longDoc = "rare " + "filler ".repeat(100);
  const results = bm25Search("rare", [shortDoc, longDoc]);
  // Short doc should score higher because BM25's length normalization
  // penalizes longer docs containing the same TF.
  assert.equal(results[0].index, 0, "short doc with same TF beats long doc");
});

test("bm25Search: empty query returns empty array", () => {
  const results = bm25Search("", ["doc one", "doc two"]);
  assert.deepEqual(results, []);
});

test("bm25Search: empty corpus returns empty array", () => {
  const results = bm25Search("anything", []);
  assert.deepEqual(results, []);
});
