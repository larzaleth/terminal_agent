# Changelog

All notable changes to AI Coding Agent. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.4.0] — 2026-01-16

### Added
- **TUI (Ink-based terminal UI)** as the default mode in interactive terminals:
  - Multi-pane layout: header, chat pane (with live tool execution), sidebar (provider/cost/activity), input box, dynamic footer
  - **Expandable `ToolCallBlock`** for each tool call — collapsed by default, arrow ↑↓ to focus, Space/Enter to expand
  - **Interactive `DiffPrompt`** — colored diff with keyboard shortcuts (`a` approve, `r` reject, `e` edit manually)
  - **Interactive `ConfirmPrompt`** for `run_command` and `delete_file` (y/n/Esc)
  - Live cost & token counter in header + sidebar
  - Recent tools history in sidebar (last 5)
  - Streaming text appears live in the chat pane
  - Uses Ink's `<Static>` component so finalized messages scroll back in real terminal history
- **Hybrid mode detection** — Ink in TTY, readline REPL in non-TTY (CI, piped input). Force via `--tui` / `--no-tui` or `MYAGENT_NO_TUI=1`.
- **Pluggable prompter abstraction** (`src/ui/prompter.js`) — decouples tool confirmations from any specific UI. Readline and Ink both register implementations via `setPrompter()`.
- **`docs/tui.md`** — full TUI mode reference (layout, keyboard shortcuts, troubleshooting)
- **9 UI component tests** via `ink-testing-library`

### Changed
- `bin/cli.js` restructured with clean TTY-based routing to TUI or readline.
- `edit_file`, `delete_file`, `run_command` use the prompter module instead of inline `readline`.
- Package version bumped to 2.4.0.

### Dependencies added
- `ink@^5.2.1`, `react@^18.3.1` — UI runtime
- `ink-text-input`, `ink-spinner` — UI widgets
- `ink-testing-library` (dev) — component tests

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
- **New slash commands:**
  - `/model [id]` — show or switch model, with provider auto-inference
  - `/provider [name]` — switch provider only
  - `/save [file]` — export session transcript to markdown
  - `/mcp` — list connected MCP servers and their tools
- **Session transcript export** (`src/core/transcript.js`) — markdown output with proper tool-call rendering, supports both legacy and normalized memory formats
- **Comprehensive documentation** in `docs/` (11 pages)

### Changed
- **Normalized message format** — internal `{role, blocks}` shape replaces Gemini-specific `{role, parts}`. Legacy `memory.json` auto-migrates on load.
- **Provider-agnostic agent loop** — `src/core/agents.js` now works with any adapter
- **Pricing table expanded** to cover all three providers' current model lineups
- **Config mutable at runtime** via Proxy — `/model` and `/provider` mutate in-session without touching disk

### Fixed
- **Operator-precedence bug** in `cost-tracker.js` nullish-coalescing chain (detected by ESLint, fixed)

## [2.2.0] — 2026-01-16

### Added
- **Async filesystem** — migrated `semantic.js` and `tools.js` to `fs/promises` to avoid event-loop blocking on large repos
- **Streaming `run_command`** — replaces `execSync` with `spawn`, piping stdout/stderr live to the terminal. No more invisible 30-second installs.
- **Command allowlist** (`src/tools/command-classifier.js`):
  - `blocked` — refuses `rm -rf /`, fork bomb, `curl | sh`, `dd` to disk, etc.
  - `auto` — runs `ls`, `git status`, `npm test`, etc. without confirmation
  - `confirm` — asks user for everything else
- **ESLint 9** (flat config) + **Prettier** — `yarn lint`, `yarn format`
- **`tests/` directory** with 27 unit tests covering:
  - path safety, retry logic, format helpers (`utils.test.js`)
  - smart chunking behavior (`chunking.test.js`)
  - command classifier verdicts (`command-classifier.test.js`)

### Changed
- Tests run via Node's built-in `node --test` — no framework dependency

## [2.1.0] — 2026-01-16

### Added
- **Modular folder structure** — flat root files moved to `src/core`, `src/llm`, `src/rag`, `src/tools`, `src/commands`, `src/config`, `src/utils`, `bin/`
- **Constants file** (`src/config/constants.js`) — all magic numbers centralized

### Changed
- **Path safety** — `isSafePath()` now uses `path.resolve()` against cwd; blocks absolute paths outside project (`/etc/passwd`, etc.). Previous implementation only checked for `..`.
- **Token counting accuracy** — uses `usageMetadata` from Gemini responses instead of `chars / 3.5` estimation. Cost reports now match actual billing.
- **Smart line-based chunking** — `chunkText()` splits by 40 lines with 5-line overlap instead of 500-character slices. Code semantics preserved; RAG relevance improved substantially.
- **Pre-normalized embeddings** — vectors normalized once at index time; search uses dot product (faster than recomputing cosine per query).
- **Minified `index.json`** — no indentation, cuts file size 5-10×.
- **In-memory index cache** with mtime invalidation — avoids re-parsing JSON on every request.
- **Planner auto-skip** for requests < 15 words — saves 1 LLM call + ~500ms per trivial prompt.
- **`p-limit` concurrency** — tool execution and embedding batches capped at 5, preventing 429 storms.
- **Lazy config singleton** — `loadConfig()` called on first use, not module import. Enables tests and slash-command overrides.
- **Lazy GoogleGenAI client** — SDK instantiated only when first used.
- **Retry on `err.status`** — no more fragile substring matching on error messages.
- **API key file mode** — `~/.myagent.env` now written with `0o600` (owner read/write only).
- **Graceful SIGINT handler** — Ctrl+C exits cleanly instead of printing a stack trace.
- **LRU-ish cache eviction** — cache capped at 5000 entries; oldest (by mtime) evicted first.

### Removed
- `index.js` (dead code duplicating CLI logic)
- `chat.js` (unused orphan file)
- `memory.json` (was being committed; now properly gitignored)
- `cli.js` at root (moved to `bin/cli.js`)

### Fixed
- Duplicate `IGNORE_DIRS` definition in `semantic.js` + `tools.js`
- Duplicate `dotenv.config()` calls in `cli.js` + `llm.js`

## [2.0.0] — prior releases

Earlier versions featured:
- Gemini-only single-provider implementation
- Slash commands: `/help`, `/clear`, `/index`, `/config`, `/cache`, `/cost`
- RAG with basic 500-char chunking
- Function calling with parallel read-only + sequential write dispatch
- LLM-powered memory summarization

See git history for pre-2.1 details.
