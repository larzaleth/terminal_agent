# Architecture

A tour of the codebase for contributors and curious users.

## 🗺️ Directory Layout

```
/app
├── bin/
│   └── cli.js                  # entrypoint — REPL loop
├── src/
│   ├── core/
│   │   ├── agents.js           # main agent loop (provider-agnostic)
│   │   ├── memory.js           # load/save/summarize + legacy migration
│   │   ├── planner.js          # step-by-step plan generator (short-request skip)
│   │   └── transcript.js       # markdown export
│   ├── llm/
│   │   ├── llm.js              # legacy-compat router
│   │   ├── cost-tracker.js     # multi-provider pricing + usage
│   │   └── providers/
│   │       ├── base.js         # interface + schema converter
│   │       ├── gemini.js       # Gemini adapter
│   │       ├── openai.js       # OpenAI adapter
│   │       ├── anthropic.js    # Anthropic adapter
│   │       └── index.js        # factory + cache + inferProvider()
│   ├── rag/
│   │   ├── semantic.js         # chunking, embedding, search, index build
│   │   └── cache.js            # embedding cache with TTL + LRU eviction
│   ├── mcp/
│   │   └── client.js           # stdio MCP client, tool merging
│   ├── tools/
│   │   ├── tools.js            # 9 built-in tools (file ops, run_command)
│   │   ├── command-classifier.js  # auto/confirm/blocked verdict
│   │   └── diff.js             # colored unified diff renderer
│   ├── commands/
│   │   └── slash.js            # /help /model /save /mcp …
│   ├── config/
│   │   ├── config.js           # lazy singleton + mutable Proxy
│   │   └── constants.js        # all tunables in one file
│   └── utils/
│       └── utils.js            # path safety, retry, tool classification
├── tests/                      # 36 unit tests via node:test
├── docs/                       # this documentation
├── agent.config.json           # user-editable runtime config
├── eslint.config.js            # ESLint 9 flat config
├── package.json
└── README.md
```

## 🔄 Request Lifecycle

When you type a message and press Enter:

```
 user input
      │
      ▼
 ┌─────────────────┐
 │  cli.js (bin)   │  handle slash commands, spin up ora, call runAgent
 └────────┬────────┘
          │
          ▼
 ┌───────────────────┐
 │  agents.js        │
 ├───────────────────┤
 │  1. createPlan    │── (skipped for short msgs)  planner.js → provider.generate
 │  2. loadIndex     │── RAG retrieval               semantic.js
 │  3. search        │── embed query, dot product   semantic.js
 │  4. build prompt  │── inject RAG context
 │  5. agent loop:   │
 │     provider      │── stream text + tool_calls  providers/*.js
 │      .stream()    │
 │     execute tools │── builtin + MCP merged      tools.js + mcp/client.js
 │     loop ← results                                (until no more tool calls)
 │  6. saveMemory    │── possibly summarize         memory.js → provider.generate
 │  7. trackCost     │── persist usage              cost-tracker.js
 └───────────────────┘
```

## 🧠 Core Concepts

### The Agent Loop

Implemented in `src/core/agents.js`. Pseudo-code:

```js
while (iterations < maxIterations) {
  const stream = provider.stream({ model, systemInstruction, messages, tools });

  for await (const evt of stream) {
    if (evt.type === "text") emitText(evt.text);
    if (evt.type === "tool_call") toolCalls.push(evt);
    if (evt.type === "usage") usage = evt;
  }

  trackCost(usage);
  memory.push({ role: "assistant", blocks: [text, ...toolCalls] });

  if (toolCalls.length === 0) break;     // model is done

  // Run tool calls (reads parallel, writes serial, cap=5)
  const results = await executeTools(toolCalls);
  memory.push({ role: "tool", blocks: results });
}
```

