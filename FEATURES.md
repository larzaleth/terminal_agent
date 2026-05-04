# 📋 Feature List — AI Coding Agent (`myagent`)

> Complete feature inventory for **v2.5.1**. Every item is implemented and shipping.

---

## 🤖 Multi-Provider LLM Support

| Feature | Details |
|---|---|
| **Google Gemini** | Default provider. Supports Gemini 3.1 Pro, 3 Flash, 2.5 Flash, 2.0 Flash, 1.5 Pro/Flash families |
| **OpenAI** | GPT-4o, GPT-4.1, GPT-4.1 Mini, o1, o1-mini, o3-mini |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus |
| **Hot-swap** | Switch provider/model mid-session with `/model` or `/provider` — no restart needed |
| **Dedicated model roles** | Separate models for generation (`model`), planning (`plannerModel`), and memory summarization (`summaryModel`) |
| **Fuzzy pricing** | Cost tracker auto-matches model prefixes for accurate billing across all providers |

---

## 🎨 Rich Terminal UI (TUI)

| Feature | Details |
|---|---|
| **Ink-based multi-pane layout** | Header, chat pane, sidebar, input box, and dynamic footer |
| **Live streaming** | Text tokens and shell output stream in real-time — no silent waits |
| **Expandable tool blocks** | Each tool call is collapsed by default; navigate with ↑↓, expand with Space/Enter |
| **Interactive diff preview** | Colored unified diff before every edit — `a` approve, `r` reject, `e` edit manually |
| **Confirm prompt** | `run_command` and `delete_file` require explicit y/n/Esc confirmation |
| **Sidebar** | Real-time provider info, cost & token counter, recent tools history (last 5) |
| **Sparkline graph** | Visual token usage trend in the sidebar |
| **Mouse support** | Click-to-interact with tool blocks and UI elements |
| **Clipboard integration** | OSC 52 terminal escape — `/copy last`, `/copy tool`, `/copy turn`, `/copy all` |
| **Hybrid mode detection** | Auto-detects TTY → TUI mode; non-TTY → readline REPL. Force via `--tui` / `--no-tui` |
| **Fallback readline REPL** | Full-featured readline mode for CI, piped input, and non-TTY environments |

---

## 🧠 Smart Planning & Context

| Feature | Details |
|---|---|
| **LLM-powered planner** | Automatically creates 3-6 step action plans for complex tasks |
| **Auto-skip for simple requests** | Requests under 15 words bypass the planner to save latency and tokens |
| **Git-aware system prompt** | Auto-includes branch name, status, and last commit in system instructions |
| **Adaptive context window** | Auto-summarizes memory when turns exceed limit or tokens exceed 50K threshold |
| **LLM-powered memory summarization** | Dedicated summary model compresses old conversation turns while preserving key context |
| **Configurable prompt versions** | Switch between `senior-v1.production` and `standard` prompt styles |

---

## 🔍 Semantic RAG (Retrieval-Augmented Generation)

| Feature | Details |
|---|---|
| **Line-based smart chunking** | 40-line chunks with 5-line overlap — preserves code semantics |
| **Pre-normalized embeddings** | Vectors normalized at index time; search uses fast dot product |
| **Batch embedding API** | 5-10x faster indexing via batched embedding calls |
| **In-memory index cache** | Mtime-based invalidation — avoids re-parsing JSON on every request |
| **Auto-reindex file watcher** | Chokidar-based file watcher auto-updates the semantic index on file changes |
| **Response caching** | LRU-ish cache with 5000-entry cap and TTL-based eviction |

---

## 🔧 Built-in Tools (10 tools)

| Tool | Type | Description |
|---|---|---|
| `read_file` | Read-only | Read file content with line numbers |
| `list_dir` | Read-only | List files and folders to explore project structure |
| `grep_search` | Read-only | Search patterns across files recursively (ripgrep + fallback) |
| `get_file_info` | Read-only | Get file metadata (size, dates, extension) without reading content |
| `write_file` | Write | Write full content to a file with auto-created parent directories |
| `edit_file` | Write | Find-and-replace editing with diff preview and multi-occurrence safety |
| `batch_edit` | Write | Apply multiple edits across multiple files in a single turn |
| `create_dir` | Write | Create directories recursively |
| `delete_file` | Write | Delete files with user confirmation |
| `run_command` | Write | Execute shell commands with smart classification and streaming output |

---

## 🎮 Slash Commands (20 commands)

