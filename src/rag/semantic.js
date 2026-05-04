import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import pLimit from "p-limit";
import { loadConfig } from "../config/config.js";
import { normalizeProviderName } from "../config/provider-env.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { getProvider, inferProvider, ProviderError } from "../llm/providers/index.js";
import { getCachedResponse, setCachedResponse } from "./cache.js";
import { log } from "../utils/logger.js";
import {
  INDEX_FILE,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_CONCURRENCY,
  CHUNK_MAX_LINES,
  CHUNK_OVERLAP_LINES,
  RAG_TOP_K,
  RAG_THRESHOLD,
  RAG_CONTEXT_MAX_CHARS,
  IGNORE_DIRS,
  CODE_EXTS,
} from "../config/constants.js";
import { writeFileAtomic } from "../utils/utils.js";
import { buildBm25Index, scoreBm25, tokenize } from "./bm25.js";

const DEFAULT_EMBEDDING_MODELS = {
  gemini: "gemini-embedding-2",
  openai: "text-embedding-3-small",
};

const pendingIndexUpdates = new Map();
const INDEX_UPDATE_DEBOUNCE_MS = 300;

export function resolveEmbeddingSpec(config = loadConfig(), env = process.env) {
  const explicitProvider = config.embeddingProvider
    ? normalizeProviderName(config.embeddingProvider)
    : null;
  const modelProvider = config.embeddingModel
    ? normalizeProviderName(inferProvider(config.embeddingModel))
    : null;

  if (
    explicitProvider &&
    modelProvider &&
    explicitProvider !== modelProvider
  ) {
    throw new ProviderError(
      `embeddingModel '${config.embeddingModel}' is incompatible with embeddingProvider '${explicitProvider}'.`,
      { provider: explicitProvider }
    );
  }

  const requestedProvider =
    explicitProvider ||
    modelProvider ||
    normalizeProviderName(config.provider || "gemini");

  if (requestedProvider === "anthropic") {
    if (explicitProvider === "anthropic" || modelProvider === "anthropic") {
      throw new ProviderError(
        "Anthropic has no embedding API. Set embeddingProvider to 'gemini' or 'openai'.",
        { provider: "anthropic" }
      );
    }

    const fallbackProvider = env.GEMINI_API_KEY
      ? "gemini"
      : env.OPENAI_API_KEY
        ? "openai"
        : null;

    if (!fallbackProvider) {
      throw new ProviderError(
        "Anthropic has no embedding API and no Gemini/OpenAI fallback is configured. Add GEMINI_API_KEY or OPENAI_API_KEY, or set embeddingProvider in agent.config.json.",
        { provider: "anthropic" }
      );
    }

    return {
      provider: fallbackProvider,
      model:
        modelProvider === fallbackProvider && config.embeddingModel
          ? config.embeddingModel
          : DEFAULT_EMBEDDING_MODELS[fallbackProvider],
      fallbackFrom: "anthropic",
    };
  }

  if (!DEFAULT_EMBEDDING_MODELS[requestedProvider]) {
    throw new ProviderError(
      `Unknown embedding provider: '${requestedProvider}'. Valid: gemini, openai.`,
      { provider: requestedProvider }
    );
  }

  return {
    provider: requestedProvider,
    model: config.embeddingModel || DEFAULT_EMBEDDING_MODELS[requestedProvider],
    fallbackFrom: null,
  };
}

// ===========================
// 🔹 EMBEDDING (with cache + cost tracking)
// ===========================
export async function embed(text) {
  const spec = resolveEmbeddingSpec();
  const cacheKey = `${spec.provider}:${spec.model}`;
  const cached = getCachedResponse(text, cacheKey);
  if (cached) {
    globalTracker.trackEmbedding(text, true, spec.model);
    return cached;
  }

  const provider = await getProvider(spec.provider);
  const embedding = await provider.embed(text, spec.model);
  setCachedResponse(text, cacheKey, embedding);
  globalTracker.trackEmbedding(text, false, spec.model);
  return embedding;
}

/**
 * Batch embed many texts. Cache-aware:
 *   1. Each text checked against cache → hits returned directly.
 *   2. Misses sent in a single batch API call (or sliced into multiple
 *      requests of EMBEDDING_BATCH_SIZE if too many).
 *   3. New vectors persisted to cache.
 *
 * Falls back to per-item `embed()` (with cap concurrency) if the provider
 * does not support batch — keeps callers oblivious to that distinction.
 *
 * @param {string[]} texts
 * @returns {Promise<Array<number[]|null>>} Same length as `texts`. `null`
 *   entries indicate the embed call failed for that index (caller decides
 *   whether to retry / drop / surface).
 */
