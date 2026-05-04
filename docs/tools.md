# Built-in Tools Reference

The agent has 9 built-in tools. The LLM picks the right tool based on the user's intent — you rarely need to reference them directly, but understanding what's available helps you write better prompts.

## 📋 Overview

| Tool | Category | Needs confirm? |
|---|---|---|
| [`read_file`](#read_file) | Read-only | ❌ |
| [`list_dir`](#list_dir) | Read-only | ❌ |
| [`grep_search`](#grep_search) | Read-only | ❌ |
| [`get_file_info`](#get_file_info) | Read-only | ❌ |
| [`write_file`](#write_file) | Write | ❌ (auto-applied) |
| [`edit_file`](#edit_file) | Write | ✅ **diff preview** |
| [`create_dir`](#create_dir) | Write | ❌ |
| [`delete_file`](#delete_file) | Write | ✅ always asks |
| [`run_command`](#run_command) | Write | ⚙️ depends on [classifier](./security.md#command-classifier) |

Read-only tools run **in parallel** (concurrency cap = 5). Write tools run **sequentially** to avoid race conditions.

---

## `read_file`

Read file content with line numbers (important for precise edits later).

**Arguments:**
- `path` (string, required) — file path

**Output:**
```
1: import fs from "fs";
2:
3: export function main() {
...
```

- Max 8000 chars; truncated with marker.
- Directories are rejected (use `list_dir`).
- Paths must stay inside cwd ([path safety](./security.md#path-safety)).

## `list_dir`

List files and folders in a directory.

**Arguments:**
- `dir` (string, required) — directory path

**Output:**
```
📁 src/
📁 tests/
📄 package.json
📄 README.md
```

Hidden files (starting with `.`) are still shown.

## `grep_search`

Recursive text/regex search across files.

**Arguments:**
- `pattern` (string, required) — search term
- `dir` (string, default `"."`) — directory to search
- `include` (string, optional) — file glob-like filter (e.g. `"*.js"`)
- `isRegex` (boolean, default `false`) — treat pattern as regex

**Output:** first 50 matches as `file:line: content`.

**Ignores:** `node_modules`, `.git`, `dist`, `build`, binary extensions (images, fonts, archives, etc.).

```
🧑 > Find all uses of "deprecated" in the codebase

🔧 grep_search({ pattern: "deprecated" })
✅ Found 7 matches:
src/utils.js:42: // @deprecated — use newHelper() instead
src/api.js:15: * @deprecated Will be removed in v3
...
```

## `get_file_info`

Return file metadata without reading contents. Useful for size checks.

**Arguments:**
- `path` (string, required)

**Output:**
```json
{
  "name": "utils.js",
  "path": "src/utils.js",
  "type": "file",
  "size": "2134 bytes (2.08 KB)",
  "modified": "2026-01-16T10:14:22.000Z",
  "created": "2026-01-15T18:30:00.000Z",
  "extension": ".js"
}
```

## `write_file`

Write full content to a file (overwrites if exists). Auto-creates parent directories.

**Arguments:**
- `path` (string, required)
- `content` (string, required) — **complete** file content, not a diff

Best for **new files** or **complete rewrites**. For small edits, the LLM should use `edit_file` (saves tokens).

## `edit_file`

Find an exact target string and replace it. **Only the first occurrence** is replaced.

**Arguments:**
- `path` (string, required)
- `target` (string, required) — exact string to find (whitespace must match)
- `replacement` (string, required) — new string

### Diff preview

Before applying, the agent shows a **colored unified diff** and asks for confirmation:

```
✏️ [edit_file] src/utils.js
--- src/utils.js (before)
+++ src/utils.js (after)
  export function detectOS() {
    const platform = os.platform();
-   const map = { win32: "Windows", darwin: "macOS", linux: "Linux" };
+   const map = { win32: "Windows", darwin: "macOS", linux: "Linux", freebsd: "FreeBSD" };
    return map[platform] || platform;
  }
  📊 +1 / -1 lines
Apply this change? (Y/n/e=edit manually) >
```

**Choices:**
- `Y` (or Enter) — apply
- `n` — reject, file untouched
- `e` — cancel, "I'll edit manually" (file untouched, agent informed)

### Auto-approve

Skip confirmation by setting `MYAGENT_AUTO_APPROVE_EDITS=1` in your env, or when running in a non-TTY environment (CI, piped input).

## `create_dir`

Create a directory (with parents if needed).

**Arguments:**
- `dir` (string, required)

Fails silently if dir already exists (with a warning message).

## `delete_file`

Delete a file. **Always requires confirmation**, regardless of env settings.

**Arguments:**
- `path` (string, required)

Refuses to delete directories — for that, tell the agent to use `run_command` with `rm -rf` (also confirmed).

## `run_command`

Execute a shell command. Output **streams live** to your terminal (not blocked like `execSync`).

**Arguments:**
- `cmd` (string, required)

### Three-tier safety

The command is classified by `src/tools/command-classifier.js`:

| Verdict | Example | Behavior |
|---|---|---|
| `auto` | `ls`, `git status`, `npm test`, `pwd` | Runs immediately |
| `confirm` | `npm install pkg`, `git push`, anything with `\|` or `&&` | Asks Y/n first |
| `blocked` | `rm -rf /`, `curl \| sh`, `dd of=/dev/sda` | Refused entirely |

See [Security](./security.md#command-classifier) for the full rule set.

### Auto-approve examples

```
🧑 > show me the git log

🔧 run_command({ cmd: "git log --oneline -20" })
✅ [run_command] Auto-approved (Safe read-only): git log --oneline -20
🚀 [run_command] git log --oneline -20
abc1234 feat: add diff preview
def5678 fix: path traversal
...
```

### Confirm example

```
🧑 > install the lodash package

🔧 run_command({ cmd: "npm install lodash" })
⚠️ Agent wants to run (npm install modifies dependencies): `npm install lodash`
Allow? (Y/n) > y
🚀 [run_command] npm install lodash
... (live output streams) ...
```

### Blocked example

```
🧑 > clean up the system (the LLM wrote: rm -rf /)

🔧 run_command({ cmd: "rm -rf /" })
🛑 [run_command] BLOCKED: rm -rf /
🛑 Blocked: Refusing to run potentially dangerous command.
Reason: Matches a dangerous pattern
💡 If you genuinely need this, run it manually outside the agent.
```

### Timeout

Commands are killed with SIGKILL after **60 seconds** by default. Tune via `COMMAND_TIMEOUT_MS` in `src/config/constants.js`.

## Tool Concurrency

```
config/constants.js:
  TOOL_CONCURRENCY = 5
  EMBEDDING_CONCURRENCY = 5
```

Read-only tools (`read_file`, `list_dir`, `grep_search`, `get_file_info`) from a single LLM turn execute in parallel up to this cap. Writes always serialize.

Tune downward if you hit rate limits; upward if you have a local/high-throughput setup.

## Extending with MCP

To add more tools without writing code, use MCP servers. See [MCP Servers](./mcp.md). Their tools appear prefixed (e.g. `github.create_issue`) and are automatically exposed to the LLM.