| Command | Purpose |
|---|---|
| `/help` | List all available commands |
| `/clear` / `/new` / `/reset` | Start a fresh conversation (clears context) |
| `/index <folder>` | Build semantic index for a folder |
| `/model [id]` | Show or switch LLM model (auto-infers provider) |
| `/switch [id]` | Alias for `/model` |
| `/provider [name]` | Switch LLM provider only |
| `/save [file]` | Export session transcript to markdown |
| `/cost` | Cost tracking — `report`, `history`, `reset` |
| `/cache` | Cache management — `stats`, `clear`, `clean` |
| `/config` | Show current configuration |
| `/mcp` | List/connect MCP servers and their tools |
| `/yolo [on\|off]` | Toggle full automation (no permission prompts) |
| `/copy` | Copy to clipboard — `last`, `tool`, `turn`, `all` (TUI-only) |
| `/undo` | Restore last file backup(s) — `/undo [N]`, `/undo list` |
| `/session` | Session management — `list`, `save <name>`, `resume <name>`, `delete <name>` |
| `/list` | List all saved sessions (shortcut for `/session list`) |
| `/resume <name>` | Resume a saved session (shortcut for `/session resume`) |
| `/load <name>` | Alias for `/resume` |
| `/agent` | Multi-agent system — `list`, `info <name>`, `run <name> <request>` |
| `/agents` | Alias for `/agent` |
| `exit` / `quit` | Exit the agent |

---

## 🤖 Multi-Agent Architecture

| Feature | Details |
|---|---|
| **Agent definition system** | Declarative plain-object configs with tool whitelisting, prompt override, model/provider override |
| **Agent registry** | In-memory `Map<name, AgentDefinition>` with duplicate rejection and `Object.freeze()` |
| **Built-in: `default`** | Full-capability coding agent — all tools + MCP |
| **Built-in: `analyzer`** | Read-only code auditor — `read_file`, `list_dir`, `grep_search`, `get_file_info` only |
| **One-shot CLI mode** | `myagent --agent analyzer "audit src/"` — runs agent and exits |
| **Inline invocation** | `/agent run analyzer audit the codebase` — runs agent within an active session |
| **Custom agents** | Drop a definition in `src/core/agents/definitions/`, register, and it's ready |
| **Hermetic execution** | Each agent run gets its own toolset — no global state mutation |

---

## 🔌 MCP (Model Context Protocol)

| Feature | Details |
|---|---|
| **stdio transport** | Connect to MCP servers via stdio |
| **Multi-server support** | Multiple servers with per-server tool prefixing |
| **Transparent tool merge** | MCP tools merged seamlessly with built-in tools in the agent loop |
| **`/mcp` and `/mcp stop`** | List connected servers or disconnect |
| **Per-agent MCP control** | Agents can disable MCP via `disableMcp: true` |

---

## 💰 Cost Tracking

| Feature | Details |
|---|---|
| **Real-time cost calculation** | Uses actual `usageMetadata` from each provider (not estimates) |
| **Multi-currency** | Displays cost in USD and IDR |
| **Per-session tracking** | Live cost counter in TUI header and sidebar |
| **Persistent history** | `cost-report.json` stores up to 1000 requests with automatic migration |
| **Cost commands** | `/cost report` (current session), `/cost history` (past N), `/cost reset` |
| **Per-agent cost tracking** | `/agent run` reports cost and duration for each agent invocation |

---

## 🛡️ Safety & Reliability

| Feature | Details |
|---|---|
| **Path traversal protection** | `isSafePath()` blocks absolute paths outside project and `..` traversal |
| **Command classifier** | Smart 3-tier system: `blocked` (dangerous), `auto` (safe read-only), `confirm` (everything else) |
| **YOLO Mode** | `/yolo on` bypasses all permission prompts for commands, deletions, and edits (caution advised) |
| **Automatic file backups** | Every `write_file`, `edit_file`, and `batch_edit` creates a timestamped backup in `.agent_backups/` |
| **Atomic file writes** | Temp file → rename pattern prevents corruption during crashes |
| **Multi-occurrence detection** | `edit_file` and `batch_edit` refuse ambiguous edits when target string appears multiple times |
| **Undo/rollback** | `/undo` restores last backup(s); `/undo list` shows recent backups |
| **Loop detection** | Sliding window (5 calls) detects repeated tool calls (≥3 dupes) and forces stop |
| **Persistent failure detection** | 3 consecutive tool failures trigger graceful stop with summary |
| **Max iterations guard** | Configurable cap (default: 50) prevents runaway agent loops |
| **API key security** | `~/.myagent.env` written with `0o600` (owner-only read/write) |
| **Graceful SIGINT** | Ctrl+C exits cleanly with MCP shutdown, watcher stop, and no stack trace |
| **Retry with exponential backoff** | Auto-retries on 429/503/502/ECONNRESET with jittered delay |

