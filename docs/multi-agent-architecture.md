# 🤖 Multi-Agent Architecture

> **Status:** ✅ Implemented (Phase 1, Jan 2026). Clean parametrization — no monkey-patching.
>
> This document describes the pattern used by `terminal_agent` to run specialized **sub-agents** (read-only analyzer, security scanner, PR reviewer, …) on top of the existing provider / tool / loop-detection infrastructure.

---

## 1. Design Goals

1. **One agent loop, many agent personalities.** Reuse the battle-tested `runAgent` loop. No duplicated retry/streaming/loop-detection logic.
2. **Fail closed.** An agent that isn't supposed to write files must literally not have the tool — no runtime "permissions check", no way for a bad prompt to escape the sandbox.
3. **Composable.** Define an agent in ≤ 20 lines of JSDoc-shaped config. No class hierarchy, no decorators.
4. **Testable.** Swap the LLM provider with a stub and assert the agent's tool surface + system prompt in milliseconds.

---

## 2. The `AgentDefinition` contract

Every agent is just a plain object (see `src/core/agents/types.js`):

```js
/**
 * @typedef {Object} AgentDefinition
 * @property {string}    name                  Unique registry key, e.g. "analyzer".
 * @property {string}    description           One-line human-friendly summary.
 * @property {string[]}  [allowedTools]        Whitelist of tool names. Empty/undefined = all built-ins.
 * @property {boolean}   [disableMcp]          Hide MCP tools from this agent.
 * @property {string}    [systemPromptOverride] Replaces the default system prompt.
 * @property {string}    [model]               Override LLM model id.
 * @property {string}    [provider]            Override provider ("gemini" | "openai" | "anthropic").
 * @property {number}    [maxIterations]       Cap on agent-loop turns.
 * @property {boolean}   [skipPlanner]         Skip the `createPlan` step.
 * @property {boolean}   [skipRag]             Skip RAG context injection.
 */
```

---

## 3. Built-in agents

### `default`
Classic full-capability coding agent — all built-in tools + MCP, default senior prompt. This is what runs when you type a request in the main REPL without `/agent`.

```js
// src/core/agents/definitions/default.js
export const defaultAgent = {
  name: "default",
  description: "Full-capability coding agent — all built-in tools + MCP.",
  // No overrides: behaves exactly as before.
};
```

### `analyzer`
Read-only code auditor. **Cannot** write, edit, delete, or run anything — those tools are simply absent from its toolset. Produces structured audit output.

```js
// src/core/agents/definitions/analyzer.js
export const analyzerAgent = {
  name: "analyzer",
  description: "Read-only code auditor.",
  allowedTools: ["read_file", "list_dir", "grep_search", "get_file_info"],
  disableMcp: true,    // MCP tools could modify state
  skipRag: true,       // analyzer does its own exploration
  maxIterations: 50,
  systemPromptOverride: `You are a senior code auditor operating strictly in read-only mode. ...`,
};
```

### `refactorer`
Local write-capable refactoring agent. MCP is disabled so extraction and restructuring stay inside the repository. Use it for large mechanical refactors that would otherwise bloat the default prompt.

```js
// src/core/agents/definitions/refactorer.js
export const refactorerAgent = {
  name: "refactorer",
  description: "Focused refactoring agent.",
  allowedTools: ["read_file", "grep_search", "write_file", "replace_lines", "batch_edit", "run_command"],
  disableMcp: true,
  skipRag: true,
  maxIterations: 250,
  systemPromptOverride: `You are a senior refactoring agent. ...`,
};
```

---

## 4. How it works internally (no monkey-patching)

### 4.1 `runAgent(userInput, { definition })`

The main loop in `src/core/agents.js` accepts an optional `definition`. Two pure helpers do the heavy lifting:

```js
// Pseudo-code
async function buildToolset(definition) {
  const mcp = await getMcpTools();
  let handlers = { ...builtinTools };
  let decls = [...builtinDecls];

  if (definition?.allowedTools?.length) {
    const allow = new Set(definition.allowedTools);
    handlers = filterByKey(handlers, allow);
    decls    = decls.filter(d => allow.has(d.name));
  }

  const includeMcp = definition?.disableMcp !== true;
  return {
    schemas:  toJsonSchemaTools(includeMcp ? [...decls, ...mcp.decls] : decls),
    dispatch: (name, args) => {
      if (handlers[name]) return handlers[name](args);
      if (includeMcp && mcp.has(name)) return mcp.handler(name, args);
      return `Error: Tool '${name}' not available for this agent.`;
    },
  };
}

function resolveRuntime(definition) {
  const cfg = loadConfig();
  return {
    provider:          definition?.provider          || cfg.provider,
    model:             definition?.model             || cfg.model,
    maxIterations:     definition?.maxIterations     || cfg.maxIterations,
    systemInstruction: definition?.systemPromptOverride || getSystemPrompt(),
  };
}
```

The main loop reads these **pure locals** every turn — there is no mutable global tool registry being patched, no `try/finally` to restore state. Each `runAgent` call is hermetic.

### 4.2 The registry

