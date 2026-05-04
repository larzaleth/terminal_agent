import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadConfig } from "../config/config.js";
import { log } from "../utils/logger.js";
import { getPackageVersion } from "../utils/version.js";

// ─── Connection lifecycle ───────────────────────────────────────────
const _clients = new Map();   // serverName → Client
const _toolMap = new Map();   // prefixedName ("github.create_issue") → { server, originalName, schema }
let _initialized = false;

/**
 * Connect to all MCP servers declared in agent.config.json under `mcpServers`.
 * Idempotent — subsequent calls are no-ops.
 *
 * Config shape:
 *   "mcpServers": {
 *     "github": { "command": "npx", "args": ["@modelcontextprotocol/server-github"], "env": {...} }
 *   }
 */
export async function initMcp() {
  if (_initialized) return;
  _initialized = true; // mark early so failures don't trigger retries mid-session

  const config = loadConfig();
  const servers = config.mcpServers || {};
  const names = Object.keys(servers);
  if (names.length === 0) return;

  for (const name of names) {
    const spec = servers[name];
    try {
      const transport = new StdioClientTransport({
        command: spec.command,
        args: spec.args || [],
        env: { ...process.env, ...(spec.env || {}) },
      });
      const client = new Client({ name: "ai-coding-agent", version: getPackageVersion() }, { capabilities: {} });
      await client.connect(transport);
      _clients.set(name, client);

      const toolsResp = await client.listTools();
      for (const t of toolsResp.tools || []) {
        // Prefix so multiple servers can expose "read_file" etc. without collision.
        const prefixed = `${name}.${t.name}`;
        _toolMap.set(prefixed, {
          server: name,
          originalName: t.name,
          schema: {
            name: prefixed,
            description: `[MCP:${name}] ${t.description || ""}`.trim(),
            parameters: t.inputSchema || { type: "object", properties: {} },
          },
        });
      }

      log.info(`🔌 MCP connected: ${name} (${toolsResp.tools?.length ?? 0} tools)`);
    } catch (err) {
      log.warn(`⚠️ MCP server '${name}' failed to connect: ${err.message}`);
    }
  }
}

// ─── Tool registry (consumed by agents.js) ──────────────────────────
export async function getMcpTools() {
  await initMcp();

  const decls = Array.from(_toolMap.values()).map((t) => t.schema);
  return {
    decls,
    has: (name) => _toolMap.has(name),
    handler: async (name, args) => callMcpTool(name, args),
  };
}

export async function callMcpTool(prefixedName, args) {
  const entry = _toolMap.get(prefixedName);
  if (!entry) return `Error: MCP tool '${prefixedName}' not registered.`;
  const client = _clients.get(entry.server);
  if (!client) return `Error: MCP server '${entry.server}' not connected.`;

  try {
    const result = await client.callTool({ name: entry.originalName, arguments: args || {} });
    // MCP result shape: { content: [{type, text, ...}], isError }
    if (result.isError) {
      return `❌ MCP error from '${prefixedName}': ${renderMcpContent(result.content)}`;
    }
    return renderMcpContent(result.content);
  } catch (err) {
    return `❌ MCP call failed (${prefixedName}): ${err.message}`;
  }
}

function renderMcpContent(content) {
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((c) => {
      if (c.type === "text") return c.text;
      if (c.type === "resource") return `[resource] ${c.resource?.uri || ""}`;
      return `[${c.type}]`;
    })
    .join("\n");
}

// ─── Management / introspection ─────────────────────────────────────
export function listMcpStatus() {
  return Array.from(_clients.keys()).map((server) => ({
    server,
    connected: true,
    tools: Array.from(_toolMap.values()).filter((t) => t.server === server).map((t) => t.schema.name),
  }));
}

export async function shutdownMcp() {
  const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms));
  for (const [name, client] of _clients) {
    try {
      // Don't let a single stuck MCP server block the whole app from exiting
      await Promise.race([client.close(), timeout(1000)]);
      log.info(`🔌 MCP disconnected: ${name}`);
    } catch {
      /* best-effort */
    }
  }
  _clients.clear();
  _toolMap.clear();
  _initialized = false;
}
