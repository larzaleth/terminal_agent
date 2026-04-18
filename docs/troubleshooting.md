# Troubleshooting

Common issues and how to fix them.

## 🔑 API Keys

### `GEMINI_API_KEY missing`
The env file wasn't loaded or the key wasn't saved.

**Fix:**
```bash
cat ~/.myagent.env     # should show GEMINI_API_KEY=...
# If missing:
echo 'GEMINI_API_KEY=YOUR_KEY_HERE' >> ~/.myagent.env
chmod 600 ~/.myagent.env
```

### `OPENAI_API_KEY missing` / `ANTHROPIC_API_KEY missing`
You switched providers but haven't set the corresponding key.

**Fix:** Add to `~/.myagent.env` or local `.env`:
```env
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Keys saved but "not found" errors persist
Could be dotenv priority. Local `.env` in cwd takes precedence over global.

**Check:**
```bash
cat .env ~/.myagent.env 2>/dev/null
```

Restart the agent after editing.

## 🚀 Install & Run

### `myagent: command not found`
`npm link` didn't register the global binary.

**Fix:**
```bash
cd /path/to/ai-coding-agent
npm link
which myagent      # should print /usr/local/bin/myagent or similar
```

If `npm link` fails with EACCES:
```bash
# Option 1: use yarn link
yarn link

# Option 2: run without linking
yarn start

# Option 3: fix npm prefix
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
npm link
```

### `Error: Cannot find module '@google/genai'`
Dependencies weren't installed.

**Fix:**
```bash
yarn install
# or
npm install
```

### Node version errors (`SyntaxError`, `top-level await`)
Node < 18 doesn't support some ESM features.

**Fix:** Upgrade Node:
```bash
# nvm
nvm install 20 && nvm use 20

