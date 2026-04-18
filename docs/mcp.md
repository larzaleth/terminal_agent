# MCP (Model Context Protocol) Servers

MCP is Anthropic's open standard for connecting AI agents to external tools. This agent supports **stdio transport** MCP servers — any server you can launch as a subprocess.

## What MCP Gives You

Instead of the agent being limited to built-in file/shell tools, you can plug in:

- **GitHub** — create issues, read repos, review PRs
- **Filesystem (sandboxed)** — restrict agent file access to specific dirs
- **MySQL / PostgreSQL** — query databases safely
- **Puppeteer / Playwright** — browser automation
- **Slack / Discord** — post messages
- **Google Drive, Notion, Linear** — pull documents
- **Custom servers** — anything that speaks the MCP protocol

The MCP ecosystem is growing. Browse the [official server list](https://github.com/modelcontextprotocol/servers) for ready-to-use options.

## Configuration

Add servers to `agent.config.json`:

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/me/projects"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost:5432/mydb"]
    }
  }
}
```

### Schema

Each entry under `mcpServers` is:

```json
{
  "command": "string",       // executable name (e.g. "npx", "uvx", "python")
  "args": ["string", "..."], // arguments passed to the command
  "env": { "KEY": "VALUE" }  // optional extra env vars for the subprocess
}
```

The agent merges `env` with `process.env` before spawning.

## Connecting

MCP servers do **not** auto-start on session launch — this keeps startup fast. Use `/mcp` to connect:

```
🧑 > /mcp
🔌 MCP connected: github (26 tools)
🔌 MCP connected: filesystem (8 tools)

🔌 MCP Servers:
  github (26 tools)
    • github.create_issue
    • github.search_repositories
    • ...
```

Connections persist until session end. You can also run `/mcp stop` to disconnect manually.

## Using MCP Tools

Once connected, tools are transparently merged with built-in tools. Prefixed with the server name:

```
🧑 > Create a GitHub issue on owner/repo titled "Docs need update"

🔧 github.create_issue({ owner: "owner", repo: "repo", title: "Docs need update" })
✅ Issue #123 created: https://github.com/owner/repo/issues/123
```

The LLM sees them as normal tools and calls them naturally based on user intent.

## Example: GitHub Server

### 1. Install + configure

```bash
# create a fine-scoped Personal Access Token at
# https://github.com/settings/tokens
```

`agent.config.json`:
```json
"mcpServers": {
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxx" }
  }
}
```

### 2. Use it

```
🧑 > /mcp
🔌 MCP connected: github (26 tools)

🧑 > List my open pull requests in owner/repo

🔧 github.list_pull_requests({ owner, repo, state: "open" })
🤖 You have 3 open PRs:
  1. #45 - Refactor auth
  2. #47 - Add dark mode
  3. #52 - Fix flaky tests
```

## Example: Filesystem Server (sandboxed)

Restrict agent file access to a specific directory:

```json
"mcpServers": {
  "fs": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/me/safe-dir"]
  }
}
```

The agent can now use `fs.read_file`, `fs.write_file`, etc., but **only** within `/home/me/safe-dir`. Built-in `read_file`/`write_file` are still available with normal cwd safety — MCP is complementary.

## Troubleshooting

### `⚠️ MCP server 'xxx' failed to connect`

Possible causes:
- Command not installed — try running it manually: `npx -y @modelcontextprotocol/server-github`
- Missing env var — check the server's README for required vars
- Wrong args — consult the server's docs

### Server connects but no tools show up

The server might not expose any, or it's initializing. Check stderr from the subprocess — it usually logs there. MCP servers occasionally require specific config files or a running parent service.

### Tool calls fail with `isError: true`

The server returned an error. The agent will surface it:

```
❌ MCP error from 'github.create_issue': Bad credentials
```

Fix the underlying issue (token scope, permissions, etc.) and retry.

### Performance

MCP adds a subprocess per configured server. Each is lightweight (single Node process), but having 10+ connected simultaneously will use RAM. Disconnect servers you're not actively using with `/mcp stop`.

## Building Your Own MCP Server

Anthropic has good docs: [modelcontextprotocol.io/docs](https://modelcontextprotocol.io/docs).

Minimal server in Python:

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server

app = Server("my-tool")

@app.list_tools()
async def list_tools():
    return [{
        "name": "echo",
        "description": "Echo back the input",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"]
        }
    }]

@app.call_tool()
async def call_tool(name, args):
    if name == "echo":
        return [{"type": "text", "text": args["text"]}]

if __name__ == "__main__":
    stdio_server(app).run()
```

Add to config:

```json
"mcpServers": {
  "myecho": {
    "command": "python",
    "args": ["/path/to/my_server.py"]
  }
}
```

## Internals

The MCP client lives in `src/mcp/client.js`. Key functions:

- `initMcp()` — spawn all configured servers, list their tools, register them
- `getMcpTools()` — returns `{ decls, has(name), handler(name, args) }`
- `callMcpTool(prefixedName, args)` — dispatch a tool call to the right server
- `listMcpStatus()` — inspection
- `shutdownMcp()` — close all transports gracefully

Tool names are prefixed `serverName.toolName` to prevent collisions. Results are converted from MCP's content-block format (`[{type: "text"|"resource", ...}]`) to plain strings for the agent loop.
