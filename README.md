# AI Coding Agent (`myagent`)

A terminal-based AI coding agent with multi-provider LLM support, multi-agent architecture, semantic RAG, MCP integration, and a plain readline CLI.

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-2.5.1-orange)

## Features

- **Multi-provider LLM** - Gemini, OpenAI, Anthropic, switchable with `/model` or `/provider`.
- **Multi-agent architecture** - default, analyzer, and refactorer agents with scoped prompts and tool access.
- **MCP integration** - connect GitHub, MySQL, filesystem, and other MCP servers.
- **Smart RAG** - semantic code indexing with cached embeddings and file watcher refresh.
- **Batch editing** - coordinated multi-file edits through `batch_edit`.
- **Cost tracking** - real usage-based USD and IDR reporting.
- **Safety by default** - path traversal checks, dangerous command blocking, backups, undo, and loop detection.
- **Adaptive context window** - token-aware summarization for long sessions.
- **Session persistence** - save, resume, list, and export sessions.
- **Streaming output** - model text and shell output stream directly in the CLI.

> Full feature list: [FEATURES.md](./FEATURES.md)

## Quickstart

```bash
git clone <repo>
cd ai-coding-agent
npm install
npm link
myagent
```

First run prompts for your Gemini API key.

```text
> /index .
> Refactor src/utils.js to use async/await
> /model claude-3-5-haiku-latest
> /save session.md
```

### One-shot Agent Mode

```bash
myagent --agent analyzer "audit src/"
myagent --agent refactorer "split src/App.jsx into components"
```

## Documentation

| Topic | Link |
|---|---|
| Install & first run | [docs/getting-started.md](./docs/getting-started.md) |
| Config reference | [docs/configuration.md](./docs/configuration.md) |
| All slash commands | [docs/commands.md](./docs/commands.md) |
| LLM providers | [docs/providers.md](./docs/providers.md) |
| Multi-agent architecture | [docs/multi-agent-architecture.md](./docs/multi-agent-architecture.md) |
| MCP server integration | [docs/mcp.md](./docs/mcp.md) |
| Built-in tools reference | [docs/tools.md](./docs/tools.md) |
| Semantic RAG tuning | [docs/rag.md](./docs/rag.md) |
| Cost tracking | [docs/cost-tracking.md](./docs/cost-tracking.md) |
| Security model | [docs/security.md](./docs/security.md) |
| Troubleshooting | [docs/troubleshooting.md](./docs/troubleshooting.md) |
| Architecture | [docs/architecture.md](./docs/architecture.md) |
| Contributing | [docs/contributing.md](./docs/contributing.md) |
| Features list | [FEATURES.md](./FEATURES.md) |
| Changelog | [CHANGELOG.md](./CHANGELOG.md) |

## Slash Commands

| Command | Purpose |
|---|---|
| `/help` | List all commands |
| `/new` | Start fresh conversation |
| `/index <folder>` | Build semantic index |
| `/model [id]` | Show or switch model |
| `/provider [name]` | Switch LLM provider |
| `/save [file]` | Export session transcript |
| `/mcp` | List/connect MCP servers |
| `/yolo [on\|off]` | Toggle full automation |
| `/undo [N\|list]` | Rollback file changes |
| `/session save\|resume\|delete\|list` | Session management |
| `/agent list\|info\|run` | Multi-agent system |
| `/cache stats\|clear\|clean` | Cache management |
| `/cost report\|history\|reset` | Cost tracking |
| `/config` | Show current config |
| `exit` / `quit` | Leave |

## Built-in Agents

| Agent | Tools | Description |
|---|---|---|
| `default` | All built-ins + MCP | Full-capability coding agent |
| `analyzer` | Read-only | Code auditor for bugs, risks, and architecture notes |
| `refactorer` | Local refactor tools | Focused extraction, restructuring, and modularization agent |

## Architecture at a Glance

```text
bin/cli.js                       # readline CLI and one-shot agent mode
src/
├── core/                        # agent loop, memory, planner, transcript, prompter
│   └── agents/                  # multi-agent registry + definitions
├── llm/providers/               # Gemini + OpenAI + Anthropic adapters
├── rag/                         # embedding, chunking, cache, file watcher
├── mcp/                         # MCP client
├── tools/                       # built-in tools + command classifier + diff
│   └── handlers/                # modular per-tool handlers
├── commands/                    # slash command router + handlers
├── config/                      # config, constants, prompts, provider env
└── utils/                       # path safety, retry, backup, logger
```

## Development

```bash
npm test
npm run lint
npm run format
```

## License

MIT
