# Getting Started

This guide gets `myagent` running locally and shows the most common workflows.

## Requirements

- Node.js 18 or newer
- npm
- At least one provider API key

## Install

```bash
git clone <repo>
cd ai-coding-agent
npm install
npm link
```

Run:

```bash
myagent
```

First run asks for a Gemini API key and stores it in `~/.myagent.env`.

## Basic Session

```text
> /index .
> Refactor src/utils.js to use async/await
> /model claude-3-5-haiku-latest
> /save session.md
```

## Common Workflows

### Index a project

```text
> /index .
```

The semantic index is stored as `index.json`; cached embeddings live in `.agent_cache/`.

### Refactor a file

```text
> Refactor src/utils.js to use async/await instead of callbacks

PLAN:
  1. Read src/utils.js to understand current structure
  2. Identify callback patterns that need converting
  3. Rewrite functions using async/await
  4. Apply the edit with backup protection

read_file(src/utils.js)
...
Success: Edited src/utils.js
```

### Run tests

```text
> Run the test suite and tell me what fails
```

Safe read-only commands can run immediately. Mutating or unknown commands ask first.

### Use a specialized agent

```bash
myagent --agent analyzer "audit src/"
myagent --agent refactorer "split src/App.jsx into smaller modules"
```

Inside a session:

```text
> /agent list
> /agent run analyzer audit src/core
```

## Useful Commands

| Command | Purpose |
|---|---|
| `/help` | Show commands |
| `/new` | Start fresh |
| `/index <folder>` | Build semantic index |
| `/model [id]` | Show or switch model |
| `/provider [name]` | Show or switch provider |
| `/save [file]` | Export transcript |
| `/session save <name>` | Save session |
| `/resume <name>` | Resume session |
| `/undo [N]` | Restore recent backups |
| `/cost report` | Show usage cost |
| `/mcp` | Connect/list MCP servers |

## Next Steps

- Configure providers in [configuration.md](./configuration.md).
- Learn all commands in [commands.md](./commands.md).
- Review tool behavior in [tools.md](./tools.md).
- See the architecture in [architecture.md](./architecture.md).
