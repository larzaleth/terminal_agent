# Slash Commands

Every command starts with `/`. Type `/help` in-session to see the full list.

| Command | Alias | Purpose |
|---|---|---|
| [`/help`](#help) | — | Show all available commands |
| [`/clear`](#clear) | — | Reset conversation memory |
| [`/index`](#index-folder) | — | Build semantic index |
| [`/config`](#config) | — | Show active configuration |
| [`/model`](#model-id) | `/switch` | Show or change active model |
| [`/provider`](#provider-name) | — | Show or switch LLM provider |
| [`/cache`](#cache) | — | Manage embedding/response cache |
| [`/cost`](#cost) | — | View cost reports |
| [`/save`](#save-file) | — | Export transcript to markdown |
| [`/mcp`](#mcp) | — | Manage MCP server connections |
| [`/agent`](#agent) | `/agents` | List / inspect / invoke specialized agents |
| `exit` / `quit` | — | Leave the agent |

---

## `/help`

Prints the full list of commands with short descriptions.

```
🧑 > /help
```

## `/clear`

Clears the in-memory conversation history and wipes `memory.json`. Start fresh.

```
🧑 > /clear
✅ Memory cleared.
```

Use this when:
- Context is getting stale / off-track
- You want to reset before a new task
- The agent is confusing itself with old info

## `/index <folder>`

Builds a semantic embedding index of all code files in the given folder. Required before the agent can use RAG for that codebase.

```
🧑 > /index /path/to/my-project
🚀 Starting batch indexing for 47 files...
📄 Indexing: /path/to/my-project/src/server.js (3 chunks)
...
✅ Index saved with 312 embeddings in 8.3s
```

The index is saved as `index.json` in your current working directory. Cached embeddings (in `.agent_cache/`) mean re-indexing unchanged files is near-instant.

**Files included:** `.js .ts .jsx .tsx .mjs .cjs .py .json .md`
**Ignored:** `node_modules .git dist build __pycache__ .venv coverage .agent_cache` + any dir starting with `.`

See [Semantic RAG](./rag.md) for tuning.

## `/config`

Prints the current configuration JSON (merged from `agent.config.json` + session overrides).

```
🧑 > /config
⚙️ Current Configuration:
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  ...
}
```

## `/model [id]`

**Without args:** show current model & provider.

```
🧑 > /model
🤖 Current model:
  Provider: gemini
  Model:    gemini-2.5-flash
```

**With args:** switch model (and auto-infer provider).

```
🧑 > /model gpt-4o-mini
✅ Switched to openai:gpt-4o-mini (session only — edit agent.config.json to persist)

🧑 > /model claude-3-5-haiku-latest
✅ Switched to anthropic:claude-3-5-haiku-latest

🧑 > /model gemini-2.0-flash
✅ Switched to gemini:gemini-2.0-flash
```

**Explicit provider prefix:**

```
🧑 > /model openai:o1-mini
🧑 > /model anthropic:claude-3-5-sonnet-latest
```

Inference rules:
- `gemini-*` → `gemini`
- `gpt-*`, `o1*`, `o3*`, `text-embedding-3-*` → `openai`
- `claude-*` → `anthropic`

> ⚠️ Session-only. Edit `agent.config.json` to persist.

## `/provider [name]`

**Without args:** show current provider.

**With args:** switch provider only (keep model field untouched — run `/model` after to set a matching model).

```
🧑 > /provider openai
✅ Provider switched to openai. Run /model <id> to pick a model for this provider.

🧑 > /model gpt-4o-mini
```

Valid names: `gemini`, `openai`, `anthropic` (`claude` is an alias for `anthropic`).

## `/cache`

Manage the embedding / LLM response cache (`.agent_cache/`).

| Sub-command | Effect |
|---|---|
| `/cache stats` | Show count, size, valid/expired breakdown |
| `/cache clear` | Delete all cached entries |
| `/cache clean` | Delete only expired entries (TTL = 1 hour) |

```
🧑 > /cache stats
💾 Cache Statistics:
  Total Items: 847
  Valid Items: 412
  Expired Items: 435
  Total Size: 18432.15 KB
  TTL: 1 hour(s)
```

Cache is automatically evicted when it exceeds **5000 entries** (oldest-first).

## `/cost`

| Sub-command | Effect |
|---|---|
| `/cost report` | Detailed breakdown of current session |
| `/cost history [n]` | Show last `n` sessions from `cost-report.json` (default 10) |
| `/cost reset` | Reset current session counters |

```
🧑 > /cost report
==================================================
💰 SESSION COST REPORT
==================================================

📊 Token Usage:
  Input Tokens:  12,435
  Output Tokens: 3,218
  API Calls:     14

🔍 Embeddings:
  Tokens:        4,127
  API Calls:     23

💾 Cache Performance:
  Cache Hits:    12
  Cache Misses:  23
  Hit Rate:      34.3%

💵 Estimated Cost:
  Generation:    $0.000474
  Embeddings:    $0.000041
  Total:         $0.000515

⏱️  Session Duration: 145.3s
==================================================
```

Cost history is appended to `cost-report.json` (last 100 sessions kept).

See [Cost Tracking](./cost-tracking.md) for pricing details.

## `/save [file]`

Export the current session's conversation to a clean markdown transcript. Great for:
- Documenting debugging sessions
- Sharing agent outputs with teammates
- Creating tutorials / blog posts

```
🧑 > /save my-auth-refactor.md
✅ Transcript saved: /path/to/my-auth-refactor.md
   42 messages, 18.3 KB
```

**Without a filename:** defaults to `transcript-<timestamp>.md`.

**Output format:**

```markdown
# Agent Session Transcript
_Exported: 2026-01-16T10:34:21.883Z_
_Messages: 42_

---

## 🧑 User
Refactor the auth middleware

---

## 🤖 Assistant
I'll start by reading the current implementation.

**🔧 Tool call:** `read_file`

```json
{ "path": "src/middleware/auth.js" }
```

---

## 🔧 Tool
**📤 Tool result:**
```
1: import jwt from "jsonwebtoken";
...
```
```

## `/mcp`

Without args, **connects** to all MCP servers in `agent.config.json` and lists their tools:

```
🧑 > /mcp
🔌 MCP connected: github (26 tools)
🔌 MCP connected: filesystem (8 tools)

🔌 MCP Servers:
  github (26 tools)
    • github.create_issue
    • github.search_repositories
    • github.get_file_contents
    ...
  filesystem (8 tools)
    • filesystem.read_file
    • filesystem.write_file
    ...
```

`/mcp stop` — gracefully disconnect all servers.

```
🧑 > /mcp stop
🔌 MCP disconnected: github
🔌 MCP disconnected: filesystem
🔌 All MCP servers disconnected.
```

See [MCP Servers](./mcp.md) for setup.

## `/agent`

List, inspect, or invoke a specialized agent. Agents are **scoped sub-configurations** of the main agent loop — each with its own toolset, system prompt, and (optionally) model / provider.

### Subcommands

```
/agent               # same as /agent list
/agent list          # show registered agents
/agent info <name>   # show full definition (tools, model, prompt preview)
/agent run <name> <your request>   # invoke inline
```

### Example

```
🧑 > /agent list

🤖 Registered agents:

  default      (tools: all)  Full-capability coding agent — all built-in tools + MCP.
  analyzer     (tools: 4)    Read-only code auditor.
  refactorer   (tools: 11)   Focused refactoring agent.

🧑 > /agent run analyzer audit src/core and list P0 issues

🤖 Invoking 'analyzer' agent...
  ⟳ list_dir {"dir":"src/core"}
  ✓ list_dir  agents.js  memory.js  planner.js  transcript.js
  ⟳ read_file {"path":"src/core/agents.js"}
  ...
```

### Built-in agents

- **`default`** — classic full-capability coding agent (all tools, senior prompt).
- **`analyzer`** — read-only auditor. Cannot write, edit, delete, or run anything.
- **`refactorer`** — local write-capable refactoring agent for extraction, modularization, and restructuring.

### Creating your own

Add a file under `src/core/agents/definitions/<name>.js` following the [`AgentDefinition`](../src/core/agents/types.js) shape, then register it in `src/core/agents/index.js`. See [`docs/multi-agent-architecture.md`](./multi-agent-architecture.md) for the full pattern.

### One-shot CLI mode

Skip the interactive session entirely:

```bash
myagent --agent analyzer "audit src/core"
myagent --agent refactorer "split src/App.jsx into components"
myagent --agent analyzer . > audit.md
```

Output goes to stdout, progress/tool-calls to stderr — perfect for redirecting or piping.

## Exit Commands

- `exit`
- `quit`
- `Ctrl+C`

All three trigger graceful shutdown: MCP connections are closed cleanly before the process exits.
