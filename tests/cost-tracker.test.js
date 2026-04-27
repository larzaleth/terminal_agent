import { test } from "node:test";
import assert from "node:assert/strict";
import { CostTracker } from "../src/llm/cost-tracker.js";

test("cost tracker: embedding cost is calculated per embedding model", () => {
  const tracker = new CostTracker();

  tracker.trackEmbedding("a".repeat(350), false, "text-embedding-3-small");
  const stats = tracker.getStats("gpt-4o-mini");

  assert.equal(stats.usage.embeddings.tokens, 100);
  assert.equal(stats.usage.embeddings.calls, 1);
  assert.equal(stats.usage.embeddings.byModel["text-embedding-3-small"].tokens, 100);
  assert.ok(Math.abs(stats.cost.embeddings - 0.000002) < 1e-12);
});