# asdf
asdf install nodejs 20 && asdf global nodejs 20
```

Check your version: `node --version` (must be ≥ 18).

## 🔌 Connectivity

### 429 rate limit errors
The built-in retry handles transient 429s (3 retries with exponential backoff). For persistent issues:

**Reduce concurrency** in `src/config/constants.js`:
```js
export const TOOL_CONCURRENCY = 2;        // was 5
export const EMBEDDING_CONCURRENCY = 2;   // was 5
```

**Or upgrade your API tier** (Gemini free tier has lower limits than paid).

### 503 / overloaded errors
Same retry logic applies. If the provider is down, wait and try again.

### Network timeouts behind corporate proxy
Set proxy env vars:
```env
HTTPS_PROXY=http://proxy.corp:8080
HTTP_PROXY=http://proxy.corp:8080
```

Or use custom endpoints if your org has a proxy:
```env
OPENAI_BASE_URL=https://proxy.corp/openai/v1
```

## 🔍 RAG / `/index`

### `/index` takes forever
Big codebase + cold cache.

**Speed up:**
- Ensure `.agent_cache/` is on fast storage (not a network drive).
- Exclude large folders — they should be in `IGNORE_DIRS` (see `src/config/constants.js`) or have names starting with `.`.
- Run on a smaller subfolder first: `/index src`.

### No RAG context used despite indexing
The agent silently skips RAG if `index.json` is missing or empty, or all scores are below threshold.

**Check:**
```bash
ls -lh index.json           # should exist and be non-trivial
jq 'length' index.json      # chunk count
```

If present but not used, **lower the threshold** in `src/config/constants.js`:
```js
export const RAG_THRESHOLD = 0.5;   // was 0.7
```

### Anthropic + `/index` fails
Anthropic has no native embedding API.

**Fix:** Keep a `GEMINI_API_KEY` set. The embedding path uses the provider inferred from the model, not the default `config.provider`. Or temporarily switch:
```
/provider gemini
/index .
/provider anthropic
```

## 💬 Agent Behavior

### Agent keeps calling the wrong tool
Usually a prompt issue. Be more specific:

Bad: _"fix the bug"_
Better: _"In src/auth.js, the `verifyToken` function returns true for expired tokens. Fix this by checking `exp` against `Date.now()`."_

### Max iterations reached
Agent ran `maxIterations` cycles without finishing. Usually means:
- Task is genuinely complex → raise `maxIterations` in config.
- Agent stuck in a loop → clear memory (`/clear`) and try a different phrasing.
- Model too weak for the task → `/model gpt-4o` or similar.

### Agent "hallucinates" a file that doesn't exist
RAG context might be confusing the model.

**Fix:**
```
/clear
```
Or temporarily move `index.json` aside to force the agent to use `list_dir`/`grep_search` directly.

### Diff preview shows changes I didn't expect
Read the diff carefully! This is exactly the value of diff preview — to catch bad edits before they land.

Press `n` (reject) and ask the agent to try again with more specific instructions.

## 💾 Memory & Transcripts

### `/clear` doesn't help; old context still used
The agent re-reads `memory.json` on every request. Make sure `/clear` completed:
```bash
cat memory.json    # should be []
```

### `memory.json` grew huge
Expected. The LLM-powered summarizer kicks in when `memory.length > maxMemoryTurns` (default 20) and compresses old messages.

To force compression manually, lower `maxMemoryTurns` in `agent.config.json` to e.g. `10`.

Or just `/clear` between unrelated tasks.

### `/save` fails with "No conversation memory to export"
You haven't had any chats yet in this session. Send at least one message first.

### Legacy memory.json format
If you have an old `memory.json` from v2.0 or earlier, it's automatically migrated on load (from `{role, parts}` to `{role, blocks}`). No action needed.

If migration fails, your memory is probably corrupted — delete and start fresh:
```bash
rm memory.json
```

## 🔌 MCP

### `MCP server 'xxx' failed to connect`
Most common causes:
1. **Command not found** — verify: `which <command>` or run it manually
2. **Missing env var** — check the server's README; add to `"env"` in config
3. **Network permissions** — some servers make outbound requests at startup
4. **Wrong `args`** — consult the server's docs

Debug by running the server standalone:
```bash
npx -y @modelcontextprotocol/server-github
# watch stderr for connection or auth issues
```

### MCP server connects but has no tools
Server might not be fully ready, or requires configuration via arg:
```json
{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/root"] }
```

Note the path arg is required for the filesystem server.

### MCP tool calls return `isError: true`
The server returned an application-level error (bad params, permission denied, etc.). Agent surfaces it:
```
❌ MCP error from 'github.create_issue': Bad credentials
```

Fix the underlying issue and retry.

## 💸 Cost

### Cost reported doesn't match my bill
Expected variance: **≤ 1%** (since we use `usageMetadata` direct from the API).

If larger variance:
- You might be using a model not in the pricing table. Agent falls back to `gemini-2.5-flash` pricing for unknowns. Fix: add your model to `PRICING` in `src/llm/cost-tracker.js`.
- Cache hits save tokens — they still show up in the provider's rate-limiting but not in billing.

### Embedding costs higher than expected
Normal on the first `/index`. Subsequent runs should hit the cache and drop to near-zero. If not:
- Cache directory might not be writable (`ls -la .agent_cache`).
- Your code is changing between runs (whitespace, imports) — this invalidates cache entries.

## 🐛 Crashes & Errors

### Unhandled promise rejection / stack traces
Open an issue with:
- Node version (`node --version`)
- OS
- The last command that triggered it
- Full stack trace

### Spinner (ora) freezes / output weird
Some terminals (Windows CMD, certain SSH multiplexers) don't handle ANSI escape sequences well.

**Fix:**
- Try a different terminal (WSL, Windows Terminal, iTerm2).
- Set `TERM=dumb` to disable fancy rendering (spinner + colors dim).

### "Operation was aborted" on long commands
Command exceeded the 60-second timeout.

**Fix:** Run long commands directly in a separate terminal. Or raise `COMMAND_TIMEOUT_MS` in `src/config/constants.js`.

## 🆘 Still stuck?

1. **Run the tests:** `yarn test` — if they fail, your installation is broken.
2. **Run the linter:** `yarn lint` — if you've modified code, syntax issues surface here.
3. **Check logs:** stderr output often has clues.
4. **Clear state and retry:**
   ```bash
   /clear
   rm -rf .agent_cache
   rm index.json cost-report.json memory.json
   ```
5. **Open an issue** with reproduction steps, expected behavior, and actual behavior.
