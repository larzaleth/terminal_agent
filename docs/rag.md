# Semantic RAG (Retrieval-Augmented Generation)

The `/index` command builds a **semantic search index** of your codebase. When you ask the agent a question, relevant chunks are automatically included as context — so the LLM gives answers grounded in your actual code, not generic patterns.

## When to Use It

**Use `/index`** when:
- Working in a large codebase the agent doesn't know
- Starting a new session on an existing project
- You've made significant changes and want fresh embeddings

**Skip `/index`** when:
- Working on a tiny file/script
- The agent can fit the whole relevant context in normal tool calls (`read_file`, `grep_search`)
- Cost is a concern and the codebase is small enough

## How It Works

1. **File discovery** — walks the folder, filters by extension (`.js .ts .jsx .tsx .mjs .cjs .py .json .md`), skips `node_modules`, `.git`, binaries, etc.

2. **Smart chunking** — each file is split into chunks of **40 lines** with **5 lines of overlap**. This preserves code structure (functions rarely split mid-body).

3. **Embedding** — each chunk → 768-dim vector via Gemini's `text-embedding-004` (or OpenAI's `text-embedding-3-small` if you configure it). Chunks are embedded in **batches of 10**, with concurrency capped at 5 to avoid rate limits.

4. **Caching** — every embedding is cached in `.agent_cache/` keyed by MD5(chunk content). Re-indexing the same file is nearly instant. TTL: 1 hour. Max: 5000 entries (LRU eviction).

5. **Pre-normalization** — vectors are normalized to unit length **once, at index time**. This means search queries use a simple dot product (faster than cosine similarity on every query).

6. **Persistence** — saved to `index.json` at the cwd as minified JSON (embedded floats are bulky; indentation wastes 5-10× space).

## Query Flow

When you send any message, `agents.js` does:

1. Load `index.json` from disk (cached in-memory, invalidated on file mtime change).
2. Embed your query.
3. Compute dot product against every chunk vector.
4. Apply keyword boost (+0.1 if query text appears literally in chunk).
5. Filter by threshold (default `0.7`), sort by score, keep top-K (default `3`).
6. Inject the chunks into the user message as `Relevant code context: ...`.

## Tuning

Edit `src/config/constants.js`:

```js
export const CHUNK_MAX_LINES = 40;        // how big each chunk is
export const CHUNK_OVERLAP_LINES = 5;     // how much overlap between adjacent chunks
export const EMBEDDING_BATCH_SIZE = 10;   // chunks per batch API call
export const EMBEDDING_CONCURRENCY = 5;   // parallel batches
export const RAG_TOP_K = 3;               // how many chunks to retrieve
export const RAG_THRESHOLD = 0.7;         // min dot-product score
export const RAG_CONTEXT_MAX_CHARS = 3000; // max bytes injected per turn
```

### Chunk size

- **Small chunks (20 lines)** — more precise matches, but may lose context
- **Large chunks (80 lines)** — more context per hit, but less specific, more tokens

### Overlap

Higher overlap = better continuity across chunk boundaries, but more embeddings & storage. `5 / 40` (12.5%) is a reasonable default.

### Top-K and threshold

- Raise **top-K** when you want broader context (good for "how does the auth system work overall?").
- Lower **threshold** to get more hits (useful when your index is small).
- Raise **threshold** to only get very relevant matches (useful when your codebase is huge and you don't want noise).

## Storage

After `/index`, you'll have:

```
./index.json           # flat JSON array of { file, content, embedding[], type }
./.agent_cache/        # per-chunk embedding cache (MD5 keyed)
```

Sizes for reference:
- 50 files (~6KB each average, 300 chunks) → `index.json` ≈ 3 MB
- 500 files → `index.json` ≈ 30 MB
- The cache is roughly half the index size (cache stores raw embeddings, index stores embeddings + content + metadata)

Both can be deleted safely — the next `/index` will rebuild.

## Cost

Embeddings are cheap:
- `text-embedding-004` (Gemini) — $0.00001 per 1K tokens ≈ $0.01 per 1M tokens
- For a 500-file repo (~250K tokens of code), indexing costs < $0.01

Plus the cache means re-indexing an unchanged file is **free**.

Query-time cost: one embedding per user message (a few hundred tokens) ≈ negligible.

## Limitations

### It's a file-granularity system

Chunks are 40 consecutive lines. Functions that span 200 lines span multiple chunks. Complex class hierarchies that reference across files may not surface everything.

For those cases, supplement with explicit `grep_search` (the agent does this naturally if you ask "find all usages of X").

### Binary and generated files are skipped

By design. If you want them indexed, edit `CODE_EXTS` in `src/config/constants.js` or `BINARY_EXTS` in `src/tools/tools.js`.

### Anthropic users

Anthropic has no native embedding API. If you configure `provider: "anthropic"` **and** want to use `/index`, you'll hit an error on the embed call. Workarounds:
- Keep a `GEMINI_API_KEY` set — the embedding path will use Gemini regardless of your chat provider.
- Or use `provider: "gemini"` for indexing, then `/provider anthropic` for chatting.

Future improvement: auto-fallback embedding provider. PRs welcome.

## Rebuilding

`/index <folder>` always rebuilds from scratch. To incrementally update, just re-run — the cache ensures unchanged files don't re-embed.

## Inspecting

Peek at your index:

```bash
jq 'length' index.json                    # chunk count
jq '.[0] | {file, type, content}' index.json   # first chunk preview
jq '[.[].file] | unique | length' index.json   # unique file count
```

## Turning It Off

Don't run `/index`, and the agent simply skips the RAG step. The loop continues normally using only direct tool calls.

Or delete `index.json` to disable it for that cwd without reconfiguring anything.
