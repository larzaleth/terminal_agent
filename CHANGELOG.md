# Changelog

All notable changes to **AI Coding Agent** (`myagent`).

## [Unreleased]

### Removed

- Removed the legacy rich terminal interface stack and all related runtime dependencies.
- Removed the old terminal copy command and its command registration.
- Removed obsolete UI component tests and UI-only documentation.

### Changed

- The CLI entrypoint now uses one interactive readline flow plus one-shot `--agent` mode.
- Tool output streams directly to stdout/stderr.
- Tool confirmations now use `src/core/prompter.js`.
- Documentation now describes the current CLI-first architecture.

## [2.6.0] - 2026-05-04

### Added

- Intelligent same-file read loop detection with write-progress reset.
- Mega-file refactoring strategy in the system prompt.
- PowerShell compatibility guidance in prompts.
- Dedicated `refactorer` agent with its own prompt.

### Fixed

- Migrated embeddings to `gemini-embedding-2`.
- Fixed YOLO mode bypass for command/delete confirmation.
- Hardened config loading by searching upward for `agent.config.json`.
- Improved safe PowerShell command classification.
- Reduced false failure detection for no-match searches.
- Added overwrite protection to `write_file`.

## [2.5.1] - 2026-05-04

### Changed

- Optimized production prompt for tool-first reasoning and scope discipline.
- Updated model defaults.
- Increased max iterations for larger tasks.
- Added persistent YOLO mode.
- Added `replace_lines` for faster large-file edits.
- Improved Windows/PowerShell behavior.

## [2.5.0] - 2026-04

### Added

- Multi-agent architecture with declarative agent definitions.
- Built-in `default` and `analyzer` agents.
- One-shot `--agent` CLI mode.
- `/agent` slash command.
- `/undo` command.
- Session persistence commands and shortcuts.
- `batch_edit` tool.
- Adaptive context window management.
- Git-aware system prompt.
- File watcher for auto-reindexing.
- Multi-agent architecture documentation and tests.

### Changed

- `runAgent` accepts scoped agent definitions.
- Slash command registry expanded.
- CLI entrypoint supports one-shot agent runs.

### Dependencies Added

- `chokidar` for file watching.

## [2.3.0] - 2026-01-16

### Added

- Multi-provider LLM support through normalized provider adapters.
- MCP client with stdio transport and tool prefixing.
- New slash commands: `/model`, `/provider`, `/save`, `/mcp`.
- Session transcript export.
- Comprehensive documentation.

### Changed

- Normalized message format replaced provider-specific memory shape.
- Provider-agnostic agent loop.
- Runtime config mutation through Proxy.

### Fixed

- Operator-precedence bug in cost tracking.

## [2.2.0] - 2026-01-16

### Added

- Async filesystem migration.
- Streaming `run_command`.
- Command classifier.
- ESLint 9 and Prettier.
- Unit tests for utils, chunking, and command classification.

### Changed

- Tests run via Node's built-in `node:test`.

## [2.1.0] - 2026-01-16

### Added

- Modular source folder structure.
- Central constants module.

### Changed

- Improved path safety, token counting, chunking, embedding normalization, index caching, planner skip, and retry handling.

### Removed

- Dead root entry files and committed runtime memory.

## [2.0.0] - prior releases

Earlier versions had a Gemini-only implementation, basic slash commands, simple RAG, function calling, and memory summarization.
