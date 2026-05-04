# Audit Report - `terminal_agent`

> Current scope: CLI-first AI coding agent with multi-provider LLM support, RAG, MCP, sessions, cost tracking, and multi-agent definitions.

## Current Strengths

- Multi-provider architecture is cleanly separated through provider adapters.
- Multi-agent support is scoped through agent definitions and registry.
- Read-only analyzer and write-capable refactorer agents are available.
- Tool handlers are modular and easier to test.
- Path safety, backups, command classification, undo, and loop detection form a solid baseline.
- RAG indexing uses batching, caching, file watching, and ignore handling.

## Recently Addressed

- Added `refactorer` as a dedicated agent instead of keeping refactoring behavior inside the default prompt.
- Slimmed the default production prompt around normal coding work.
- Hardened backup cleanup, RAG refresh, symlink path safety, command abort propagation, and cost currency configuration.
- Removed the legacy rich terminal interface stack, command hooks, dependencies, tests, and docs.

## Remaining Improvement Areas

| Area | Recommendation | Priority |
|---|---|---|
| API key storage | Move from plaintext env file to OS keychain or encrypted storage. | P1 |
| Provider integration tests | Add mocked SDK tests for provider failure and streaming edge cases. | P1 |
| MCP tests | Mock transport lifecycle and tool prefixing. | P1 |
| Prompt switching | Add `/prompt` command for runtime prompt selection. | P2 |
| Token budgets | Add per-turn token/cost guardrails. | P2 |
| Tool analytics | Track tool success/failure rates locally. | P2 |
| Network policy | Add allowlist controls for external tool/network access. | P2 |

## Security Notes

- Path traversal and symlink escapes are guarded by resolved path checks.
- Dangerous shell command patterns are blocked before execution.
- Write tools create backups that can be restored with `/undo`.
- API keys are still stored locally and should be upgraded to encrypted/keychain storage.
- RAG context should eventually be sanitized or clearly delimited against prompt injection.

## Suggested Next Tasks

1. Add provider adapter tests with mocked SDK responses.
2. Add MCP client lifecycle tests.
3. Implement encrypted or keychain-backed API key storage.
4. Add a `/prompt` command for prompt selection.
5. Add per-turn token/cost budget enforcement.
