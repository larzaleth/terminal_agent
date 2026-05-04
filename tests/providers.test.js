import { test } from "node:test";
import assert from "node:assert/strict";
import { inferProvider } from "../src/llm/providers/index.js";
import { toJsonSchemaTools } from "../src/llm/providers/base.js";
import { getProviderApiKeySpec, upsertEnvValue } from "../src/config/provider-env.js";
import { resolveEmbeddingSpec } from "../src/rag/semantic.js";

test("inferProvider: recognizes gemini models", () => {
  assert.equal(inferProvider("gemini-2.5-flash"), "gemini");
  assert.equal(inferProvider("gemini-2.0-flash"), "gemini");
});

test("inferProvider: recognizes openai models", () => {
  assert.equal(inferProvider("gpt-4o-mini"), "openai");
  assert.equal(inferProvider("gpt-4.1"), "openai");
  assert.equal(inferProvider("o1-mini"), "openai");
  assert.equal(inferProvider("o3-mini"), "openai");
  assert.equal(inferProvider("text-embedding-3-small"), "openai");
});

test("inferProvider: recognizes anthropic models", () => {
  assert.equal(inferProvider("claude-3-5-sonnet-latest"), "anthropic");
  assert.equal(inferProvider("claude-3-opus-latest"), "anthropic");
});

test("inferProvider: explicit provider prefix wins", () => {
  assert.equal(inferProvider("openai:gpt-4o"), "openai");
  assert.equal(inferProvider("anthropic:claude-3-5-sonnet"), "anthropic");
});

test("inferProvider: unknown models return null", () => {
  assert.equal(inferProvider("something-random"), null);
  assert.equal(inferProvider(""), null);
  assert.equal(inferProvider(null), null);
});

test("toJsonSchemaTools: lowercases Gemini UPPERCASE types", () => {
  const decls = [
    {
      name: "read_file",
      description: "read a file",
      parameters: {
        type: "OBJECT",
        properties: { path: { type: "STRING", description: "path" } },
        required: ["path"],
      },
    },
  ];
  const converted = toJsonSchemaTools(decls);
  assert.equal(converted[0].parameters.type, "object");
  assert.equal(converted[0].parameters.properties.path.type, "string");
  assert.equal(converted[0].name, "read_file");
});

test("getProviderApiKeySpec: returns the right env var for each provider", () => {
  assert.deepEqual(getProviderApiKeySpec("gemini"), {
    provider: "gemini",
    label: "Gemini",
    envVar: "GEMINI_API_KEY",
    setupUrl: "https://aistudio.google.com/app/apikey",
  });
  assert.deepEqual(getProviderApiKeySpec("openai"), {
    provider: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    setupUrl: "https://platform.openai.com/api-keys",
  });
  assert.deepEqual(getProviderApiKeySpec("claude"), {
    provider: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    setupUrl: "https://console.anthropic.com/settings/keys",
  });
});

test("upsertEnvValue: replaces an existing key without dropping siblings", () => {
  const before = "GEMINI_API_KEY=old-gemini\nOPENAI_API_KEY=old-openai\n";
  const after = upsertEnvValue(before, "OPENAI_API_KEY", "new-openai");
  assert.equal(after, "GEMINI_API_KEY=old-gemini\nOPENAI_API_KEY=new-openai\n");
});

test("upsertEnvValue: appends missing keys and normalizes trailing newline", () => {
  const before = "GEMINI_API_KEY=old-gemini";
  const after = upsertEnvValue(before, "ANTHROPIC_API_KEY", "new-anthropic");
  assert.equal(after, "GEMINI_API_KEY=old-gemini\nANTHROPIC_API_KEY=new-anthropic\n");
});

test("resolveEmbeddingSpec: uses the main provider when it supports embeddings", () => {
  assert.deepEqual(
    resolveEmbeddingSpec({ provider: "openai" }, {}),
    { provider: "openai", model: "text-embedding-3-small", fallbackFrom: null }
  );
});

test("resolveEmbeddingSpec: honors explicit embedding provider and model", () => {
  assert.deepEqual(
    resolveEmbeddingSpec(
      { provider: "anthropic", embeddingProvider: "openai", embeddingModel: "text-embedding-3-large" },
      {}
    ),
    { provider: "openai", model: "text-embedding-3-large", fallbackFrom: null }
  );
});

test("resolveEmbeddingSpec: falls back from anthropic to gemini when available", () => {
  assert.deepEqual(
    resolveEmbeddingSpec({ provider: "anthropic" }, { GEMINI_API_KEY: "test-key" }),
    { provider: "gemini", model: "gemini-embedding-2", fallbackFrom: "anthropic" }
  );
});

test("resolveEmbeddingSpec: falls back from anthropic to openai when gemini is unavailable", () => {
  assert.deepEqual(
    resolveEmbeddingSpec({ provider: "anthropic" }, { OPENAI_API_KEY: "test-key" }),
    { provider: "openai", model: "text-embedding-3-small", fallbackFrom: "anthropic" }
  );
});

test("resolveEmbeddingSpec: rejects anthropic as an explicit embedding provider", () => {
  assert.throws(
    () => resolveEmbeddingSpec({ provider: "gemini", embeddingProvider: "anthropic" }, {}),
    /Anthropic has no embedding API/
  );
});
