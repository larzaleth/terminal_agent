# Changelog

All notable changes to **AI Coding Agent** (`myagent`).
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).

---

## [2.6.0] — 2026-05-04

### Added
- **Intelligent Loop Detection**: Added `same-file read counter` with write-progress reset. Counter tracks repeated reads of the same file/dir, warns at 6, soft-blocks at 15. Counter resets when agent makes successful writes (write_file, edit_file, replace_lines, batch_edit) — so productive work never gets penalized. Hard limit no longer force-stops the agent; it only blocks further reads of that specific file.
- **Mega-File Refactoring Strategy**: New system prompt section for handling 1000+ line files with a strict "Extract-then-Delete" workflow. Includes resume-awareness: agent checks which target files already exist before extracting, skips writes for existing files, and focuses on deleting from source.
- **PowerShell Compatibility Tips**: Added explicit instructions for PowerShell `mkdir`, `grep` (Select-String), and `list_dir` to prevent common Windows pitfalls.

### Fixed
- **YOLO Mode (autoApprove)**: Fixed `run_command` and `delete_file` handlers not correctly bypassing confirmation prompts when YOLO mode is active.
- **Robust Config Loading**: `loadConfig` now searches upwards for `agent.config.json`, preventing issues when the agent runs in a subdirectory.
- **Command Classification**: Added `mkdir` and `New-Item` to `AUTO_ALLOWED` list for smoother directory creation.
- **Directory Pre-check Elimination**: Agent no longer wastes iterations checking if target directories exist before writing — `write_file` auto-creates parent dirs. System prompt explicitly forbids `list_dir` spam and manual mkdir instructions.
- **False Failure Detection**: `grep_search` "no matches" result no longer triggers failure counter. Changed prefix from ❌ to ℹ️ since it's an informational result, not a tool error.
- **Anti-Hallucination Rules**: Agent is now explicitly forbidden from inventing component names or searching for files it hasn't seen in `read_file` output.
- **Focus and Discipline**: Added strict "Anti-Rabbit Hole" rules to the FAST mode. Agent is explicitly instructed NOT to get distracted by minor bugs, styling issues, or out-of-sync imports while performing the core extraction task.
- **Anti-Investigation Paralysis**: Agent is now limited to a maximum of 3 tool calls when hunting down a single missing import or comparing duplicate components, preventing it from wasting dozens of iterations on minor project cleanup.
- **Tool Usage Clarification**: Added strict rules to prevent using `batch_edit` or `edit_file` for new files, ensuring `write_file` is used instead. Also strongly prefers `batch_edit` for mass import updates rather than editing files one by one.
- **Overwrite Protection**: `write_file` now rejects overwriting existing files by default. Agent MUST pass `overwrite: true` explicitly, which forces it to acknowledge existing files and stops the infinite "re-extraction" loop during mega-file refactoring.

## [2.5.1] — 2026-05-04