export async function embedMany(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const spec = resolveEmbeddingSpec();
  const cacheKey = `${spec.provider}:${spec.model}`;
  const provider = await getProvider(spec.provider);

  const out = new Array(texts.length).fill(null);
  const missingIdx = [];
  const missingTexts = [];

  // Pass 1: cache lookup
  for (let i = 0; i < texts.length; i++) {
    const cached = getCachedResponse(texts[i], cacheKey);
    if (cached) {
      out[i] = cached;
      globalTracker.trackEmbedding(texts[i], true, spec.model);
    } else {
      missingIdx.push(i);
      missingTexts.push(texts[i]);
    }
  }

  if (missingTexts.length === 0) return out;

  // Pass 2: batch-fetch misses, sliced into chunks of EMBEDDING_BATCH_SIZE.
  const supportsBatch = typeof provider.embedBatch === "function";
  if (supportsBatch) {
    for (let i = 0; i < missingTexts.length; i += EMBEDDING_BATCH_SIZE) {
      const slice = missingTexts.slice(i, i + EMBEDDING_BATCH_SIZE);
      const sliceIdx = missingIdx.slice(i, i + EMBEDDING_BATCH_SIZE);
      try {
        const vectors = await provider.embedBatch(slice, spec.model);
        for (let j = 0; j < slice.length; j++) {
          out[sliceIdx[j]] = vectors[j];
          setCachedResponse(slice[j], cacheKey, vectors[j]);
          globalTracker.trackEmbedding(slice[j], false, spec.model);
        }
      } catch (err) {
        log.warn(`embedBatch slice failed (${slice.length} items): ${err.message}`);
        // Don't blow up the whole index — leave out[idx] as null so caller can skip
      }
    }
    return out;
  }

  // Fallback: single-item with capped concurrency (preserves cache writes).
  const limit = pLimit(EMBEDDING_CONCURRENCY);
  await Promise.all(
    missingTexts.map((text, j) =>
      limit(async () => {
        try {
          const vec = await provider.embed(text, spec.model);
          out[missingIdx[j]] = vec;
          setCachedResponse(text, cacheKey, vec);
          globalTracker.trackEmbedding(text, false, spec.model);
        } catch (err) {
          log.warn(`embed failed: ${err.message}`);
        }
      })
    )
  );
  return out;
}

// ===========================
// 🔹 VECTOR MATH
// ===========================
function magnitude(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function normalize(v) {
  const mag = magnitude(v);
  if (mag === 0) return v;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / mag;
  return out;
}

function dotProduct(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

// ===========================
// 🔹 SMART CHUNKING
// ===========================
export function chunkText(text, { maxLines = CHUNK_MAX_LINES, overlap = CHUNK_OVERLAP_LINES } = {}) {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.length <= maxLines) return [text];

  const chunks = [];
  const step = Math.max(1, maxLines - overlap);
  for (let i = 0; i < lines.length; i += step) {
    const chunk = lines.slice(i, i + maxLines).join("\n");
    if (chunk.trim().length > 0) chunks.push(chunk);
    if (i + maxLines >= lines.length) break;
  }
  return chunks;
}

// ===========================
// 🔹 FILE TYPE DETECTION
// ===========================
function detectType(file) {
  const f = file.toLowerCase();
  if (f.includes("controller")) return "controller";
  if (f.includes("service")) return "service";
  if (f.includes("model")) return "model";
  if (f.includes("route")) return "route";
  if (f.includes("middleware")) return "middleware";
  if (f.includes("config")) return "config";
  if (f.includes("test") || f.includes("spec")) return "test";
  if (f.includes("util") || f.includes("helper")) return "utility";
  return "general";
}

// Async recursive walker — non-blocking for large repos.
async function getAllFiles(dir, exts = CODE_EXTS, ignoreMatcher = createGitignoreMatcher(dir)) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (ignoreMatcher(full)) continue;
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        const sub = await getAllFiles(full, exts, ignoreMatcher);
        results.push(...sub);
      }
    } else if (exts.includes(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function createGitignoreMatcher(rootDir) {
  const root = path.resolve(rootDir);
  const patterns = loadGitignorePatterns(root);
  if (patterns.length === 0) return () => false;

  return (filePath) => {
    const rel = toPosixPath(path.relative(root, path.resolve(filePath)));
    if (!rel || rel.startsWith("..")) return false;
    const base = path.posix.basename(rel);

    let ignored = false;
    for (const pattern of patterns) {
      if (matchesGitignorePattern(rel, base, pattern)) {
        ignored = !pattern.negated;
      }
    }
    return ignored;
  };
}

function loadGitignorePatterns(root) {
  const gitignorePath = path.join(root, ".gitignore");
  if (!fsSync.existsSync(gitignorePath)) return [];

  try {
    return fsSync.readFileSync(gitignorePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const negated = line.startsWith("!");
        let value = negated ? line.slice(1) : line;
        value = toPosixPath(value).replace(/^\/+/, "");
        const directoryOnly = value.endsWith("/");
        value = value.replace(/\/+$/, "");
        return { value, negated, directoryOnly };
      })
      .filter((pattern) => pattern.value);
  } catch (err) {
    log.warn(`failed to read .gitignore: ${err.message}`);
    return [];
  }
}

function matchesGitignorePattern(rel, base, pattern) {
  const value = pattern.value;
  if (!value.includes("/")) {
    if (value.includes("*") || value.includes("?")) {
      return globToRegExp(value).test(base);
    }
    const matchesName = base === value || rel.startsWith(`${value}/`) || rel.includes(`/${value}/`);
    return pattern.directoryOnly ? matchesName && rel.includes("/") : matchesName;
  }
  const regex = globToRegExp(value.includes("/") ? value : `**/${value}`);
  return regex.test(rel);
}

function globToRegExp(glob) {
  let source = "^";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        source += ".*";
        i++;
      } else {
        source += "[^/]*";
      }
    } else if (ch === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(ch);
    }
  }
  return new RegExp(source + "$");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

