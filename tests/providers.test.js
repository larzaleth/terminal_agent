import { test } from "node:test";
import assert from "node:assert/strict";
import { inferProvider } from "../src/llm/providers/index.js";
import { toJsonSchemaTools } from "../src/llm/providers/base.js";

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
