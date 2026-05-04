# Built-in Tools Reference

The agent has 11 built-in tools. Read-only tools can run in parallel; write tools run sequentially.

## Overview

| Tool | Category | Confirmation |
|---|---|---|
| `read_file` | Read-only | No |
| `list_dir` | Read-only | No |
| `grep_search` | Read-only | No |
| `get_file_info` | Read-only | No |
| `write_file` | Write | No |
| `edit_file` | Write | No; exact-match checks and backup |
| `batch_edit` | Write | No; exact-match checks and backup |
| `replace_lines` | Write | No; line-range checks and backup |
| `create_dir` | Write | No |
| `delete_file` | Write | Yes |
| `run_command` | Shell | Depends on command classifier |

## Read Tools

### `read_file`

Reads file content with line numbers. Supports ranged reads through `startLine` and `endLine`.

### `list_dir`

Lists files and folders in a directory.

### `grep_search`

Searches text or regex patterns recursively, using ripgrep when available and a Node fallback otherwise.

### `get_file_info`

Returns file metadata without reading file content.

## Write Tools

### `write_file`

Writes full file content and creates parent directories when needed. Existing files require explicit overwrite intent from the tool call.

### `edit_file`

Replaces one exact target string. It rejects missing targets and ambiguous multi-occurrence targets, creates a backup, writes the file, and schedules index refresh.

### `batch_edit`

Applies multiple exact replacements across one or more files. Ambiguous edits are skipped; successful file changes create backups.

### `replace_lines`

Replaces a specific line range. This is preferred for large-file refactoring when line numbers are known.

### `create_dir`

Creates directories recursively.

### `delete_file`

Deletes a file after confirmation. It refuses directories.

## Shell Tool

### `run_command`

Executes shell commands with streaming output and command classification:

| Verdict | Behavior |
|---|---|
| `auto` | Runs immediately for safe read-only commands. |
| `confirm` | Asks before running. |
| `blocked` | Refuses dangerous commands. |

Commands have a timeout and abort propagation. See [Security](./security.md#command-classifier).

## Extending with MCP

MCP server tools are exposed alongside built-ins with a server prefix, such as `github.create_issue`. See [MCP Servers](./mcp.md).
