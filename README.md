# 🤖 AI Coding Agent (`myagent`)

A terminal-based AI coding agent with multi-provider LLM support, multi-agent architecture, semantic RAG, MCP integration, and a rich interactive TUI.

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-2.5.1-orange)

## ✨ Features

- 🎨 **Rich TUI** (Ink-based) with multi-pane layout, expandable tool blocks, interactive diff review, mouse support, and OSC 52 clipboard — auto-falls-back to readline REPL for non-TTY
- 🤖 **Multi-provider LLM** — Gemini, OpenAI, Anthropic (switch on-the-fly with `/model`)
- 🧩 **Multi-Agent Architecture** — declarative agent definitions with tool whitelisting, per-agent prompts, and one-shot CLI mode (`--agent analyzer`)
- 🔌 **MCP (Model Context Protocol)** — plug in GitHub, MySQL, filesystem, and other tool servers
- 🔍 **Smart RAG** — line-based semantic chunking with pre-normalized embeddings and auto-reindex file watcher
- ✏️ **Interactive diff preview** — review every edit before it lands on disk (keyboard nav: a/r/e)
- 📦 **Batch editing** — `batch_edit` tool for multi-file coordinated changes in one turn
- 💰 **Accurate cost tracking** — uses real `usageMetadata` from each provider (USD + IDR)
- 🛡️ **Safety by default** — path traversal blocked, dangerous commands refused, automatic backups, loop detection
- 🧠 **Adaptive context window** — LLM-powered memory summarization with token-aware auto-compression
- 📝 **Session persistence** — save, resume, and manage named sessions across restarts
- ⏪ **Undo/rollback** — `/undo` instantly restores agent-created backups
- ⚡ **Streaming everywhere** — text tokens, shell output, no silent waits

> **Full feature list:** [FEATURES.md](./FEATURES.md)

## 🚀 Quickstart

```bash
git clone <repo>
cd ai-coding-agent
npm install
npm link            # registers `myagent` globally
myagent             # first run prompts for your Gemini API key
```

```
🧑 > /index .
🧑 > Refactor src/utils.js to use async/await
🧑 > /model claude-3-5-haiku-latest
🧑 > /save session.md
```

### One-shot Agent Mode

```bash
myagent --agent analyzer "audit src/"    # read-only code audit, exits when done
```

## 📚 Documentation

| Topic | Link |
|---|---|
| Install & first run | [docs/getting-started.md](./docs/getting-started.md) |
| Config reference | [docs/configuration.md](./docs/configuration.md) |
| All slash commands | [docs/commands.md](./docs/commands.md) |
| **TUI mode** (layout + keybindings) | [docs/tui.md](./docs/tui.md) |
| LLM providers (Gemini/OpenAI/Anthropic) | [docs/providers.md](./docs/providers.md) |
| **Multi-agent architecture** | [docs/multi-agent-architecture.md](./docs/multi-agent-architecture.md) |
| MCP server integration | [docs/mcp.md](./docs/mcp.md) |
| Built-in tools reference | [docs/tools.md](./docs/tools.md) |
| Semantic RAG tuning | [docs/rag.md](./docs/rag.md) |
| Cost tracking | [docs/cost-tracking.md](./docs/cost-tracking.md) |
| Security model | [docs/security.md](./docs/security.md) |
| Troubleshooting | [docs/troubleshooting.md](./docs/troubleshooting.md) |
| Architecture | [docs/architecture.md](./docs/architecture.md) |
| Contributing | [docs/contributing.md](./docs/contributing.md) |
| **Features list** | [FEATURES.md](./FEATURES.md) |
| **Changelog** | [CHANGELOG.md](./CHANGELOG.md) |

**Start with [getting-started.md](./docs/getting-started.md).** The full index is at [docs/README.md](./docs/README.md).

## 🎮 Slash Commands (cheat sheet)

| Command | Purpose |
|---|---|
| `/help` | List all commands |
| `/new` | Start fresh conversation |
| `/index <folder>` | Build semantic index |
| `/model [id]` | Show or switch model |
| `/provider [name]` | Switch LLM provider |
| `/save [file]` | Export session transcript |
| `/mcp` | List/connect MCP servers |
| `/yolo [on\|off]` | Toggle full automation (no permission prompts) |
| `/copy last\|tool\|turn\|all` | Copy to clipboard (TUI) |
| `/undo [N\|list]` | Rollback file changes |
| `/session save\|resume\|delete\|list` | Session management |
| `/agent list\|info\|run` | Multi-agent system |
| `/cache stats\|clear\|clean` | Cache management |
| `/cost report\|history\|reset` | Cost tracking |
| `/config` | Show current config |
| `exit` / `quit` | Leave |

Full reference: [docs/commands.md](./docs/commands.md).

## 🤖 Multi-Agent System

Built-in agents:

| Agent | Tools | Description |
|---|---|---|
| `default` | All 10 + MCP | Full-capability coding agent |
| `analyzer` | Read-only (4) | Code auditor — maps features, finds bugs & security issues |

```bash
# One-shot from CLI
myagent --agent analyzer "audit the security of src/"

# From inside a session
/agent run analyzer find all TODO comments and dead code
/agent info analyzer
/agent list
```

Create your own agent: drop a definition file in `src/core/agents/definitions/` and register it. See [docs/multi-agent-architecture.md](./docs/multi-agent-architecture.md).

## 🏗️ Architecture at a Glance

```
bin/cli.js                       # entrypoint (TUI / readline / one-shot)
src/
├── core/                        # agent loop, memory, planner, transcript
│   └── agents/                  # multi-agent registry + definitions
├── llm/providers/               # Gemini + OpenAI + Anthropic adapters
├── rag/                         # embedding, chunking, cache, file watcher
├── mcp/                         # MCP client (stdio transport)
├── tools/                       # 10 built-in tools + command classifier + diff
│   └── handlers/                # modular per-tool handlers
├── commands/
│   ├── slash.js                 # slash command router (20 commands)
│   └── handlers/                # 14 command handlers
├── config/                      # config, constants, prompts, provider-env
├── ui/                          # Ink TUI (10 components + state management)
└── utils/                       # path safety, retry, backup, logger
```

Deep dive: [docs/architecture.md](./docs/architecture.md).

## 🧪 Development

```bash
npm test            # 14 test files via node:test
npm run lint        # ESLint 9 flat config
npm run format      # Prettier
```

See [docs/contributing.md](./docs/contributing.md) for conventions, PR workflow, and how to add providers/tools/commands/agents.

## 📜 License

MIT
