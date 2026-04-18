# 🤖 AI Coding Agent (`myagent`)

A terminal-based AI coding agent with multi-provider LLM support, semantic RAG, MCP integration, and interactive diff preview.

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-36%20passing-success)

## ✨ Features

- 🤖 **Multi-provider LLM** — Gemini, OpenAI, Anthropic (switch on-the-fly with `/model`)
- 🔌 **MCP (Model Context Protocol)** — plug in GitHub, MySQL, filesystem, and other tool servers
- 🔍 **Smart RAG** — line-based semantic chunking with pre-normalized embeddings
- ✏️ **Interactive diff preview** — review every edit before it lands on disk
- 💰 **Accurate cost tracking** — uses real `usageMetadata` from each provider
- 🛡️ **Safety by default** — path traversal blocked, dangerous commands refused, safe commands auto-approved
- 🧠 **LLM-powered memory summarization** — context stays fresh without ballooning token cost
- 📝 **Session transcript export** — `/save` produces a clean markdown log
- ⚡ **Streaming everywhere** — text tokens, shell output, no silent waits

## 🚀 Quickstart

```bash
git clone <repo>
cd ai-coding-agent
yarn install
npm link            # registers `myagent` globally
myagent             # first run prompts for your Gemini API key
```

```
🧑 > /index .
🧑 > Refactor src/utils.js to use async/await
🧑 > /model claude-3-5-haiku-latest
🧑 > /save session.md
```

## 📚 Documentation

| Topic | Link |
|---|---|
| Install & first run | [docs/getting-started.md](./docs/getting-started.md) |
| Config reference | [docs/configuration.md](./docs/configuration.md) |
| All slash commands | [docs/commands.md](./docs/commands.md) |
| LLM providers (Gemini/OpenAI/Anthropic) | [docs/providers.md](./docs/providers.md) |
| MCP server integration | [docs/mcp.md](./docs/mcp.md) |
| Built-in tools reference | [docs/tools.md](./docs/tools.md) |
| Semantic RAG tuning | [docs/rag.md](./docs/rag.md) |
| Cost tracking | [docs/cost-tracking.md](./docs/cost-tracking.md) |
| Security model | [docs/security.md](./docs/security.md) |
| Troubleshooting | [docs/troubleshooting.md](./docs/troubleshooting.md) |
| Architecture | [docs/architecture.md](./docs/architecture.md) |
| Contributing | [docs/contributing.md](./docs/contributing.md) |
| Changelog | [docs/changelog.md](./docs/changelog.md) |

**Start with [getting-started.md](./docs/getting-started.md).** The full index is at [docs/README.md](./docs/README.md).

## 🎮 Slash Commands (cheat sheet)

| Command | Purpose |
|---|---|
| `/help` | List all commands |
| `/clear` | Reset conversation memory |
| `/index <folder>` | Build semantic index |
| `/model [id]` | Show or switch model |
| `/provider [name]` | Switch LLM provider |
| `/save [file]` | Export session transcript |
| `/mcp` | List/connect MCP servers |
| `/cache stats\|clear\|clean` | Cache management |
| `/cost report\|history\|reset` | Cost tracking |
| `/config` | Show current config |
| `exit` / `quit` | Leave |

Full reference: [docs/commands.md](./docs/commands.md).

## 🏗️ Architecture at a Glance

```
bin/cli.js                       # entrypoint
src/
├── core/                        # agent loop, memory, planner, transcript
├── llm/providers/               # Gemini + OpenAI + Anthropic adapters
├── rag/                         # embedding, chunking, cache
├── mcp/                         # MCP client
├── tools/                       # 9 built-in tools + command classifier + diff
├── commands/slash.js            # all /commands
├── config/                      # config.js + constants.js
└── utils/utils.js
```

Deep dive: [docs/architecture.md](./docs/architecture.md).

## 🧪 Development

```bash
yarn test           # 36 unit tests via node:test (~150ms)
yarn lint           # ESLint 9 flat config
yarn format         # Prettier
```

See [docs/contributing.md](./docs/contributing.md) for conventions, PR workflow, and how to add providers/tools/commands.

## 📜 License

MIT
