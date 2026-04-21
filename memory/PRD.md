# AI Coding Agent — PRD

## Original Problem Statement
User request: _"coba lihat repo saya dan analis, review dan berikan feedback apa saja yg bisa saya lakukan untuk improving"_, which evolved over the session into:

1. Build a TUI layer using `ink` with a multi-pane hybrid layout, interactive diffs, and live tool execution panels.
2. Fix API-key leak issues and TUI scrolling/layout bugs.
3. Handle long-running task hangs/lags and add Markdown support in the TUI container.

User language: **Bahasa Indonesia**.

## Project Type
Node.js CLI application (not a web app) with a rich Terminal UI powered by `ink` + `react`.

## Architecture
```
/app
├── bin/cli.js
├── src/
│   ├── commands/slash.js
│   ├── config/{config.js, constants.js}
│   ├── core/{agents.js, memory.js, planner.js, transcript.js}
│   ├── llm/{llm.js, cost-tracker.js, providers/*}
│   ├── mcp/client.js
│   ├── rag/{semantic.js, cache.js}
│   ├── tools/{tools.js, command-classifier.js, diff.js}
│   ├── ui/
│   │   ├── App.js, run.js, prompter.js, useTerminalSize.js,
│   │   ├── markdown.js, toolStream.js, h.js
│   │   └── components/{Header, Footer, Sidebar, MessageList, Message,
│   │                   InputBox, DiffPrompt, ConfirmPrompt, ToolCallBlock}
│   └── utils/utils.js
├── tests/
│   ├── chunking, command-classifier, diff, providers, utils
│   └── ui/{components, markdown}
├── docs/ (14 markdown files)
└── .env.example
```

## Core Capabilities (implemented)
- Multi-provider LLM: Gemini, OpenAI, Anthropic (via `src/llm/providers/*`)
- MCP (Model Context Protocol) client via `@modelcontextprotocol/sdk`
- Semantic RAG with smart chunking + pre-normalized embedding cache
- 9 built-in tools (`read_file`, `write_file`, `edit_file`, `list_dir`, `grep_search`, `create_dir`, `delete_file`, `get_file_info`, `run_command`) with classifier-based safety
- Interactive diff preview with approve/reject/manual
- Live streaming `run_command` (spawn, not execSync) with 60s timeout
- `/help`, `/save`, `/model`, `/clear`, `/mcp` slash commands
- Rich TUI: multi-pane (chat + sidebar), scrollable history (PgUp/PgDn/G),
  tool focus with arrows/space, Esc-to-cancel, alternate screen buffer.

## Implemented this fork session (2026-02)
### Round 1 — Bug fixes
- **P0 fix — TUI freeze on long turns**: coalesced streaming tokens into a
  ref-backed buffer flushed every ~60ms in `src/ui/App.js` so React no longer
  re-renders on every Gemini token. Final flush on turn end / error.
- **P0 fix — tool stream wiring**: `setToolStreamCallback` is now actually
  registered in `App.js` useEffect and forwards chunks into the reducer
  (`tool_stream_chunk`). Live stdout from `npm install` etc. now surfaces in
  the expanded tool block instead of being swallowed.
- **P1 fix — Markdown in assistant messages**: `Markdown` component is now
  used in `components/Message.js` for assistant/system text (user input stays
  as plain text). Fenced code blocks get a gray-bordered box.
- **UX polish**: `ToolCallBlock` renders `liveOutput` while a tool is running
  so the user sees progress; falls back to `(running…)` placeholder.

### Round 3 — UX & architecture
- **Mouse click-to-focus tool blocks**: left-click on a tool block in the chat
  pane now toggles its expanded state and moves focus to it. Implemented via:
  - `src/ui/clickRegistry.js` — module-level map of `{toolId → Y range}`
  - `MessageList` populates it on each render (via `useEffect`) using
    `computeToolRegions()` which estimates row-span per block
  - `App.js` click handler subtracts chat-pane chrome offset and dispatches
    `focus_tool` + `toggle_tool_expanded` in one gesture
  - Wheel-up/down still scrolls history (2 rows per tick)
- **Mouse events carry x/y + press/release**: `mouse.js` now returns full
  coordinates so future click features can layer on without protocol work.
- **slash.js refactor**: dispatcher-only (43 lines); each command lives in
  `src/commands/handlers/*.js` (11 files, ≤37 lines each). New commands are
  now additive: drop a handler file + register in the `HANDLERS` map.
  Exposed `SLASH_COMMANDS` array for upcoming tab-autocomplete work.

All changes land with **88 tests passing** (11 new reducer tests, 6 mouse/
sparkline, 4 sidebar/chart, 6 slash registry, 5 click-region).

## Backlog (prioritized)
- **P2**: Tab autocomplete for slash commands (`SLASH_COMMANDS` array is
  already exported from `src/commands/slash.js`; just needs `InputBox.js`
  wiring via `ink-text-input`'s `onChange` + Tab key detection).
- **P3**: Theme system (light / dark / high-contrast) via env or `/theme`.
- **P3**: Refine mouse click target Y — currently uses a rough chatTopY=4
  offset; could read from rendered layout once ink exposes measurements.
- **P4**: Drag-to-select + copy-to-clipboard via `clipboardy`.

## Testing
- `yarn test` — node native test runner + `ink-testing-library` (51 tests)
- `yarn lint` — eslint flat config (clean)
- No remote backend / no curl flows; CLI is exercised via `node bin/cli.js`.

## Credentials / Keys
- API keys live in `.env` (copy from `.env.example`). Supports
  `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. No keys
  are committed.