`src/core/agents/registry.js` is a thin `Map<name, AgentDefinition>` with three guarantees:
- `registerAgent` rejects duplicates and invalid input.
- Definitions are `Object.freeze()`'d — no accidental mutation.
- `getAgent(unknown)` throws with the list of available names.

`src/core/agents/index.js` imports the registry + all built-in definitions, registers them (idempotently), and re-exports the registry API. Importing this module once is enough to make the CLI and slash command work.

---

## 5. How to create a new agent

1. Create `src/core/agents/definitions/<name>.js`:

```js
export const reviewerAgent = {
  name: "reviewer",
  description: "PR reviewer — reads git diff + related files and writes a review.",
  allowedTools: ["read_file", "grep_search", "get_file_info", "run_command"],
  // ... but only run_command for `git diff`/`git log`/`git blame` via custom prompt
  skipRag: true,
  systemPromptOverride: `You are a strict PR reviewer. Read the diff first with \`git diff HEAD~1\`, then ...`,
};
```

2. Register it in `src/core/agents/index.js`:

```js
import { reviewerAgent } from "./definitions/reviewer.js";
if (!hasAgent(reviewerAgent.name)) registerAgent(reviewerAgent);
```

3. Done. It's now invokable via:

```bash
myagent --agent reviewer "review the last commit"
# or inside a session:
/agent run reviewer review the last commit
```

4. Write a test (recommended — see `tests/agent-integration.test.js` for the pattern):

```js
test("reviewer agent never has write tools", () => {
  const def = getAgent("reviewer");
  const forbidden = ["write_file", "edit_file", "delete_file", "batch_edit"];
  for (const t of forbidden) {
    assert.ok(!def.allowedTools.includes(t));
  }
});
```

---

## 6. Agent library — candidates

| name | tools | purpose |
|---|---|---|
| `default` ✅ | all | classic full-capability agent |
| `analyzer` ✅ | read-only | audit codebase, emit prioritized task list |
| `refactorer` ✅ | local read/write + validation shell | mechanical refactors with backup-protected edits |
| `reviewer` | read + git-only shell | PR / last-commit reviewer |
| `test-writer` | read + write (tests/*) + npm test | auto-generate tests |
| `docs-generator` | read + write (docs/*) | auto-docs from JSDoc |
| `security-scanner` | read-only | secrets / injection / vuln pattern detection |
| `dep-auditor` | read + `npm audit` only | dep vuln check |
| `migration-helper` | read + batch_edit | syntax migrations (CJS → ESM, etc.) |

---

## 7. Inter-agent delegation (planned, P2)

Future work: a `delegate_to_agent` meta-tool so the **default** agent can spawn a read-only analyzer mid-task. See `IMPROVEMENTS.md` → "Inter-agent delegation tool".

```js
// src/tools/handlers/delegate.js  (planned)
import { getAgent } from "../../core/agents/index.js";
import { runAgent } from "../../core/agents.js";

export default async function ({ agent, request }) {
  const def = getAgent(agent);
  let output = "";
  await runAgent(request, {
    definition: def,
    onText: (t) => { output += t; },
  });
  return `[${agent} said]:\n${output}`;
}
```

Guard: cap recursion depth to 2 and enforce the sub-agent's `disableMcp` / tool allowlist via the existing mechanism.

---

## 8. Testing an agent

The test recipe in `tests/agent-integration.test.js` uses `_registerProviderForTests(name, stub)` to inject a stub provider. The stub records every `stream()` call so assertions can check:

- which tools are in the schema (`call.toolNames`)
- which system prompt the LLM saw (`call.systemInstruction`)
- which model was selected (`call.model`)

No real API calls, no API keys — runs in a few milliseconds.

```js
import { _registerProviderForTests } from "../src/llm/providers/index.js";
import { runAgent } from "../src/core/agents.js";

const stub = { capturedCalls: [], async *stream(opts) { this.capturedCalls.push(opts); /* yield events */ } };
_registerProviderForTests("gemini", stub);

await runAgent("hello", { definition: getAgent("analyzer") });
assert.deepEqual(stub.capturedCalls[0].toolNames.sort(), ["get_file_info", "grep_search", "list_dir", "read_file"]);
```

---

## 9. FAQ

**Q: Why not use a class hierarchy?**
A: JavaScript inheritance adds ceremony without benefits here. A frozen plain object is smaller, more composable, and trivially testable.

**Q: Why reuse `runAgent` instead of writing per-agent loops?**
A: Streaming, retry, loop detection, memory compression, cost tracking, and MCP merge are all non-trivial. Duplicating would mean 5× the bug surface.

**Q: Can I override the system prompt but keep the git/cwd/os context?**
A: Not today. `systemPromptOverride` fully replaces `getSystemPrompt()`. If you need the dynamic context, include it manually in your override string or call `getSystemPrompt()` yourself and append. (This is P2 — might become `systemPromptSuffix` / `systemPromptPrefix`.)

**Q: Can agents spawn agents?**
A: Not yet — see §7. The registry + `runAgent` already supports it technically; we just haven't exposed a safe tool for it.

**Q: How do I pass arbitrary state to an agent?**
A: Via the user message. Agents are stateless — they see only the request and the codebase. For persistent state, use the existing memory/session machinery.