Each iteration = one LLM round-trip + zero-or-more tool executions. The loop ends when:
- The model emits text with no tool calls (it's answering you), **or**
- `maxIterations` is hit (safeguard).

### Normalized Message Format

To support multiple providers cleanly, messages are stored in a neutral shape:

```js
{
  role: "user" | "assistant" | "tool",
  blocks: [
    { type: "text", text: "..." },
    { type: "tool_call", id: "call_xxx", name: "read_file", args: { path: "..." } },
    { type: "tool_result", id: "call_xxx", name: "read_file", output: "..." }
  ]
}
```

Each provider adapter converts this to its native format:
- Gemini → `{role, parts: [...]}` with `functionCall`/`functionResponse`
- OpenAI → `{role, content, tool_calls, tool_call_id}`
- Anthropic → `{role, content: [{type: "text"|"tool_use"|"tool_result", ...}]}`

Conversion is **pure** and **stateless** — no side effects. Tested in `tests/providers.test.js`.

### Provider Interface

`src/llm/providers/base.js` documents the contract. Each adapter implements:

```ts
class Provider {
  async *stream({ model, systemInstruction, messages, tools }):
    AsyncIterator<{type: "text", text} | {type: "tool_call", id, name, args} | {type: "usage", inputTokens, outputTokens}>;

  async generate({ model, prompt, temperature }): Promise<string>;

  async embed(text): Promise<number[]>;
}
```

Adding a new provider (Mistral, Cohere, Groq…):
1. Create `src/llm/providers/yourprovider.js` implementing this interface.
2. Register in `src/llm/providers/index.js` (`getProvider()` switch + `inferProvider()` prefix rules).
3. Add pricing entries in `src/llm/cost-tracker.js`.
4. Write tests in `tests/providers.test.js`.

That's it — no changes needed in `agents.js`, `memory.js`, or anywhere else.

### Config as a Mutable Proxy

`src/config/config.js` exports `config` as a Proxy backed by a singleton object. It's loaded lazily (not on import), and both **reads and writes** are intercepted.

This lets `/model` and `/provider` mutate the config in-memory without touching the disk:

```js
config.model = "gpt-4o-mini";   // session-only, not persisted
```

To persist: edit `agent.config.json` manually.

### Embedding Cache

`src/rag/cache.js`:
- Hash key = MD5(model + text)
- TTL = 1 hour (default)
- LRU eviction when count > 5000
- Each entry stored as individual JSON file under `.agent_cache/`

Chosen as files (vs single DB) for simplicity and filesystem-level durability. Cache reads are `JSON.parse` of a small file — fast enough for embedding-heavy workloads.

### Command Classifier

`src/tools/command-classifier.js`:
- Regex-based blocklist for known dangerous patterns
- Allowlist by first token (ls, git, npm, etc.)
- Exception list for unsafe sub-commands (`git push`, `npm install`, etc.)
- Pipes/redirects force `confirm` regardless

Return type: `{ verdict: "auto" | "confirm" | "blocked", reason: string }`.

Unit-tested exhaustively in `tests/command-classifier.test.js` (12 cases).

### MCP Integration

`src/mcp/client.js`:
- Spawns stdio transport for each configured server at first `/mcp` use (lazy, not on startup).
- Calls `listTools()` on connect; tools are registered with a `serverName.` prefix.
- Exposes `getMcpTools()` which returns `{ decls, has, handler }` — consumed by `agents.js` and merged with built-ins.
- `shutdownMcp()` is called on exit / `/mcp stop`.

The agent loop doesn't care whether a tool is built-in or MCP — `dispatchTool(name, args)` picks the right handler.

## 🔐 Safety Layers

From outermost to innermost:

1. **Input sanitization** — `isSafePath()` rejects traversal / absolute-outside-cwd.
2. **Tool dispatcher** — refuses unknown tool names.
3. **Command classifier** — blocks dangerous patterns, auto-allows safe ones.
4. **Diff preview** — interactive confirmation on `edit_file`.
5. **User confirmation** — `delete_file` always asks; `confirm` commands ask.
6. **Spawn timeout** — `run_command` killed after 60s.

See [Security](./security.md) for details.

## 🧪 Testing Strategy

36 unit tests across 5 files, all running on Node's built-in test runner (`node --test`).

| File | Coverage |
|---|---|
| `chunking.test.js` | Smart line-based chunker, overlap, empty handling |
| `command-classifier.test.js` | Block/auto/confirm verdicts across 12 scenarios |
| `diff.test.js` | Stats counting + visual output sanity |
| `providers.test.js` | Provider inference + schema conversion (OBJECT→object) |
| `utils.test.js` | Path safety (traversal, absolute, null), retry (429), format helpers |

Tests run in ≈150ms. No mocking framework — pure Node assertions.

**What's NOT tested (intentionally):**
- Live provider calls (requires keys, flaky on network).
- MCP server lifecycle (requires actual MCP server binaries).
- Interactive prompts (readline in tests is awkward).

Integration testing of these is done manually — see [Contributing](./contributing.md).

## 🎯 Performance Notes

The biggest wins come from:

- **Pre-normalized embeddings** — search uses dot product, not cosine. ~2-3× speedup on large indexes.
- **Minified `index.json`** — embedded float arrays are huge; skipping indentation cuts file 5-10×.
- **In-memory index cache** — `loadIndex()` caches by mtime; subsequent loads skip disk I/O.
- **Concurrency caps via `p-limit`** — prevents 429 storms while keeping parallelism.
- **Embedding cache** — repeated `/index` runs with unchanged chunks cost zero API calls.
- **Planner auto-skip** — requests < 15 words bypass the planner entirely (~500ms + 1 API call saved per trivial prompt).

## 🧭 Design Principles

1. **Pragmatic over perfect** — prefer a simple correct solution over a clever complex one.
2. **Fail fast, fail visibly** — no silent fallbacks that mask bugs. Errors surface with actionable tips.
3. **Provider-neutral by construction** — adding a new LLM shouldn't require touching the loop.
4. **Tests guard behavior, not implementation** — refactors should rarely touch test files.
5. **Security by default** — every tool has a kill-switch; dangerous commands are blocked, not warned.
6. **DX first** — streaming output, live spinners, clear error messages, diff previews.

## 📦 Dependencies

Minimal runtime deps:

| Package | Why |
|---|---|
| `@google/genai` | Gemini SDK |
| `openai` | OpenAI SDK |
| `@anthropic-ai/sdk` | Anthropic SDK |
| `@modelcontextprotocol/sdk` | MCP client |
| `dotenv` | Env file loading |
| `chalk` | Terminal colors |
| `ora` | Loading spinner |
| `p-limit` | Concurrency control |
| `diff` | Unified diff for `edit_file` preview |

Dev-only:

| Package | Why |
|---|---|
| `eslint` + `eslint-config-prettier` + `globals` | Linting |
| `prettier` | Formatting |

## 🌱 Extension Points

- **Add a tool:** append to `src/tools/tools.js` (handler + declaration).
- **Add a provider:** see [Provider Interface](#provider-interface) above.
- **Add a slash command:** add a case to the switch in `src/commands/slash.js`.
- **Add an MCP server:** just edit `agent.config.json` — no code changes.
- **Change chunking strategy:** edit `src/rag/semantic.js:chunkText()`.
- **Change system prompt:** edit `src/config/config.js:getSystemPrompt()`.
- **Add more languages to indexer:** edit `CODE_EXTS` in `src/config/constants.js`.
