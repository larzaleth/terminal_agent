# Contributing

Thanks for taking the time to contribute! This page walks you through the dev setup and conventions.

## Dev Setup

```bash
git clone <repo>
cd ai-coding-agent
yarn install

# Set up at least one provider key
echo "GEMINI_API_KEY=..." > ~/.myagent.env

# Verify everything works
yarn test
yarn lint
yarn start
```

Requires **Node ≥ 18** and **yarn**.

## Scripts

| Command | Description |
|---|---|
| `yarn start` | Run the agent CLI |
| `yarn test` | Run 36 unit tests via `node --test` |
| `yarn lint` | ESLint flat config |
| `yarn lint:fix` | Auto-fix lint issues where safe |
| `yarn format` | Prettier rewrite all files |
| `yarn format:check` | Prettier verify |

## Code Style

- **ESM only** — no CommonJS `require`
- **2-space indent, double quotes, trailing commas** — enforced via Prettier
- **Named exports preferred** over default exports
- **No classes unless genuinely stateful** — prefer pure functions
- **Error messages start with a verb** — "Failed to load X", not "X is broken"

Run `yarn format && yarn lint` before opening a PR.

## Testing

```bash
yarn test                            # all tests
node --test tests/utils.test.js      # single file
```

**Add tests when:**
- Adding a new feature (happy path + 1-2 edge cases)
- Fixing a bug (regression test)
- Changing a non-trivial function signature

**Don't add tests for:**
- Simple wrappers around SDK calls (test would just assert the mock was called)
- Interactive prompts (readline is awkward to test)
- Live provider calls (keys, flakiness)

Test style: plain `node:test` + `node:assert/strict`. No mocking framework. See existing tests for patterns.

## Project Conventions

### File organization

- One class/module per file.
- Co-locate tests with code they cover: `src/utils/utils.js` ↔ `tests/utils.test.js`.
- Shared constants go in `src/config/constants.js` — avoid magic numbers in source files.

### Provider adapters

Implement the contract in `src/llm/providers/base.js`. Keep adapters **thin** — they're translators between normalized format and SDK-native format. Business logic (retry, cost tracking, memory) stays in core.

### Tool handlers

Each tool in `src/tools/tools.js` should:
1. Validate inputs (path safety, required fields, empty strings).
2. Log what it's doing (the `console.log(\`\n📄 [tool_name] ...\`)` line).
3. Return a string (even for errors — the LLM reads these).
4. Include a helpful tip on error (`💡 Tip: ...`).
5. Have a matching declaration in `toolDeclarations` with clear descriptions.

### Slash commands

Each new slash command goes in `src/commands/slash.js`. Follow the existing `case` pattern. Return `true` when the command was handled (skips agent loop), `false` or `default` otherwise.

### Error handling

- **Throw at boundaries** (parsing config, opening connections).
- **Return error strings from tool handlers** (the LLM needs to see them).
- **Use `retry()` from `utils.js`** for anything network-touching.
- **No silent failures** — either handle, return, or throw. `try {...} catch {}` with nothing inside is only OK for optional paths (e.g. RAG is best-effort).

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short description>

<optional longer body>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`.

Examples:
```
feat(providers): add Groq support
fix(mcp): handle transport disconnect mid-call
docs(rag): clarify chunk overlap tuning
refactor(tools): extract diff preview into separate module
perf(semantic): pre-normalize vectors for O(n) search
test(utils): cover Windows absolute path edge cases
```

Short, lowercase, present tense. One commit = one logical change.

## Pull Request Workflow

1. Fork + branch off `main`
2. Implement with tests (where applicable)
3. Run `yarn lint && yarn format && yarn test` — all green
4. Commit using Conventional Commits
5. Push + open PR with:
   - **What** changed (1-3 bullets)
   - **Why** (problem being solved)
   - **Testing** done (automated + manual if any)
   - **Screenshots** for UX changes

Maintainers will review within a few days. Small focused PRs merge fastest.

## Adding a Provider

Example: adding Groq.

1. **Create adapter** — `src/llm/providers/groq.js`. Copy `openai.js` as a template (Groq uses OpenAI-compatible API). Override `baseURL`.

2. **Register** in `src/llm/providers/index.js`:
   ```js
   case "groq":
     provider = new GroqProvider({ apiKey: process.env.GROQ_API_KEY });
     break;
   ```
   Add to `inferProvider()` if you want model-name inference:
   ```js
   if (m.startsWith("llama-") || m.startsWith("mixtral-")) return "groq";
   ```

3. **Pricing** in `src/llm/cost-tracker.js`:
   ```js
   "llama-3.1-70b-versatile": { input: 0.00059, output: 0.00079 },
   ```

4. **Test** in `tests/providers.test.js`:
   ```js
   test("inferProvider: recognizes groq models", () => {
     assert.equal(inferProvider("llama-3.1-70b-versatile"), "groq");
   });
   ```

5. **Docs** — add a row to `docs/providers.md`.

## Adding a Tool

Example: adding `web_search`.

1. **Handler** in `src/tools/tools.js`:
   ```js
   web_search: async ({ query }) => {
     try {
       console.log(`\n🌐 [web_search] "${query}"`);
       // ... implementation
       return `✅ Found 3 results:\n...`;
     } catch (err) {
       return `❌ Search failed: ${err.message}`;
     }
   },
   ```

2. **Declaration** in `toolDeclarations`:
   ```js
   { name: "web_search", description: "...", parameters: {...} }
   ```

3. **Classification** — if read-only, add to `READ_ONLY_TOOLS` in `src/utils/utils.js` so it runs in parallel.

4. **Tests** as needed.

## Adding a Slash Command

Just add a `case` in `src/commands/slash.js`. Update `/help` text too. Documentation in `docs/commands.md`.

## Reporting Bugs

Before opening an issue:
1. Try on a clean install (delete `.agent_cache`, `memory.json`, `index.json`).
2. Reproduce with minimal config.
3. Confirm on Node ≥ 18.

Include in the issue:
- Version (`myagent --version` or check `package.json`)
- Node version
- OS
- Exact steps to reproduce
- Expected vs actual behavior
- Full error output / stack trace

## Asking Questions

For setup/usage questions, check [Troubleshooting](./troubleshooting.md) first. Then open a **Discussion** (not an Issue) — questions aren't bugs.

## License

By contributing, you agree your changes are released under the MIT license (same as the project).