### Changed
- **Optimized production prompt** — `senior-v1.production` is now the default prompt, focusing on tool-first reasoning with minimal filler. Strict anti-loop and scope discipline.
- **Agent loop hardened** — improved mouse event handling for TUI mode; cleaner exit behavior.
- **Model defaults updated** — uses `gemini-3-flash-preview` as primary model, `gemini-3.1-pro-preview` for planner, `gemini-2.5-flash-lite` for memory summarization.
- **Max iterations increased** — default and project-level `maxIterations` increased to 250 for more complex tasks.
- **Hot-Reload Support Notice** — Note: while configuration changes like `/yolo` take effect immediately, core logic changes (like new tool handlers or command classifier updates) require an agent restart (`exit` and re-run) to apply.
- **YOLO Mode (`/yolo`)** — new command and configuration to enable full automation by bypassing all permission prompts for commands, edits, and deletions.
- **Smart Chaining & Continuation** — improved the planner and system prompt to better handle "lanjut" / "continue" requests. The planner now uses conversation history to generate multi-step plans for ongoing tasks, and the agent is instructed to keep chaining tool calls until the objective is reached.
- **Windows/PowerShell Optimization** — updated the system prompt with explicit shell compatibility rules. The agent is now instructed to prefer built-in tools (`grep_search`, `edit_file`) over Unix-centric shell commands (`grep`, `sed`) when operating on Windows, and to pivot to native PowerShell alternatives on failure.
- **Smart File Reading** — enhanced `read_file` tool to support `startLine` and `endLine` parameters. This allows the agent to read specific parts of large files efficiently, reducing token waste and preventing redundant full-file reads.
- **Large File Optimization** — increased `MAX_TOOL_OUTPUT_CHARS` from 8k to 200k (capable of reading ~4000-5000 lines at once) and `MAX_COMMAND_OUTPUT_CHARS` from 5k to 20k. This allows the agent to process "mega-files" like 1,500-line React components without hitting truncation or safety limits.
- **Persistence & Failure Recovery** — fixed a critical bug in failure detection that caused false positives when reading code containing the word "error". Increased loop detection limits (`LOOP_DUPE_LIMIT` to 5, `LOOP_WINDOW` to 10) to support more complex, repetitive tasks like multi-stage refactoring. The agent is also forbidden from giving premature "Manual Fix" suggestions.
- **Refactoring Strategy** — updated the system prompt with a dedicated strategy for large-file refactoring, encouraging modular extraction and precise range-based reading.
- **`replace_lines` tool (NEW)** — new tool for line-range based file editing. Unlike `edit_file` (which requires exact string matching), `replace_lines` only needs line numbers — making it 10x faster for large refactoring tasks like extracting components from mega-files.
- **Speed-optimized system prompt** — complete rewrite of the production prompt to prioritize speed: explicitly bans using `run_command` for file reading/searching, directs the agent to use `replace_lines` for large edits and `write_file` for new files without excessive pre-reading.
- **Dual-Mode System Prompt (CAREFUL / FAST)** — the agent now auto-detects user intent and adapts its behavior. For everyday coding (bug fixes, features, debugging), it uses **CAREFUL mode**: reasoning-first, read-before-edit, verify dependencies. For refactoring/restructuring tasks, it switches to **FAST mode**: read once, write many, use `replace_lines` for speed. The planner also generates mode-appropriate step plans.
- **Improved Command Classification** — updated `run_command` classifier to better recognize safe PowerShell read commands (`Get-Content`, `Select-String`, `Where-Object`, `Out-String`, etc.). Relaxed pipe restrictions for known-safe read-only operations and common PowerShell selectors to reduce unnecessary permission prompts.
- **Persistent YOLO Mode** — the `/yolo` command now persists its state to `agent.config.json`, ensuring that automation settings remain active across different terminal sessions.

---

## [2.5.0] — 2026-04

### Added
- **Multi-Agent Architecture** — declarative agent definitions with tool whitelisting, per-agent model/provider/prompt overrides, and a registry system.
  - **`analyzer` agent** — read-only code auditor with structured audit output (features, bugs, security, task list).
  - **`default` agent** — full-capability agent preserving classic behavior.
  - **Agent registry** (`src/core/agents/registry.js`) — `Map<name, AgentDefinition>` with `Object.freeze()` for immutability and duplicate rejection.
  - **One-shot CLI mode** — `myagent --agent analyzer "audit src/"` for scripted/CI usage.
  - **`/agent` slash command** — `list`, `info <name>`, `run <name> <request>` for inline agent invocation.
  - **Hermetic agent execution** — each `runAgent(input, {definition})` builds its own toolset without mutating global state.
- **`/undo` command** — restore the most recent file backup(s) created by the agent. Supports `/undo list` (show recent backups) and `/undo [N]` (restore last N changes).
- **Session persistence** — save and resume conversations across terminal restarts:
  - `/session save <name>` / `/session resume <name>` / `/session delete <name>` / `/session list`
  - Shortcuts: `/list`, `/resume <name>`, `/load <name>`
