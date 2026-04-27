# AI Coding Agent - Improvement Roadmap

## ✅ Completed (v2.5.0)

### 1. Performance & Infrastructure
- [x] **Batch Embedding API Calls**: 5-10x faster indexing in `semantic.js`.
- [x] **Response Caching**: Reduction in API calls for repeated queries.
- [x] **Modular Tools Architecture**: Split `tools.js` god-file into per-tool handlers in `src/tools/handlers/`.
- [x] **Structured Logging**: Added `logger.js` with `MYAGENT_DEBUG` support.
- [x] **Streaming Tool Output**: Long-running commands now stream live to the TUI.

### 2. Safety & Reliability
- [x] **Automatic Backups**: Every `write_file` and `edit_file` now creates a backup in `.agent_backups/`.
- [x] **`edit_file` Safety**: Added detection for multiple occurrences of target strings to prevent accidental corruptions.
- [x] **Atomic File Writes**: Prevents file corruption during crashes.
- [x] **Command Classifier**: Smart auto-approval for safe commands, blocking for dangerous ones.

### 3. Features
- [x] **Multi-provider LLM**: Gemini, OpenAI, and Anthropic support.
- [x] **MCP Integration**: Connect to external tool servers.
- [x] **Interactive Diff Preview**: Review changes before applying them.
- [x] **Cost Tracking**: Real-time USD cost calculation based on token usage.

---

## 🚀 Next Priorities (v2.6.0+)

### 1. Smart Features (Priority High)
- [x] **Context Window Management**: Adaptive trimming/summarization when tokens approach limits.
- [x] **Git-Aware System Prompt**: Auto-include branch name, status, and modified files in system instructions.
- [x] **Multi-file Edit Tool**: A `batch_edit` tool to apply multiple changes across different files in one turn.

### 2. User Experience (Priority Medium)
- [x] **Session Persistence**: Save and resume conversations across terminal restarts using `/session` and `/resume`.
- [x] **Undo/Rollback Command**: A `/undo` slash command to restore the last backup created by the agent.
- [ ] **Search Improvement**: Upgrade RAG with Hybrid Search (BM25 + Vector) for better retrieval of exact symbols.

### 3. Advanced Agentic Power (Priority Low)
- [ ] **Sub-Agent Delegation**: Ability for the main agent to spawn a child agent for specialized sub-tasks.
- [ ] **Watch Mode**: Auto-reindex files as they change on disk.
- [ ] **Tool Use Learning**: Track which tools succeed most often and adjust instructions dynamically.

---

## 🔒 Security Roadmap
- [ ] **API Key Encryption**: Store keys encrypted with a user password instead of plain text in `.env`.
- [ ] **Sandboxed Command Execution**: Option to run commands inside a Docker container.
- [ ] **Network Access Control**: Restrict which domains the agent can reach via MCP or tools.

---

## 📈 Monitoring & Analytics
- [ ] **Telemetry**: Local metrics dashboard showing tool success rates, cost per task, and latency.
- [ ] **Session Replay**: Tool to "play back" a TUI session from a transcript for debugging.
ecture** - Extensibility

Would you like me to implement any of these improvements right away?
