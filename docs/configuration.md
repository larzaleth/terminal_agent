# Configuration

All persistent settings live in **`agent.config.json`** at the project root (next to `package.json`). The file is auto-loaded on every run.

## Default Configuration

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "plannerModel": "gemini-2.5-flash",
  "summaryModel": "gemini-2.5-flash",
  "maxIterations": 25,
  "maxMemoryTurns": 20,
  "mcpServers": {}
}
```

## Fields

### `provider` _(string, default: `"gemini"`)_
Which LLM backend to use. One of:
- `"gemini"` — Google Gemini
- `"openai"` — OpenAI Chat Completions
- `"anthropic"` — Anthropic Claude

See [Providers](./providers.md) for setup.

### `model` _(string, default: `"gemini-2.5-flash"`)_
Model ID for the main agent loop. Must be compatible with the chosen provider.

Examples:
- Gemini: `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`
- OpenAI: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`, `o1-mini`, `o3-mini`
- Anthropic: `claude-3-5-haiku-latest`, `claude-3-5-sonnet-latest`, `claude-3-opus-latest`

### `plannerModel` _(string)_
Model used to generate step-by-step plans for each user request. Kept separate so you can use a cheap/fast model here (planning is lightweight).

Requests with fewer than **15 words** skip the planner entirely — no API call.

### `summaryModel` _(string)_
Model used to compress old conversation history when memory exceeds `maxMemoryTurns`. Again, cheap/fast is fine.

### `embeddingProvider` _(string, optional)_
Override the provider used for RAG embeddings. Valid values:
- `"gemini"`
- `"openai"`

If omitted, embeddings follow the main `provider`, except `anthropic` automatically falls back to Gemini or OpenAI.

### `embeddingModel` _(string, optional)_
Override the embedding model used by `/index` and semantic search.

Examples:
- Gemini: `text-embedding-004`
- OpenAI: `text-embedding-3-small`, `text-embedding-3-large`

### `maxIterations` _(number, default: `25`)_
Maximum number of agent-loop cycles per user request. Each cycle = 1 LLM call + any resulting tool executions.

Hitting this limit emits `⚠️ Max iterations reached` and ends the turn. Raise if the agent routinely runs out of steps on complex tasks.

### `maxMemoryTurns` _(number, default: `20`)_
When `memory.length > maxMemoryTurns`, older messages are LLM-summarized into a single context block. Keeps token costs bounded on long sessions.

### `mcpServers` _(object, default: `{}`)_
Map of MCP servers to auto-connect. See [MCP Servers](./mcp.md) for the full schema.

```json
"mcpServers": {
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
  }
}
```

## Environment Variables

Stored in `~/.myagent.env` (auto-created on first run) or `./.env` (project-local override). The agent loads both at startup.

| Variable | Used by | Required |
|---|---|---|
| `GEMINI_API_KEY` | Gemini provider and Gemini embedding fallback | Yes (for default config) |
| `OPENAI_API_KEY` | OpenAI provider and OpenAI embedding fallback | If `provider: "openai"` or using OpenAI embeddings |
| `OPENAI_BASE_URL` | Override OpenAI endpoint (Azure, proxies) | No |
| `ANTHROPIC_API_KEY` | Anthropic provider | If `provider: "anthropic"` |
| `ANTHROPIC_BASE_URL` | Override Anthropic endpoint | No |
| `MYAGENT_EMBEDDING_PROVIDER` | Session-only override for `embeddingProvider` | No |
| `MYAGENT_EMBEDDING_MODEL` | Session-only override for `embeddingModel` | No |
| `MYAGENT_WINDOWS_SHELL` | Set to `cmd` to force `run_command` to use Command Prompt on Windows | No |
| `MYAGENT_POWERSHELL_PATH` | Override the PowerShell executable used by `run_command` on Windows | No |
| `MYAGENT_AUTO_APPROVE_EDITS` | Set `1` to skip diff preview confirmation | No |

Example `~/.myagent.env`:

```env
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Session-only Overrides

Slash commands let you override config in-memory without persisting:

```
/model gpt-4o-mini      # switch model (and infer provider if needed)
/provider anthropic     # switch provider only
```

These changes last until the session ends. To persist, edit `agent.config.json`.

## Multi-project Setups

Each project can have its own `agent.config.json`. When `myagent` starts, it reads the file from `process.cwd()` — so `cd`'ing into different repos gives you different configs automatically.

Tip: you can also put project-specific `.env` files in each repo. They're merged **on top** of the global `~/.myagent.env`.

## Inspecting current config

```
🧑 > /config

⚙️ Current Configuration:
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  ...
}
```
