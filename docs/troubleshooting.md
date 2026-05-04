# Troubleshooting

Common issues and quick fixes for `myagent`.

## Install and Startup

### `myagent` command is not found

Run from the repo root:

```bash
npm install
npm link
```

Or run without linking:

```bash
node ./bin/cli.js
```

### API key prompt keeps appearing

Check that `~/.myagent.env` exists and contains the expected key:

```env
GEMINI_API_KEY=...
```

For other providers, add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.

## Provider Issues

### Model/provider mismatch

Use `/model` to switch model and infer provider, or `/provider` followed by `/model`.

```text
> /model gpt-4o-mini
> /provider anthropic
> /model claude-3-5-haiku-latest
```

### Embedding errors during `/index`

Set a compatible embedding provider/model:

```env
MYAGENT_EMBEDDING_PROVIDER=gemini
MYAGENT_EMBEDDING_MODEL=gemini-embedding-2
```

## RAG and Context

### Search feels stale

Rebuild the index:

```text
> /index .
```

If context seems confusing, clear the session:

```text
> /clear
```

You can also move `index.json` aside and let the agent use direct file tools.

## Commands and Tools

### A command asks for confirmation

That means the command classifier marked it as mutating or unknown. Approve only if the command is expected.

### A command is blocked

Blocked commands match dangerous patterns. Run manual maintenance outside the agent if you truly need it.

### An edit failed

`edit_file` requires an exact target string and rejects ambiguous multi-match targets. Ask the agent to read the relevant range and retry with a more specific target, or use `replace_lines` when line numbers are known.

### Undo a bad edit

Use:

```text
> /undo list
> /undo 1
```

## Sessions and Memory

### Resume a session

```text
> /list
> /resume my-session
```

### Export a transcript

```text
> /save session.md
```

## Debugging

Enable debug logs:

```env
MYAGENT_DEBUG=1
```

Run lint and tests from the repo root:

```bash
npm run lint
npm test
```
