# Getting Started

## Requirements

- **Node.js ≥ 18** (ESM + `fs/promises` required)
- **Yarn** or npm
- A **Gemini API key** — free tier available at [aistudio.google.com](https://aistudio.google.com/app/apikey)
- _(Optional)_ OpenAI / Anthropic keys if you want to use those providers

Verify your Node version:

```bash
node --version
# v18.0.0 or higher
```

## Installation

### Option 1: Global install via `npm link` (recommended for development)

```bash
git clone <repo-url> ai-coding-agent
cd ai-coding-agent
yarn install
npm link
```

After `npm link` you can run `myagent` from anywhere.

### Option 2: Local run

```bash
cd ai-coding-agent
yarn install
yarn start
```

### Option 3: One-off via `npx`

```bash
npx . # from inside the repo directory
```

## First Run

The first time you execute `myagent`, it prompts for your Gemini API key:

```
👋 Welcome to AI Coding Agent!

Looks like you haven't set up your Gemini API Key yet.

🔑 Enter Gemini API Key (get it at https://aistudio.google.com): AIzaSy...

✅ API Key saved to /home/you/.myagent.env
```

The key is saved with `0o600` permissions (owner read/write only). On subsequent runs, it's auto-loaded — you'll never be asked again.

## Your First Session

```
╔══════════════════════════════════════╗
║     🤖 AI Coding Agent v2.3        ║
║     Powered by Gemini               ║
╚══════════════════════════════════════╝
  Type your request, or use commands:
  /help  /clear  /index <folder>  /config  exit

🧑 > hello
🤖 Hello! I'm an AI coding agent running in your terminal. I can help you
read, write, search, and edit code, run shell commands, and more.

What would you like to work on?

⏱️  Done in 1.4s
💰 $0.000023 | 📊 85 tokens | 💾 0.0% cache hit

🧑 >
```

## Common Workflows

### 1. Understand a codebase

```
🧑 > /index /path/to/project
🚀 Starting batch indexing for 47 files...
✅ Index saved with 312 embeddings in 8.3s

🧑 > What does the authentication middleware do?
```

The agent will now use the semantic index to find relevant files and answer with context.

### 2. Refactor a file

```
🧑 > Refactor src/utils.js to use async/await instead of callbacks

📋 PLAN:
  1. Read src/utils.js to understand current structure
  2. Identify callback patterns that need converting
  3. Rewrite functions using async/await
  4. Show diff preview before applying

🔧 read_file(src/utils.js)
...
✏️ [edit_file] src/utils.js
--- src/utils.js (before)
+++ src/utils.js (after)
- function fetchData(url, callback) {
-   http.get(url, (err, res) => {
-     if (err) return callback(err);
-     callback(null, res.body);
-   });
- }
+ async function fetchData(url) {
+   const res = await http.get(url);
+   return res.body;
+ }
Apply this change? (Y/n/e=edit manually) > y
✅ Success: Edited src/utils.js
```

### 3. Run tests

```
🧑 > Run the test suite and tell me what fails

🔧 run_command(npm test)
✅ [run_command] Auto-approved (Safe read-only): npm test
🚀 [run_command] npm test
...
(live output streams here)
...

🤖 2 tests failed:
- `utils.test.js:14` — expected 5, got 4
- `auth.test.js:22` — TypeError: cannot read property 'id' of undefined

Want me to fix them?
```

### 4. Switch models mid-session

```
🧑 > /model gpt-4o-mini
✅ Switched to openai:gpt-4o-mini (session only — edit agent.config.json to persist)

🧑 > Explain the difference between useMemo and useCallback
```

### 5. Export your session

```
🧑 > /save my-debugging-session.md
✅ Transcript saved: /path/to/my-debugging-session.md
   23 messages, 14.2 KB
```

## Exiting

Type `exit`, `quit`, or press `Ctrl+C`. The agent will gracefully close any MCP connections before shutdown.

## Next Steps

- [**Configure**](./configuration.md) model, planner, MCP servers
- [**Learn all slash commands**](./commands.md)
- [**Set up OpenAI or Anthropic**](./providers.md)
- [**Connect MCP servers**](./mcp.md) for external tools
