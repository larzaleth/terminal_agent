# Cost Tracking

The agent tracks every token spent on LLM calls and embeddings, reports cost per session, and keeps a rolling history.

## What Gets Tracked

Per session:
- **Input / output tokens** for generation calls (main loop, planner, summarizer)
- **Token count** for embeddings (new ones only; cache hits cost nothing)
- **Cache hit / miss** breakdown
- **Per-API-call count**
- **Session duration**

Token counts come from `response.usageMetadata` (Gemini) / `response.usage` (OpenAI) / `message_delta.usage` (Anthropic) — the **actual** counts reported by the provider, not estimates. Accuracy matches your bill.

If `usageMetadata` is absent (unusual), the tracker falls back to `chars / 3.5` heuristic. This is marked internally but never shown differently to users.

## Viewing Current Session

```
🧑 > /cost report

==================================================
💰 SESSION COST REPORT
==================================================

📊 Token Usage:
  Input Tokens:  12,435
  Output Tokens: 3,218
  API Calls:     14

🔍 Embeddings:
  Tokens:        4,127
  API Calls:     23

💾 Cache Performance:
  Cache Hits:    12
  Cache Misses:  23
  Hit Rate:      34.3%

💵 Estimated Cost:
  Generation:    $0.000474
  Embeddings:    $0.000041
  Total:         $0.000515

⏱️  Session Duration: 145.3s
==================================================
```

After every agent turn, a one-line summary is also printed:

```
⏱️  Done in 3.2s
💰 $0.000233 | 📊 1,247 tokens | 💾 62.5% cache hit
```

## Session History

All sessions are appended to `cost-report.json` in cwd (last 100 kept):

```
🧑 > /cost history 5

==================================================
📊 COST HISTORY (Last 5 sessions)
==================================================

1. 1/16/2026, 10:23:47 AM
   Model: gemini-2.5-flash
   Cost: $0.000515
   Duration: 145.3s
   Cache Hit Rate: 34.3%

2. 1/16/2026, 11:12:03 AM
   Model: claude-3-5-haiku-latest
   Cost: $0.002834
   Duration: 89.2s
   Cache Hit Rate: 0.0%

...

💰 Total Cost (last 5): $0.008743
==================================================
```

## Resetting

```
/cost reset
```

Clears the in-memory counter for the current session only. Does **not** touch `cost-report.json` history.

## Pricing Table (Jan 2026)

Defined in `src/llm/cost-tracker.js`. Sources: Google AI Studio, OpenAI, Anthropic pricing pages.

### Gemini

| Model | Input / 1K | Output / 1K |
|---|---|---|
| gemini-2.5-flash | $0.0000188 | $0.000075 |
| gemini-2.0-flash | $0.00001 | $0.00004 |
| gemini-1.5-flash | $0.0000075 | $0.00003 |
| gemini-1.5-pro | $0.00125 | $0.005 |
| text-embedding-004 | $0.00001 | — |

### OpenAI

| Model | Input / 1K | Output / 1K |
|---|---|---|
| gpt-4o | $0.0025 | $0.01 |
| gpt-4o-mini | $0.00015 | $0.0006 |
| gpt-4.1 | $0.002 | $0.008 |
| gpt-4.1-mini | $0.0004 | $0.0016 |
| o1 | $0.015 | $0.06 |
| o1-mini | $0.003 | $0.012 |
| o3-mini | $0.0011 | $0.0044 |
| text-embedding-3-small | $0.00002 | — |
| text-embedding-3-large | $0.00013 | — |

### Anthropic

| Model | Input / 1K | Output / 1K |
|---|---|---|
| claude-3-5-sonnet-latest | $0.003 | $0.015 |
| claude-3-5-haiku-latest | $0.0008 | $0.004 |
| claude-3-opus-latest | $0.015 | $0.075 |

> For unknown model IDs, the tracker falls back to `gemini-2.5-flash` pricing. If Anthropic or OpenAI release new models, either update the pricing table or live with the fallback estimate.

### Updating Prices

Pricing changes? Edit the `PRICING` object in `src/llm/cost-tracker.js`:

```js
const PRICING = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  // ... add/update entries
};
```

The `pricingFor()` helper does prefix matching — `gpt-4o-2024-08-06` will match the `gpt-4o` entry.

## Cache Savings

Every embedding cache hit saves one API call + its tokens. On repeated `/index` runs over an unchanged codebase, cache hit rate often hits **95%+**, making re-indexing essentially free.

Monitor cache effectiveness:

```
/cache stats
/cost report   # see "Cache Performance" section
```

If hit rate is low but you expected high reuse, check:
- Is `.agent_cache/` writable? (permissions)
- Did you clear the cache recently? (`/cache clear`)
- Did chunks actually match? (they're keyed by exact content — whitespace changes invalidate)

## Budget Awareness

The agent **does not** enforce budget limits. It reports what was spent after the fact. If you want hard caps, either:

1. Set per-key billing limits at the provider dashboard (recommended).
2. Wrap `myagent` in a shell script that monitors `cost-report.json` and refuses to launch if daily spend exceeds a threshold.

Example budget guard:

```bash
#!/bin/bash
MAX_DAILY_CENTS=50
TODAY=$(date +%Y-%m-%d)
SPENT_CENTS=$(jq --arg d "$TODAY" '[.[] | select(.timestamp | startswith($d)) | .cost.total] | add * 100' cost-report.json 2>/dev/null || echo 0)
if (( $(echo "$SPENT_CENTS > $MAX_DAILY_CENTS" | bc -l) )); then
  echo "Daily budget exceeded ($SPENT_CENTS cents). Refusing to launch myagent."
  exit 1
fi
myagent
```

## Known Limitations

- **MCP tool calls are free from the LLM's perspective** — they don't consume tokens beyond the tool-call description and response text that flow through the agent loop. However, the underlying MCP server might have its own cost (e.g. a database proxy that charges per query).
- **Streaming includes usage only at end**. The per-turn cost is accurate but not live.
- **Summarizer calls count normally**. When memory is summarized, that's an extra generation call charged at `summaryModel`'s rate.
