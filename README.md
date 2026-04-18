# AI Coding Agent (myagent)

A terminal-based AI coding agent with RAG, streaming, multi-provider support, and MCP tool integration.

## ✨ Features

- 🤖 **Multi-provider LLM** — Gemini, OpenAI, Anthropic (switch on-the-fly with `/model`)
- 🔌 **MCP (Model Context Protocol)** — plug in external tool servers (GitHub, MySQL, filesystem, …)
- 🔍 **Smart RAG** — line-based semantic index with pre-normalized embeddings
- ✏️ **Interactive diff preview** — review every edit before it lands on disk
- 💰 **Accurate cost tracking** — uses real `usageMetadata` from each provider
- 🛡️ **Safety by default** — path traversal blocked, dangerous commands refused, safe commands auto-approved
- 🧠 **LLM-powered memory summarization** — context stays fresh without ballooning token cost
- 📝 **Session transcript export** — `/save` produces a clean markdown log

## 🚀 Install

```bash
git clone <this-repo>
cd ai-coding-agent
yarn install
npm link          # registers `myagent` globally
myagent           # first run will prompt for your API key
```

## 🔑 Environment variables

The first `myagent` run prompts for a Gemini key and saves it to `~/.myagent.env`.
For other providers, add to `~/.myagent.env` or a local `.env`:

```env
GEMINI_API_KEY=...
OPENAI_API_KEY=...       # optional, for /provider openai
ANTHROPIC_API_KEY=...    # optional, for /provider anthropic
```

## 🎮 Slash commands

| Command | Description |
| --- | --- |
| `/help` | List all commands |
| `/clear` | Clear conversation memory |
| `/index <folder>` | Build semantic index of a folder |
| `/config` | Show active configuration |
| `/model [id]` | Show or switch model (`gpt-4o-mini`, `claude-3-5-haiku-latest`, `gemini-2.0-flash`, …) |
| `/provider [name]` | Switch LLM provider (`gemini`, `openai`, `anthropic`) |
| `/cache [stats\|clear\|clean]` | Cache management |
| `/cost [report\|history\|reset]` | Cost tracking |
| `/save [file]` | Export session transcript to markdown |
| `/mcp [stop]` | List or stop MCP server connections |
| `exit` / `quit` | Leave the agent |

## ⚙️ Configuration (`agent.config.json`)

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "plannerModel": "gemini-2.5-flash",
  "summaryModel": "gemini-2.5-flash",
  "maxIterations": 25,
  "maxMemoryTurns": 20,
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

MCP tools appear to the agent as `serverName.toolName` (e.g. `github.create_issue`). They're merged with the built-in tools transparently.

## 🧪 Development

```bash
yarn test           # 36 unit tests via node:test
yarn lint           # ESLint (flat config)
yarn format         # Prettier
```

## 🏗️ Architecture

```
bin/cli.js                 # entrypoint
src/
├── core/
│   ├── agents.js          # provider-agnostic agent loop
│   ├── memory.js          # load/save/summarize (auto-migrates legacy format)
│   ├── planner.js         # short-request auto-skip
│   └── transcript.js      # markdown export
├── llm/
│   ├── llm.js             # legacy compat + provider router
│   ├── cost-tracker.js    # multi-provider pricing + usageMetadata
│   └── providers/
│       ├── base.js        # interface + schema converter
│       ├── gemini.js
│       ├── openai.js
│       └── anthropic.js
├── rag/
│   ├── semantic.js        # line-based chunking, pre-normalized vectors
│   └── cache.js           # TTL + LRU eviction
├── mcp/
│   └── client.js          # stdio MCP client, tool merging
├── tools/
│   ├── tools.js           # file ops + run_command (spawn, streaming)
│   ├── command-classifier.js  # block/auto/confirm
│   └── diff.js            # colored unified diff
├── commands/slash.js      # /help /model /save /mcp …
├── config/{config.js,constants.js}
└── utils/utils.js
```

## 📜 License

MIT