- **`/copy` command** — OSC 52 clipboard integration for TUI mode. Copy `last` (assistant reply), `tool` (focused tool block), `turn` (current turn), or `all` (entire transcript).
- **`batch_edit` tool** — apply multiple find-and-replace edits across different files in a single turn with diff preview and backup.
- **Adaptive context window management** — auto-summarizes memory when estimated tokens exceed 50K or turns exceed `maxMemoryTurns`. Uses dedicated `summaryModel` with 10s timeout.
- **Git-aware system prompt** — system instructions dynamically include branch name, git status, and last commit.
- **File watcher** (`src/rag/watcher.js`) — chokidar-based auto-reindex on file changes (add/change/unlink) for code files.
- **Multi-agent architecture documentation** (`docs/multi-agent-architecture.md`) — comprehensive design doc covering the agent definition contract, built-in agents, how to create new agents, testing patterns, and future inter-agent delegation plans.
- **Agent integration tests** (`tests/agent-integration.test.js`) — validates agent toolset filtering, system prompt override, and hermetic execution using stub providers.
- **Agent registry tests** (`tests/agent-registry.test.js`) — unit tests for register, get, list, duplicate rejection, and freeze behavior.
- **Clipboard tests** (`tests/clipboard.test.js`) — tests for OSC 52 encoding, TTY detection, truncation, and text extraction helpers.

### Changed
- **Agent loop refactored** (`src/core/agents.js`) — `runAgent` now accepts an optional `definition` parameter. Two new pure helpers (`buildToolset`, `resolveRuntime`) handle agent-specific tool filtering and config resolution without monkey-patching.
- **Slash command registry expanded** — 20 registered commands (from 11), including aliases for common actions.
- **`/help` command updated** — reflects new commands (`/new`, `/list`, `/resume`, `/session`, `/undo`, `/agent`).
- **CLI entrypoint restructured** (`bin/cli.js`) — added `--agent` flag parsing for one-shot agent mode. Modularized into `runTui()`, `runReadline()`, and `runOneShotAgent()` functions.
- **Package version** bumped to 2.5.1.

### Dependencies added
- `chokidar@^5.0.0` — file system watcher for auto-reindexing.

---

## [2.4.0] — 2026-01-16

### Added
- **TUI (Ink-based terminal UI)** as the default mode in interactive terminals:
  - Multi-pane layout: header, chat pane (with live tool execution), sidebar (provider/cost/activity), input box, dynamic footer
  - **Expandable `ToolCallBlock`** for each tool call — collapsed by default, ↑↓ to focus, Space/Enter to expand
  - **Interactive `DiffPrompt`** — colored diff with keyboard shortcuts (`a` approve, `r` reject, `e` edit manually)
  - **Interactive `ConfirmPrompt`** for `run_command` and `delete_file` (y/n/Esc)
  - Live cost & token counter in header + sidebar
  - Recent tools history in sidebar (last 5)
  - Streaming text appears live in the chat pane
  - Uses Ink's `<Static>` component so finalized messages scroll back in real terminal history
- **Hybrid mode detection** — Ink in TTY, readline REPL in non-TTY (CI, piped input). Force via `--tui` / `--no-tui` or `MYAGENT_NO_TUI=1`.
- **Pluggable prompter abstraction** (`src/ui/prompter.js`) — decouples tool confirmations from any specific UI.
- **`docs/tui.md`** — full TUI mode reference
- **9 UI component tests** via `ink-testing-library`

### Changed
- `bin/cli.js` restructured with clean TTY-based routing to TUI or readline.
- `edit_file`, `delete_file`, `run_command` use the prompter module instead of inline `readline`.
- Package version bumped to 2.4.0.

### Dependencies added
- `ink@^5.2.1`, `react@^18.3.1` — UI runtime
- `ink-text-input`, `ink-spinner` — UI widgets
- `ink-testing-library` (dev) — component tests

---

## [2.3.0] — 2026-01-16

### Added
- **Multi-provider LLM support** via a normalized interface (`src/llm/providers/`):
  - `gemini` (default) — Google Gemini
  - `openai` — GPT-4o, GPT-4.1, o1, o3 families
  - `anthropic` — Claude 3.5 Sonnet / Haiku, Opus
- **MCP (Model Context Protocol) client** (`src/mcp/client.js`):
  - stdio transport
  - Multi-server support with per-server tool prefixing
  - Tools merged transparently with built-ins in the agent loop
  - `/mcp` and `/mcp stop` commands
