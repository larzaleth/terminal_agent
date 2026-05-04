import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerAgent,
  getAgent,
  hasAgent,
  listAgents,
  _resetRegistryForTests,
} from "../src/core/agents/registry.js";

test("registry: register + lookup round-trip", () => {
  _resetRegistryForTests();
  registerAgent({ name: "alpha", description: "first" });
  assert.ok(hasAgent("alpha"));
  const def = getAgent("alpha");
  assert.equal(def.name, "alpha");
  assert.equal(def.description, "first");
});

test("registry: duplicate registration throws", () => {
  _resetRegistryForTests();
  registerAgent({ name: "beta", description: "x" });
  assert.throws(
    () => registerAgent({ name: "beta", description: "y" }),
    /duplicate agent name/
  );
});

test("registry: getAgent on unknown throws with available list", () => {
  _resetRegistryForTests();
  registerAgent({ name: "alpha", description: "" });
  assert.throws(() => getAgent("zzz"), /Unknown agent.*Available: alpha/);
});

test("registry: registerAgent rejects bad input", () => {
  _resetRegistryForTests();
  assert.throws(() => registerAgent(null), /definition must be an object/);
  assert.throws(() => registerAgent({}), /name is required/);
  assert.throws(() => registerAgent({ name: "" }), /name is required/);
});

test("registry: listAgents returns all in insertion order", () => {
  _resetRegistryForTests();
  registerAgent({ name: "a", description: "" });
  registerAgent({ name: "b", description: "" });
  registerAgent({ name: "c", description: "" });
  const names = listAgents().map((a) => a.name);
  assert.deepEqual(names, ["a", "b", "c"]);
});

test("registry: definitions are frozen (shallow)", () => {
  _resetRegistryForTests();
  registerAgent({ name: "frozen", description: "test" });
  const def = getAgent("frozen");
  assert.throws(() => {
    def.description = "mutated";
  }, TypeError);
});

test("built-in agents load via index.js barrel", async () => {
  _resetRegistryForTests();
  await import("../src/core/agents/index.js");
  assert.ok(hasAgent("default"));
  assert.ok(hasAgent("analyzer"));
  assert.ok(hasAgent("refactorer"));

  const analyzer = getAgent("analyzer");
  assert.ok(Array.isArray(analyzer.allowedTools));
  assert.ok(analyzer.allowedTools.includes("read_file"));
  assert.ok(!analyzer.allowedTools.includes("write_file"), "analyzer must NOT have write access");
  assert.ok(!analyzer.allowedTools.includes("run_command"), "analyzer must NOT have shell access");
  assert.equal(analyzer.disableMcp, true);
  assert.ok(typeof analyzer.systemPromptOverride === "string");
  assert.ok(analyzer.systemPromptOverride.includes("read-only"));

  const refactorer = getAgent("refactorer");
  assert.ok(Array.isArray(refactorer.allowedTools));
  assert.ok(refactorer.allowedTools.includes("write_file"));
  assert.ok(refactorer.allowedTools.includes("replace_lines"));
  assert.ok(refactorer.allowedTools.includes("run_command"));
  assert.equal(refactorer.disableMcp, true);
  assert.ok(refactorer.systemPromptOverride.includes("Critical Extraction Rule"));
});
