# AI Coding Agent - Improvement Roadmap

## Completed

### Performance & Infrastructure

- [x] **Batch Embedding API Calls**: Faster indexing in `semantic.js`.
- [x] **Response Caching**: Fewer API calls for repeated queries.
- [x] **Modular Tools Architecture**: Split tool handlers into `src/tools/handlers/`.
- [x] **Structured Logging**: Added `logger.js` with `MYAGENT_DEBUG` support.
- [x] **Streaming Tool Output**: Long-running commands stream live to the CLI.
- [x] **Non-blocking Index Refresh**: File mutations schedule debounced index updates.

### Safety & Reliability

- [x] **Automatic Backups**: Write tools create backups in `.agent_backups/`.
- [x] **Backup Cleanup**: Old backups are pruned automatically.
- [x] **Edit Safety**: Ambiguous multi-occurrence edits are rejected.
- [x] **Atomic File Writes**: Temp-file then rename prevents partial writes.
- [x] **Command Classifier**: Safe commands can auto-run, dangerous ones are blocked.
- [x] **Path Safety Hardening**: Symlink and traversal checks protect the workspace boundary.
- [x] **Abort Propagation**: Long-running commands receive cancellation cleanly.

### Features

- [x] **Multi-provider LLM**: Gemini, OpenAI, and Anthropic support.
- [x] **MCP Integration**: Connect external tool servers.
- [x] **Cost Tracking**: Real usage tracking in USD and IDR.
- [x] **Multi-agent System**: Default, analyzer, and refactorer agents.
- [x] **Session Persistence**: Save and resume conversations.
- [x] **Undo/Rollback Command**: Restore recent backups with `/undo`.
- [x] **`.gitignore`-aware Indexing**: RAG walking respects root ignore patterns.
- [x] **Watch Mode**: Auto-reindex files as they change on disk.

## Next Priorities

### Smart Features

- [ ] **Sub-Agent Delegation**: Let the main agent spawn scoped child agents.
- [ ] **Hybrid Search**: Combine lexical and vector search for exact symbol retrieval.
- [ ] **Tool Use Learning**: Track tool success and adapt instructions over time.

### Security

- [ ] **API Key Encryption**: Store keys encrypted with a user password.
- [ ] **Sandboxed Command Execution**: Optional Docker-backed command isolation.
- [ ] **Network Access Control**: Restrict outbound domains for MCP/tools.

### Monitoring

- [ ] **Local Metrics Dashboard**: Track tool success, latency, and cost per task.