// ===========================
// 🔥 BUILD INDEX (true batch embeddings — single API call per N chunks)
// ===========================
export async function buildIndex(folderPath) {
  const files = await getAllFiles(folderPath);
  const index = [];

  let failedChunks = 0;
  let successfulChunks = 0;

  // Collect all chunks across all files first, then batch-embed in one pass.
  // This lets the provider service multiple files per HTTP round-trip.
  const allChunks = []; // [{ file, chunk, type }]
  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const chunks = chunkText(content);
      const type = detectType(file);
      for (const chunk of chunks) {
        allChunks.push({ file, chunk, type });
      }
    } catch (err) {
      log.warn(`indexing failed for ${file}: ${err.message}`);
    }
  }

  if (allChunks.length === 0) {
    await writeFileAtomic(INDEX_FILE, JSON.stringify([]));
    return { successfulChunks: 0, failedChunks: 0, files: 0 };
  }

  const vectors = await embedMany(allChunks.map((c) => c.chunk));

  for (let i = 0; i < allChunks.length; i++) {
    const vec = vectors[i];
    if (!vec) {
      failedChunks++;
      continue;
    }
    successfulChunks++;
    index.push({
      file: allChunks[i].file,
      content: allChunks[i].chunk,
      embedding: normalize(vec),
      type: allChunks[i].type,
    });
  }

  await writeFileAtomic(INDEX_FILE, JSON.stringify(index));

  if (failedChunks > 0) {
    log.warn(
      `buildIndex: ${successfulChunks} chunks indexed, ${failedChunks} failed. ` +
      `Check API key / quota if this persists.`
    );
  }

  // Refresh in-memory cache so subsequent loadIndex() calls skip the disk read.
  const stat = await fs.stat(INDEX_FILE);
  _indexCache = { mtime: stat.mtimeMs, data: index };

  return { successfulChunks, failedChunks, files: files.length };
}

/**
 * Incrementally update the index for a specific file.
 * Removes old chunks for the file and adds new ones if it exists.
 */
export async function updateIndex(filePath) {
  let index = loadIndex();
  const normalizedPath = path.resolve(filePath);
  const relativePath = path.relative(process.cwd(), normalizedPath);

  // Remove old entries
  const originalLength = index.length;
  index = index.filter((item) => {
    const itemPath = path.resolve(item.file);
    return itemPath !== normalizedPath;
  });

  // If file exists, re-index it
  if (fsSync.existsSync(normalizedPath)) {
    try {
      const content = await fs.readFile(normalizedPath, "utf-8");
      const chunks = chunkText(content);
      if (chunks.length > 0) {
        const vectors = await embedMany(chunks);
        for (let i = 0; i < chunks.length; i++) {
          if (vectors[i]) {
            index.push({
              file: relativePath,
              content: chunks[i],
              embedding: normalize(vectors[i]),
              type: detectType(relativePath),
            });
          }
        }
      }
    } catch (err) {
      log.warn(`updateIndex failed for ${normalizedPath}: ${err.message}`);
    }
  }

  if (index.length !== originalLength || fsSync.existsSync(normalizedPath)) {
    await writeFileAtomic(INDEX_FILE, JSON.stringify(index));
    const stat = await fs.stat(INDEX_FILE);
    _indexCache = { mtime: stat.mtimeMs, data: index };
  }
}

