# LLM Providers

The agent supports three LLM providers behind a unified interface. Streaming, tool calling, memory, and cost tracking work the same way across providers.

## Supported Providers

| Provider | Chat | Streaming | Tools | Embeddings | Notes |
|---|:-:|:-:|:-:|:-:|---|
| **Gemini** | Yes | Yes | Yes | Yes `text-embedding-004` | Default setup |
| **OpenAI** | Yes | Yes | Yes | Yes `text-embedding-3-small/large` | Use for `gpt-*`, `o1`, `o3` |
| **Anthropic** | Yes | Yes | Yes | No native API | Falls back to Gemini/OpenAI for RAG |

## Getting API Keys

| Provider | Where to get keys |
|---|---|
| Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

## Setup

Add your keys to `~/.myagent.env` or a project-local `.env`:

```env
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

Custom endpoints are also supported:

```env
OPENAI_BASE_URL=https://my-azure.openai.azure.com/v1
ANTHROPIC_BASE_URL=https://my-proxy.example.com
```

On first run, the CLI prompts only for the API key required by the currently configured `provider`.

## Switching Providers

Persist the choice in `agent.config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-haiku-latest",
  "plannerModel": "claude-3-5-haiku-latest",
  "summaryModel": "claude-3-5-haiku-latest"
}
```

Or switch for the current session:

```text
> /model gpt-4o-mini
> /model claude-3-5-sonnet-latest
```

See [commands.md](./commands.md) for the full slash-command reference.

## Recommended Models

Quality:
- Gemini: `gemini-2.5-flash`
- OpenAI: `gpt-4o-mini`
- Anthropic: `claude-3-5-haiku-latest`

Maximum capability:
- Gemini: `gemini-1.5-pro`
- OpenAI: `gpt-4o`, `o1`, `o3-mini`
- Anthropic: `claude-3-5-sonnet-latest`, `claude-3-opus-latest`

Cost-optimized:
- Gemini: `gemini-2.0-flash`, `gemini-1.5-flash`
- OpenAI: `gpt-4o-mini`
- Anthropic: `claude-3-5-haiku-latest`

## Mixing Providers

The main agent, planner, and summarizer currently all use `config.provider`. If you need a different embedding path, use `embeddingProvider` and `embeddingModel`.

## Embeddings

The RAG and `/index` flow uses provider-aware embeddings:

- With **Gemini** or **OpenAI** as the main provider, embeddings use that provider's default embedding model.
- With **Anthropic**, embeddings automatically fall back to **Gemini** if `GEMINI_API_KEY` is present, otherwise to **OpenAI** if `OPENAI_API_KEY` is present.
- You can override the embedding path explicitly with `embeddingProvider` and `embeddingModel`.

Example:

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-haiku-latest",
  "embeddingProvider": "openai",
  "embeddingModel": "text-embedding-3-large"
}
```

Embedding models:

| Provider | Model | Price (per 1M tokens) |
|---|---|---|
| Gemini | `text-embedding-004` | $0.01 |
| OpenAI | `text-embedding-3-small` | $0.02 |
| OpenAI | `text-embedding-3-large` | $0.13 |

## Streaming Behavior

All three providers stream text tokens in real time. Tool calls are accumulated and emitted as complete events after the provider finishes sending the call payload.

## Tool Format Conversion

Internally the agent uses a normalized tool schema. Provider adapters convert it to the native wire format for Gemini, OpenAI, or Anthropic automatically, and the same applies to conversation history.

## Troubleshooting

| Error | Fix |
|---|---|
| `OPENAI_API_KEY missing` | Add it to `~/.myagent.env` or `.env` |
| `ANTHROPIC_API_KEY missing` | Add it to `~/.myagent.env` or `.env` |
| `Anthropic has no embedding API` | Use `embeddingProvider: "gemini"` or `embeddingProvider: "openai"` |
| `Unknown provider: 'xxx'` | Use `gemini`, `openai`, or `anthropic` |
