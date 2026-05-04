# terminal_agent — PRD & Changelog

## Original problem statement
User minta audit codebase `terminal_agent` (https://github.com/larzaleth/terminal_agent) dan implementasi multi-agent architecture — khususnya read-only analyzer agent — dengan clean refactor (bukan monkey-patch).

## Application purpose
CLI coding agent mirip Cursor/Aider: multi-provider LLM (Gemini/OpenAI/Anthropic), semantic RAG, MCP integration, interactive diff preview, cost tracking. Node.js ESM, Ink TUI + readline fallback.

## User personas
1. **Solo developer** — pakai di terminal, modifikasi code dengan safety rails
2. **Code reviewer** — pakai read-only analyzer untuk audit
3. **Agent builder** — bikin custom sub-agent untuk workflow khusus

## Core requirements (static)
- Multi-provider LLM dengan unified message format
- Tool registry modular (10 built-in + MCP dynamic)
- Safety: path traversal block, command classifier, atomic writes, backup
- Cost tracking (USD + IDR)
- Memory persistence + compression
- Session save/resume, undo

## What's been implemented (Jan 2026, Phase 1)
### Fixes (P0 blockers)
- ESLint error di run_command.js (empty else) — FIXED
- 23 failing tests (Ink UI components, mouse parser, reducer, diff) — FIXED, 145/145 pass
- Loop detection false-positive (was global cumulative) — rewritten to sliding window (5 calls, threshold 3)
- Double memory compression — saveMemory no longer compresses
- Silent embedding failures — log.warn + counter

### Multi-agent architecture (clean refactor, NO monkey-patch)
- `runAgent()` now accepts `{ definition }` for tool filter + prompt override + model/provider/maxIterations
- `src/core/agents/registry.js` — register/get/list/has, frozen definitions
- Built-in: `default` (full) + `analyzer` (read-only, 4 tools, disableMcp)
- CLI: `myagent --agent <name> "request..."` (one-shot mode, stdout=result, stderr=progress)
- Slash: `/agent list | info <n> | run <n> <req>`
- 14 new tests (7 registry + 7 integration with stub provider)

### Docs
- `AUDIT.md` — 30 prioritized tasks (P0 done, P1/P2 backlog)
- `docs/multi-agent-architecture.md` — pattern + contract + test recipe
- `docs/commands.md` — `/agent` section
- `IMPROVEMENTS.md` — Phase 1 changelog + P1/P2 backlog

## Prioritized backlog (P1 — next phase)
- T-08: Backup cleanup (TTL / keep-N)
- T-09: USD→IDR rate env var or cached API
- T-10: .gitignore-aware indexing (npm `ignore`)
- T-11: Async/debounced updateIndex after write
- T-12: API key encryption (keytar)
- T-13: Token budget per turn
- T-15: Provider message-format unit tests
- T-16: MCP client unit tests
- T-17: Tool output truncation marker
- T-18: Anthropic max_tokens from config
- T-19: Signal propagation to run_command child

## Backlog (P2 — polish)
- Unused vars warnings (16)
- /prompt slash command
- /stats parity in readline mode
- Custom tool plugin API
- Sandboxed command execution (Docker)
- Multimodal input
- Telemetry dashboard
- Prompt-injection sanitization in RAG context
- MCP signature check
- Audit log (.agent_audit.log)
- Inter-agent delegation tool
- README v2.4 → v2.5.1 sync

## Next Actions
- User reviews Phase 1 changes, commits via "Save to GitHub" feature
- Phase 2: pick P1 items based on priority
- E2E test with real LLM (needs user's GEMINI/OPENAI/ANTHROPIC key)
