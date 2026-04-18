# LLM Providers

The agent supports three LLM providers behind a unified interface. All features (streaming, function calling, cost tracking, memory) work identically regardless of provider.

## Supported Providers

| Provider | Chat | Streaming | Tools | Embeddings | Notes |
|---|:-:|:-:|:-:|:-:|---|
| **Gemini** | ✅ | ✅ | ✅ | ✅ `text-embedding-004` | Free tier generous; **default** |
| **OpenAI** | ✅ | ✅ | ✅ | ✅ `text-embedding-3-small/large` | Use for `gpt-*`, `o1`, `o3` |
| **Anthropic** | ✅ | ✅ | ✅ | ❌ (no native API) | Use Gemini/OpenAI embeddings for RAG |

## Getting API Keys

| Provider | Where to get keys |
|---|---|
| Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

## Setup

Add your keys to `~/.myagent.env` (or a project-local `.env`):

```env
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

Or use custom endpoints (Azure OpenAI, proxies, self-hosted):

```env
OPENAI_BASE_URL=https://my-azure.openai.azure.com/v1
ANTHROPIC_BASE_URL=https://my-proxy.example.com
```

## Switching Providers

### Persist in `agent.config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-haiku-latest",
  "plannerModel": "claude-3-5-haiku-latest",
  "summaryModel": "claude-3-5-haiku-latest"
}
```

### Session-only via slash command:

```
🧑 > /model gpt-4o-mini
✅ Switched to openai:gpt-4o-mini

🧑 > /model claude-3-5-sonnet-latest
✅ Switched to anthropic:claude-3-5-sonnet-latest
```

See [Slash Commands / `/model`](./commands.md#model-id) for full syntax.

## Recommended Models

### Quality (daily coding)
- Gemini: `gemini-2.5-flash`
- OpenAI: `gpt-4o-mini`
- Anthropic: `claude-3-5-haiku-latest`

### Maximum capability (hard tasks)
- Gemini: `gemini-1.5-pro`
- OpenAI: `gpt-4o`, `o1`, `o3-mini`
- Anthropic: `claude-3-5-sonnet-latest`, `claude-3-opus-latest`

### Cost-optimized (simple queries)
- Gemini: `gemini-2.0-flash`, `gemini-1.5-flash`
- OpenAI: `gpt-4o-mini`
- Anthropic: `claude-3-5-haiku-latest`

## Mixing Providers

You can use one provider for the main agent and another for the planner/summarizer. However, **the current implementation uses the same provider for all three** (read from `config.provider`). If you need true mixing, edit `src/core/planner.js` and `src/core/memory.js` to call a different provider directly.

Future improvement: per-role provider config. PRs welcome — see [Contributing](./contributing.md).

## Embeddings

The RAG/`/index` system uses embeddings to find relevant code chunks. Current behavior:

- When using **Gemini** or **OpenAI** as the main provider, embeddings use that provider's embedding model.
- When using **Anthropic** (no native embedding API), `embed()` calls will fail — fall back by keeping a Gemini/OpenAI key configured, or skip `/index` entirely.

Embedding models used:

| Provider | Model | Dimensions | Price (per 1M tokens) |
|---|---|---|---|
| Gemini | `text-embedding-004` | 768 | $0.01 (essentially free for most) |
| OpenAI | `text-embedding-3-small` | 1536 | $0.02 |

## Streaming Behavior

All three providers stream tokens in real time. You'll see text appear character-by-character as the model generates. Tool calls are accumulated server-side and emitted as complete events (not streamed mid-argument).

## Function Calling Format Conversion

Internally, the agent uses a normalized tool schema (`{ name, description, parameters: {type:"object", ...} }`). The provider adapters convert this to:

| Provider | Tool format |
|---|---|
| Gemini | `{ functionDeclarations: [{ name, description, parameters }] }` |
| OpenAI | `[{ type: "function", function: { name, description, parameters } }]` |
| Anthropic | `[{ name, description, input_schema }]` |

Message format conversion is also handled transparently — you can switch providers mid-session and your memory.json continues to work.

## Cost Comparison (Jan 2026 prices)

Approximate cost per 1K generation tokens (input → output):

| Model | Input | Output |
|---|---|---|
| gemini-2.5-flash | $0.0000188 | $0.000075 |
| gpt-4o-mini | $0.00015 | $0.0006 |
| claude-3-5-haiku | $0.0008 | $0.004 |
| gpt-4o | $0.0025 | $0.01 |
| claude-3-5-sonnet | $0.003 | $0.015 |
| o1 | $0.015 | $0.06 |
| claude-3-opus | $0.015 | $0.075 |

For a typical 10-turn coding session (~20K input + 5K output tokens), that's roughly:
- Gemini flash: **$0.001**
- gpt-4o-mini: **$0.006**
- claude-haiku: **$0.036**
- gpt-4o: **$0.100**

See [Cost Tracking](./cost-tracking.md) for how this is measured and reported.

## Troubleshooting

| Error | Fix |
|---|---|
| `OPENAI_API_KEY missing` | Add to `~/.myagent.env` or `.env` |
| `ANTHROPIC_API_KEY missing` | Add to `~/.myagent.env` or `.env` |
| `Anthropic has no embedding API` | Don't `/index` while on Anthropic; switch to Gemini for indexing |
| `Unknown provider: 'xxx'` | Must be `gemini`, `openai`, or `anthropic` |
| 429 rate limits | Built-in retry with exponential backoff handles transient 429s. Persistent: lower `TOOL_CONCURRENCY` in `constants.js` |
