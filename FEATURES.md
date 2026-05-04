# Feature List - AI Coding Agent (`myagent`)

Complete feature inventory for the current CLI-first build.

## Multi-Provider LLM Support

| Feature | Details |
|---|---|
| Google Gemini | Default provider. Supports configured Gemini model families. |
| OpenAI | GPT and reasoning model support through the OpenAI SDK. |
| Anthropic | Claude model support through the Anthropic SDK. |
| Hot-swap | Switch provider/model mid-session with `/model` or `/provider`. |
| Dedicated model roles | Separate models for generation, planning, and memory summarization. |
| Fuzzy pricing | Cost tracker auto-matches model prefixes for billing. |

## CLI Experience

| Feature | Details |
|---|---|
| Readline session | Plain terminal prompt for interactive use. |
| One-shot agent mode | `myagent --agent analyzer "audit src/"` runs and exits. |
| Live streaming | Model text and shell output stream directly to stdout/stderr. |
| Confirm prompts | Risky commands, deletes, and edits can require explicit approval. |
| Graceful shutdown | Ctrl+C shuts down watchers and MCP connections cleanly. |

## Smart Planning & Context

| Feature | Details |
|---|---|
| LLM-powered planner | Creates short action plans for complex tasks. |
| Auto-skip for simple requests | Short requests bypass planner to save latency and tokens. |
| Git-aware system prompt | Includes branch/status context in system instructions. |
| Adaptive context window | Summarizes memory when conversations grow large. |
| Configurable prompt versions | Uses prompt modules under `src/config/prompts/`. |

## Semantic RAG

| Feature | Details |
|---|---|
| Line-based smart chunking | Overlapping chunks preserve code context. |
| Pre-normalized embeddings | Search uses fast dot product. |
| Batch embedding API | Faster indexing through batched calls. |
| In-memory index cache | Avoids reparsing unchanged indexes. |
| Auto-reindex file watcher | Chokidar updates the semantic index after file changes. |
| Response caching | TTL-based cache with size cap. |

## Built-in Tools

| Tool | Type | Description |
|---|---|---|
| `read_file` | Read-only | Read file content with line numbers. |
| `list_dir` | Read-only | List files and folders. |
| `grep_search` | Read-only | Search patterns across files. |
| `get_file_info` | Read-only | Get file metadata. |
| `write_file` | Write | Write complete file content. |
| `edit_file` | Write | Find-and-replace editing with safety checks. |
| `batch_edit` | Write | Apply multiple edits in one tool call. |
| `replace_lines` | Write | Replace a line range precisely. |
| `create_dir` | Write | Create directories recursively. |
| `delete_file` | Write | Delete files with confirmation. |
| `run_command` | Write | Execute shell commands with classification and streaming output. |

## Slash Commands

| Command | Purpose |
|---|---|
| `/help` | List available commands. |
| `/clear` / `/new` / `/reset` | Start a fresh conversation. |
| `/index <folder>` | Build semantic index. |
| `/model [id]` / `/switch [id]` | Show or switch model. |
| `/provider [name]` | Show or switch provider. |
| `/save [file]` | Export transcript. |
| `/cost` | Cost reports, history, and reset. |
| `/cache` | Cache stats, clear, and clean. |
| `/config` | Show active configuration. |
| `/mcp` | List/connect MCP servers. |
| `/yolo [on\|off]` | Toggle full automation. |
| `/undo` | Restore recent file backups. |
| `/session` | Save, resume, delete, and list sessions. |
| `/list`, `/resume`, `/load` | Session shortcuts. |
| `/agent` / `/agents` | List, inspect, or invoke specialized agents. |
| `exit` / `quit` | Exit the agent. |

## Multi-Agent Architecture

| Feature | Details |
|---|---|
| Agent definition system | Declarative configs with scoped tools, prompts, and model/provider overrides. |
| Built-in `default` | Full-capability coding agent. |
| Built-in `analyzer` | Read-only code auditor. |
| Built-in `refactorer` | Write-capable refactoring agent with a shorter dedicated prompt. |
| Hermetic execution | Agent runs receive scoped tools without global toolset mutation. |

## Safety & Reliability

| Feature | Details |
|---|---|
| Path traversal protection | Blocks paths outside the workspace. |
| Command classifier | Blocks dangerous commands and asks for confirmation when needed. |
| YOLO mode | Optional no-prompt automation mode. |
| Automatic file backups | Writes and edits create restorable backups. |
| Atomic file writes | Temp-file then rename pattern. |
| Multi-occurrence detection | Avoids ambiguous edits. |
| Undo/rollback | `/undo` restores backups. |
| Loop detection | Stops repeated tool-call loops. |
| Retry with backoff | Retries transient provider failures. |

## Development & Testing

| Feature | Details |
|---|---|
| Node test runner | `node --test` without a framework dependency. |
| ESLint 9 | Flat config linting. |
| Prettier | Formatting. |
| Structured logging | `MYAGENT_DEBUG=1` enables debug logs. |

## Architecture Summary

```text
bin/cli.js                           # readline CLI + one-shot agent mode
src/
├── core/
│   ├── agents.js                    # main agent loop
│   ├── prompter.js                  # readline prompt/confirmation abstraction
│   ├── memory.js
│   ├── planner.js
│   └── transcript.js
├── llm/                             # cost tracker and providers
├── rag/                             # semantic index, cache, watcher
├── mcp/                             # MCP stdio client
├── tools/                           # declarations, handlers, shell runner, diff
├── commands/                        # slash command router and handlers
├── config/                          # config, constants, prompts, provider env
└── utils/                           # path safety, backup, retry, logger
```
