# TUI Mode (Ink-based UI)

`myagent` ships with a rich terminal UI powered by [Ink](https://github.com/vadimdemedes/ink) — React for the CLI.
When you launch in an interactive terminal, you get the full TUI. In non-TTY environments (CI, piped input, Docker logs), it gracefully falls back to the classic readline REPL.

## Layout

```
╭────────────────────────────────────────────────────────────────╮
│ 🤖 AI Coding Agent  v2.4       gemini:gemini-2.5-flash  │  $0… │  ← Header
╰────────────────────────────────────────────────────────────────╯
                                           ╭───────────────────╮
🧑 You                                     │   Session         │
refactor utils.js                          │ ────────────────  │
                                           │ Provider   gemini │
🤖 Assistant                               │ Model      flash  │
I'll read the file first.                  │                   │
  ▼ 📄 read_file(path=utils.js)  ✓         │   Activity        │
  ╭──────────────────────────────╮         │ ● idle            │
  │  args: { "path": "utils.js" } │         │                   │
  │  result:                      │         │   Cost            │
  │  1: export function main...   │         │ Spent   $0.0001  │
  ╰──────────────────────────────╯         │ Tokens      145   │
                                           │ Cache       67%   │
 ▶ ✏️ edit_file(path=utils.js)  ✓           │                   │
                                           ╰───────────────────╯
╭────────────────────────────────────────────────────────────────╮
│ 🧑 > _                                                         │  ← Input
╰────────────────────────────────────────────────────────────────╯
  Enter send  ↑ focus tool blocks  Ctrl+L clear  /help commands     ← Footer
```

**Panes:**
- **Header** — app name, provider:model, session cost, iteration counter
- **Messages (left)** — scrollable chat history with finalized turns in the terminal scrollback
- **Sidebar (right)** — live session status: provider, current activity, recent tools, cost, MCP servers
- **Input / Prompt (middle-bottom)** — text input box OR contextual prompt (diff review, confirmation)
- **Footer** — dynamic keyboard hints based on state

## Keyboard Shortcuts

### Normal mode (input is active)
- `Enter` — send message
- `↑` / `↓` — focus previous/next tool block in the current turn
- `Space` / `Enter` (when a tool is focused) — toggle expand/collapse
- `PgUp` / `PgDn` — scroll through earlier chat history
- `G` / `End` — jump back to the bottom of history
- `Esc` — **cancel** the current agent turn (if it's thinking/running)
- `Ctrl+L` — clear history (memory kept, visual reset)
- `Ctrl+C` — exit
- `Tab` — (planned) autocomplete slash commands

### Diff preview (edit_file approval)
- `a` / `Enter` — approve the edit
- `r` / `Esc` — reject
- `e` — "I'll edit manually" (cancels agent's edit)

### Confirmation prompt (run_command, delete_file)
- `y` / `Enter` — allow
- `n` / `Esc` — deny

## Long-running Tasks

If the agent takes a while to respond (big codebase, complex prompt, slow model):

- The **Footer shows a live elapsed timer** — `⠙ thinking 12s` — so you always know it's still working
- After **30 seconds** the elapsed counter turns **red** as a gentle warning
- A **retry notice** appears when the provider is rate-limited: `Retry 1/3 in 1.5s — HTTP 429`
- Press **`Esc`** to cancel — the agent finishes its current step and stops cleanly
- **Sidebar's status indicator** echoes the same state (● idle / ⠋ thinking / running)

You're never left wondering whether something's hung.

## Scrolling Through History

Chat history stays in the bounded pane. If older messages get trimmed from view, you can scroll back through them:

- **`PgUp`** — scroll up (show older)
- **`PgDn`** — scroll down (show newer)
- **`G`** — jump to bottom (vim-ish)
- While scrolled, `↑` / `↓` also scroll line-by-line
- A header indicator shows `↑ 11 earlier messages` above the visible window
- A footer indicator shows `↓ 4 newer messages — PgDn / G to return to bottom` when you're scrolled up
- Current turn messages always snap to bottom when a new one arrives (your live reading is preserved until you scroll)

If you need the full transcript, `/save filename.md` exports everything from `memory.json`.

## Tool Execution Live Panel

Every tool call the agent makes appears as an expandable block inline with the assistant's response:

```
  ▶ 🔍 grep_search(pattern=TODO)  ✓
```

`▶` = collapsed. Arrow up/down to focus, Space to expand:

```
  ▼ 🔍 grep_search(pattern=TODO)  ✓
  ╭───────────────────────────╮
  │  args: { "pattern": "TODO" } │
  │  result:                     │
  │  src/a.js:14: // TODO fix... │
  │  src/b.js:7:  // TODO later  │
  ╰───────────────────────────╯
```

Status icons:
- `⠋` (spinner) — tool is running
- `✓` (green) — completed successfully
- `✗` (red) — failed

## Interactive Diff Preview

When the agent proposes an `edit_file` change, the input area transforms into a diff review pane:

```
╔══════════════════════════════════════════════════════════════╗
║ ✏️  Proposed edit: src/utils.js                              ║
║    +1 / -1 lines                                             ║
║                                                              ║
║ --- src/utils.js (before)                                    ║
║ +++ src/utils.js (after)                                     ║
║ - function hello() {                                         ║
║ + async function hello() {                                   ║
║     return "world";                                          ║
║   }                                                          ║
║                                                              ║
║ [a] approve   [r] reject   [e] edit manually                 ║
╚══════════════════════════════════════════════════════════════╝
```

Press a key — no Enter required. The agent resumes (or cancels) instantly.

## Hybrid Mode Detection

| Environment | Mode |
|---|---|
| Interactive terminal (`process.stdin.isTTY && process.stdout.isTTY`) | Ink TUI |
| Non-TTY (pipe, redirect, CI) | Readline REPL |
| `MYAGENT_NO_TUI=1` | Readline REPL (forced) |
| `--no-tui` flag | Readline REPL (forced) |
| `--tui` flag | Ink TUI (forced) |

Readline mode is the same UX as previous versions — streaming text, spinner, slash commands, all work identically.

## Disabling the TUI

If the TUI misbehaves on your terminal (rare, but possible on niche emulators):

```bash
# One-off
myagent --no-tui

# Permanent
echo 'export MYAGENT_NO_TUI=1' >> ~/.bashrc
```

Or pipe output to force readline mode:

```bash
myagent 2>&1 | tee session.log
```

## Known Limitations

- **Older messages auto-hidden**: to keep the chat pane bounded, older messages are dropped from view when they overflow. They remain in `memory.json` and can be exported via `/save`. A "… N earlier messages hidden" indicator appears when trimming is active.
- **No mouse support** — by design, pure keyboard for better SSH/tmux compat.
- **Tab autocomplete** not yet implemented — tracked for a future release.
- **Very narrow terminals (< 90 cols)** — sidebar auto-hides to give the chat pane more room.
- **Running console.log from deep code paths is suppressed** in TUI mode to avoid clobbering the UI. Tool activity surfaces via ToolCallBlock instead. If you're debugging, use `--no-tui` to see raw output.
- **Alternate screen buffer** — the TUI enters a separate screen buffer (like vim / tmux / htop). When you exit, your original terminal scrollback is restored unchanged.

## Architecture Notes

The TUI lives in `src/ui/`:

```
src/ui/
├── App.js                    # root component + reducer
├── run.js                    # render entrypoint
├── prompter.js               # pluggable user-confirmation interface
├── h.js                      # React createElement alias
└── components/
    ├── Header.js
    ├── Sidebar.js
    ├── MessageList.js        # uses Ink's <Static> for scrollback
    ├── Message.js
    ├── ToolCallBlock.js      # expandable tool call widget
    ├── DiffPrompt.js         # interactive diff with keyboard shortcuts
    ├── ConfirmPrompt.js      # y/n confirmation
    ├── InputBox.js           # text input via ink-text-input
    └── Footer.js             # dynamic keyboard hints
```

The agent loop (`src/core/agents.js`) emits events via its existing callback API. The `App` reducer dispatches those events to UI state — no rewrite of agent core needed.

Tool handlers that used to prompt via readline (`edit_file`, `delete_file`, `run_command`) now call `getPrompter().confirm()` / `editApproval()`. Readline mode supplies the default implementations; TUI mode overrides them via `setPrompter()` to return Promises resolved by user keypresses in `DiffPrompt` / `ConfirmPrompt`.

For deeper architecture see [architecture.md](./architecture.md).

## Testing

UI components are unit-tested using `ink-testing-library`:

```bash
yarn test                             # all 45 tests (36 core + 9 UI)
node --test tests/ui/                 # UI components only
```

Tests render each component, assert on the frame output (stripped of ANSI codes), then unmount to release the renderer.