---

## 📝 Session & Memory Management

| Feature | Details |
|---|---|
| **Session persistence** | Save and resume conversations across terminal restarts |
| **Named sessions** | `/session save debug-task` → `/resume debug-task` |
| **Session listing** | `/list` shows all saved sessions with timestamps |
| **Session deletion** | `/session delete <name>` cleans up old sessions |
| **Memory auto-migration** | Legacy Gemini `{role, parts}` format auto-migrates to normalized `{role, blocks}` |
| **Transcript export** | `/save session.md` exports clean markdown with tool calls rendered |

---

## ⚙️ Configuration

| Feature | Details |
|---|---|
| **`agent.config.json`** | Per-project config: provider, model, plannerModel, summaryModel, maxIterations, mcpServers |
| **Environment variable overrides** | `MYAGENT_PROVIDER`, `MYAGENT_MODEL`, `MYAGENT_PLANNER_MODEL`, `MYAGENT_SUMMARY_MODEL` |
| **Runtime mutation via Proxy** | `/model` and `/provider` mutate config in-memory without touching disk |
| **Global env file** | `~/.myagent.env` for API keys (auto-created on first run) |
| **Debug mode** | `MYAGENT_DEBUG=1` enables structured logging via `logger.js` |
| **Auto-approve edits** | `MYAGENT_AUTO_APPROVE_EDITS=1` skips diff confirmation (for CI) |
| **Windows shell config** | `MYAGENT_WINDOWS_SHELL=cmd` switches from PowerShell to cmd.exe |

---

## 🧪 Development & Testing

| Feature | Details |
|---|---|
| **Unit tests** | 14 test files covering utils, tools, commands, UI, agents, providers, memory, clipboard |
| **Node.js built-in test runner** | `node --test` — no framework dependency |
| **Ink testing library** | UI component tests via `ink-testing-library` |
| **ESLint 9** | Flat config for linting (`yarn lint`) |
| **Prettier** | Code formatting (`yarn format`) |
| **Structured logging** | `logger.js` with `MYAGENT_DEBUG` support |

---

## 📊 Architecture Summary

```
bin/cli.js                           # Entrypoint — TUI / readline / one-shot routing
src/
├── core/
│   ├── agents.js                    # Main agent loop (provider-agnostic)
│   ├── agents/                      # Multi-agent system
│   │   ├── registry.js              # Agent registry (Map + freeze)
│   │   ├── types.js                 # AgentDefinition typedef
│   │   ├── index.js                 # Bootstrap + re-export
│   │   └── definitions/             # Built-in agent definitions
│   ├── memory.js                    # Load/save/compress/summarize
│   ├── planner.js                   # LLM-powered action planner
│   └── transcript.js                # Session transcript export
├── llm/
│   ├── cost-tracker.js              # Multi-provider cost tracking
│   ├── llm.js                       # LLM abstraction
│   └── providers/                   # Gemini, OpenAI, Anthropic adapters
├── rag/
│   ├── semantic.js                  # Embedding, chunking, search
│   ├── cache.js                     # LRU embedding cache
│   └── watcher.js                   # Chokidar file watcher
├── mcp/
│   └── client.js                    # MCP stdio transport
├── tools/
│   ├── tools.js                     # Tool declarations + registry
│   ├── handlers/                    # 10 modular tool handlers
│   ├── command-classifier.js        # Safe/confirm/blocked classification
│   ├── shell-runner.js              # Streaming shell execution
│   ├── diff.js                      # Unified diff generation
│   └── search-utils.js              # Ripgrep + fallback search
├── commands/
│   ├── slash.js                     # Slash command router
│   └── handlers/                    # 14 command handlers
├── config/
│   ├── config.js                    # Config loader + Proxy
│   ├── constants.js                 # Centralized magic numbers
│   ├── provider-env.js              # API key management
│   └── prompts/                     # System prompt templates
├── ui/
│   ├── App.js                       # Main Ink application
│   ├── run.js                       # TUI bootstrap
│   ├── reducer.js                   # UI state management
│   ├── components/                  # 10 UI components
│   ├── clipboard.js                 # OSC 52 clipboard
│   ├── markdown.js                  # Markdown renderer
│   ├── mouse.js                     # Mouse event handler
│   ├── sparkline.js                 # Token usage sparkline
│   └── prompter.js                  # Pluggable prompt abstraction
└── utils/
    ├── utils.js                     # Path safety, retry, format helpers
    ├── backup.js                    # Automatic file backup
    └── logger.js                    # Structured debug logging
```
