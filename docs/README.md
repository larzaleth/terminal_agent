# 📚 Documentation

Complete documentation for **AI Coding Agent** (`myagent`) — a terminal-based multi-provider AI coding assistant.

## 🗺️ Table of Contents

### Users

1. [**Getting Started**](./getting-started.md) — Install, first run, common workflows
2. [**Configuration**](./configuration.md) — All settings in `agent.config.json`
3. [**Slash Commands**](./commands.md) — `/help`, `/model`, `/save`, `/mcp`, …
4. [**Providers**](./providers.md) — Gemini, OpenAI, Anthropic setup
5. [**MCP Servers**](./mcp.md) — Connect GitHub, MySQL, filesystem, etc.
6. [**Built-in Tools**](./tools.md) — `read_file`, `edit_file`, `run_command` reference
7. [**Semantic RAG**](./rag.md) — How `/index` and context retrieval work
8. [**Cost Tracking**](./cost-tracking.md) — Token pricing, usage reports
9. [**Security Model**](./security.md) — Path safety, command allowlist, key storage
10. [**Troubleshooting**](./troubleshooting.md) — Common issues and fixes

### Contributors

11. [**Architecture**](./architecture.md) — Codebase tour & design decisions
12. [**Contributing**](./contributing.md) — Dev setup, testing, style guide
13. [**Changelog**](./changelog.md) — Version history

## ⚡ Quickstart

```bash
git clone <repo>
cd ai-coding-agent
yarn install
npm link
myagent
```

First run prompts for a Gemini API key and saves it to `~/.myagent.env`. From there:

```
🧑 > /index .
🧑 > refactor src/utils/utils.js to use named exports
🧑 > /model claude-3-5-haiku-latest
🧑 > /save my-session.md
```

## 🆘 Need help?

- **Setup issues** → [Getting Started](./getting-started.md) & [Troubleshooting](./troubleshooting.md)
- **Using a provider** → [Providers](./providers.md)
- **Integrating external tools** → [MCP Servers](./mcp.md)
- **Understanding the code** → [Architecture](./architecture.md)

## 📖 License

MIT — see [LICENSE](../LICENSE) in the repo root.