export function scheduleIndexUpdate(filePath, { skipWhenEmpty = true } = {}) {
  const normalizedPath = path.resolve(filePath);
  if (skipWhenEmpty && loadIndex().length === 0) return false;

  const existingTimer = pendingIndexUpdates.get(normalizedPath);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    pendingIndexUpdates.delete(normalizedPath);
    updateIndex(normalizedPath).catch((err) => {
      log.warn(`scheduled updateIndex failed for ${normalizedPath}: ${err.message}`);
    });
  }, INDEX_UPDATE_DEBOUNCE_MS);

  pendingIndexUpdates.set(normalizedPath, timer);
  return true;
}

// ===========================
// 🔹 LOAD INDEX (sync is fine — called once per session, small JSON mostly)
// ===========================
let _indexCache = null;
let _bm25Cache = null; // { mtime, bm25 } — mirrors _indexCache.mtime so we
//                        invalidate together when the index file changes.

export function loadIndex() {
  if (!fsSync.existsSync(INDEX_FILE)) return [];
  try {
    const mtime = fsSync.statSync(INDEX_FILE).mtimeMs;
    if (_indexCache && _indexCache.mtime === mtime) return _indexCache.data;
    const data = JSON.parse(fsSync.readFileSync(INDEX_FILE, "utf-8"));
    _indexCache = { mtime, data };
    return data;
  } catch {
    return [];
  }
}

// ===========================
// 🔹 SEARCH (Hybrid: Vector + BM25 + exact-match bonus)
// ===========================
/**
 * Lazily compute & cache the BM25 index for the given in-memory `index`.
 * Cache keyed by object identity — invalidated whenever loadIndex() returns
 * a fresh array (which only happens on file mtime change).
 */
function getBm25Cache(index) {
  if (_bm25Cache && _bm25Cache.indexRef === index) return _bm25Cache.bm25;
  const bm25 = buildBm25Index(index.map((it) => it.content));
  _bm25Cache = { indexRef: index, bm25 };
  return bm25;
}

export async function search(query, index, options = {}) {
  const { topK = RAG_TOP_K, threshold = RAG_THRESHOLD, alpha = 0.7 } = options;
  if (!index || index.length === 0) return [];

  const qVec = normalize(await embed(query));
  const queryTokens = tokenize(query);
  const bm25 = getBm25Cache(index);

  // First pass: compute raw BM25 scores so we can normalize across the corpus.
  const bm25Raw = new Array(index.length);
  let bm25Max = 0;
  for (let i = 0; i < index.length; i++) {
    const s = queryTokens.length > 0
      ? scoreBm25(queryTokens, bm25.docs[i], bm25.idf, bm25.avgDl)
      : 0;
    bm25Raw[i] = s;
    if (s > bm25Max) bm25Max = s;
  }

  // Second pass: combine vector cosine + normalized BM25 + exact-match bonus.
  const results = index.map((item, i) => {
    const vectorScore = dotProduct(qVec, item.embedding);
    const bm25Score = bm25Max > 0 ? bm25Raw[i] / bm25Max : 0;

    let lexicalScore = bm25Score;
    // Exact substring match bumps the score (handles unique identifiers
    // like API names, error codes, file paths that BM25 alone misses).
    if (query.length >= 3 && item.content.includes(query)) lexicalScore += 0.2;

    const score = alpha * vectorScore + (1 - alpha) * lexicalScore;
    return { ...item, score, vectorScore, keywordScore: lexicalScore, bm25Score: bm25Raw[i] };
  });

  return results
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ===========================
// 🔹 BUILD CONTEXT
// ===========================
export function buildContext(results, maxLength = RAG_CONTEXT_MAX_CHARS) {
  const context = results
    .map((r) => `FILE: ${r.file}\nTYPE: ${r.type}\n\n${r.content}`)
    .join("\n---\n");
  return context.slice(0, maxLength);
}
