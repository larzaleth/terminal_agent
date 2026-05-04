# Architecture

A concise tour of the codebase for contributors and curious users.

## Directory Layout

```text
/app
├── bin/
│   └── cli.js                  # readline CLI and one-shot agent mode
├── src/
│   ├── core/
│   │   ├── agents.js           # main agent loop
│   │   ├── prompter.js         # readline confirmation abstraction
│   │   ├── memory.js           # load/save/summarize + migration
│   │   ├── planner.js          # action plan generator
│   │   ├── transcript.js       # markdown export
│   │   └── agents/             # multi-agent registry + definitions
│   ├── llm/
│   │   ├── llm.js              # provider-neutral LLM facade
│   │   ├── cost-tracker.js     # multi-provider pricing + usage
│   │   └── providers/          # Gemini, OpenAI, Anthropic adapters
│   ├── rag/
│   │   ├── semantic.js         # chunking, embedding, search, index build
│   │   ├── cache.js            # embedding/response cache
│   │   └── watcher.js          # file watcher and debounced reindexing
│   ├── mcp/
│   │   └── client.js           # stdio MCP client and tool merging
│   ├── tools/
│   │   ├── tools.js            # built-in tool declarations + dispatcher
│   │   ├── handlers/           # per-tool handlers
│   │   ├── command-classifier.js
│   │   ├── shell-runner.js
│   │   ├── diff.js
│   │   └── search-utils.js
│   ├── commands/
│   │   ├── slash.js            # slash command router
│   │   └── handlers/           # slash command handlers
│   ├── config/
│   │   ├── config.js
│   │   ├── constants.js
│   │   ├── provider-env.js
│   │   └── prompts/
│   └── utils/
│       ├── utils.js
│       ├── backup.js
│       └── logger.js
├── tests/                      # node:test suite
├── docs/
├── agent.config.json
├── eslint.config.js
├── package.json
└── README.md
```

## Request Lifecycle

```text
user input
  -> bin/cli.js handles slash commands and interactive loop
  -> src/core/agents.js builds context and streams provider output
  -> planner may create a short plan for complex requests
  -> RAG may add relevant indexed context
  -> tools are dispatched from built-ins and MCP servers
  -> memory, transcript, and cost state are updated
```

## Core Concepts

### Agent Loop

`src/core/agents.js` streams provider events, accumulates tool calls, executes tools, appends tool results, and repeats until the model is done or `maxIterations` is reached.

### Normalized Messages

Messages use a provider-neutral shape:

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

Each provider adapter converts this shape to its native API format.

### Provider Interface

Adapters under `src/llm/providers/` implement streaming generation, one-shot generation, and embeddings. Adding a provider usually means adding an adapter, registering provider inference, adding prices, and covering conversions in tests.

### Config

`src/config/config.js` exports a mutable proxy. Runtime commands like `/model` and `/provider` update the active session without rewriting `agent.config.json`.

### MCP Integration

`src/mcp/client.js` connects configured MCP servers lazily, prefixes their tools by server name, and exposes them to the same dispatcher used for built-in tools.

## Safety Layers

1. Path safety rejects traversal and paths outside the workspace.
2. The tool dispatcher refuses unknown tools.
3. The command classifier blocks dangerous command patterns.
4. Write tools can ask for user confirmation before applying changes.
5. Delete and confirm-class commands require explicit confirmation unless YOLO mode is enabled.
6. Shell commands have timeouts and abort propagation.

## Testing Strategy

Tests use Node's built-in `node:test` runner. Coverage focuses on provider conversion, command classification, diff rendering, path safety, RAG chunking/cache behavior, tools, commands, agents, and memory.

Live provider calls and external MCP servers are intentionally not part of the unit suite.

## Performance Notes

- Pre-normalized embeddings make search cheap.
- Minified `index.json` keeps index storage smaller.
- In-memory index cache skips repeated disk parsing.
- Concurrency caps avoid provider rate-limit storms.
- Debounced watcher refresh keeps file writes responsive.
- Planner auto-skip saves an LLM call for simple prompts.

## Extension Points

- Add a tool in `src/tools/tools.js` and `src/tools/handlers/`.
- Add a provider under `src/llm/providers/`.
- Add a slash command in `src/commands/slash.js` and `src/commands/handlers/`.
- Add an agent definition under `src/core/agents/definitions/`.
- Add an MCP server in `agent.config.json`.
- Change prompts under `src/config/prompts/`.