- **Interactive diff preview** for `edit_file`:
  - Colored unified diff
  - Y/n/e (edit manually) confirmation
  - Auto-approve via `MYAGENT_AUTO_APPROVE_EDITS=1` or non-TTY stdin
- **New slash commands:** `/model`, `/provider`, `/save`, `/mcp`
- **Session transcript export** (`src/core/transcript.js`) — markdown output with proper tool-call rendering
- **Comprehensive documentation** in `docs/` (11 pages)

### Changed
- **Normalized message format** — internal `{role, blocks}` shape replaces Gemini-specific `{role, parts}`. Legacy `memory.json` auto-migrates on load.
- **Provider-agnostic agent loop** — `src/core/agents.js` now works with any adapter
- **Pricing table expanded** to cover all three providers' current model lineups
- **Config mutable at runtime** via Proxy — `/model` and `/provider` mutate in-session without touching disk

### Fixed
- **Operator-precedence bug** in `cost-tracker.js` nullish-coalescing chain

---

## [2.2.0] — 2026-01-16

### Added
- **Async filesystem** — migrated `semantic.js` and `tools.js` to `fs/promises`
- **Streaming `run_command`** — replaces `execSync` with `spawn`, piping stdout/stderr live
- **Command allowlist** (`src/tools/command-classifier.js`):
  - `blocked` — refuses `rm -rf /`, fork bomb, `curl | sh`, `dd` to disk, etc.
  - `auto` — runs `ls`, `git status`, `npm test`, etc. without confirmation
  - `confirm` — asks user for everything else
- **ESLint 9** (flat config) + **Prettier** — `yarn lint`, `yarn format`
- **`tests/` directory** with 27 unit tests covering path safety, retry logic, chunking, command classifier

### Changed
- Tests run via Node's built-in `node --test` — no framework dependency

---

## [2.1.0] — 2026-01-16

### Added
- **Modular folder structure** — flat root files reorganized into `src/core`, `src/llm`, `src/rag`, `src/tools`, `src/commands`, `src/config`, `src/utils`, `bin/`
- **Constants file** (`src/config/constants.js`) — all magic numbers centralized

### Changed
- **Path safety** — `isSafePath()` uses `path.resolve()` against cwd; blocks absolute paths outside project
- **Token counting accuracy** — uses `usageMetadata` from Gemini responses instead of `chars / 3.5` estimation
- **Smart line-based chunking** — 40 lines with 5-line overlap instead of 500-character slices
- **Pre-normalized embeddings** — vectors normalized once at index time; dot product for search
- **Minified `index.json`** — no indentation, 5-10× smaller
- **In-memory index cache** with mtime invalidation
- **Planner auto-skip** for requests < 15 words
- **`p-limit` concurrency** — tool execution and embedding batches capped at 5
- **Lazy config singleton** — `loadConfig()` on first use, not module import
- **Lazy GoogleGenAI client** — instantiated only when first used
- **Retry on `err.status`** — no more fragile substring matching
- **API key file mode** — `~/.myagent.env` written with `0o600`
- **Graceful SIGINT handler** — clean exit on Ctrl+C
- **LRU-ish cache eviction** — 5000-entry cap, oldest-by-mtime evicted first

### Removed
- `index.js` (dead code duplicating CLI logic)
- `chat.js` (unused orphan file)
- `memory.json` (was being committed; now gitignored)
- `cli.js` at root (moved to `bin/cli.js`)

### Fixed
- Duplicate `IGNORE_DIRS` definition in `semantic.js` + `tools.js`
- Duplicate `dotenv.config()` calls in `cli.js` + `llm.js`

---

## [2.0.0] — prior releases

Earlier versions featured:
- Gemini-only single-provider implementation
- Slash commands: `/help`, `/clear`, `/index`, `/config`, `/cache`, `/cost`
- RAG with basic 500-char chunking
- Function calling with parallel read-only + sequential write dispatch
- LLM-powered memory summarization

See git history for pre-2.1 details.
