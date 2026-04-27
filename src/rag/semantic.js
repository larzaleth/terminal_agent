import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import pLimit from "p-limit";
import { loadConfig } from "../config/config.js";
import { normalizeProviderName } from "../config/provider-env.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { getProvider, inferProvider, ProviderError } from "../llm/providers/index.js";
import { getCachedResponse, setCachedResponse } from "./cache.js";
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

const DEFAULT_EMBEDDING_MODELS = {
  gemini: "text-embedding-004",
  openai: "text-embedding-3-small",
};

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

  const provider = getProvider(spec.provider);
  const embedding = await provider.embed(text, spec.model);
  setCachedResponse(text, cacheKey, embedding);
  globalTracker.trackEmbedding(text, false, spec.model);
  return embedding;
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
async function getAllFiles(dir, exts = CODE_EXTS) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        const sub = await getAllFiles(full, exts);
        results.push(...sub);
      }
    } else if (exts.includes(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

// ===========================
// 🔥 BUILD INDEX (async fs + concurrency-limited embedding)
// ===========================
export async function buildIndex(folderPath) {
  const files = await getAllFiles(folderPath);
  const index = [];
  const limit = pLimit(EMBEDDING_CONCURRENCY);

  const startTime = Date.now();

  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const chunks = chunkText(content);
      if (chunks.length === 0) continue;

      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const vectors = await Promise.all(
          batch.map((chunk) =>
            limit(() =>
              embed(chunk).catch((err) => {
                return null;
              })
            )
          )
        );

        batch.forEach((chunk, idx) => {
          if (vectors[idx]) {
            index.push({
              file,
              content: chunk,
              embedding: normalize(vectors[idx]),
              type: detectType(file),
            });
          }
        });
      }
    } catch {
      // Indexing failed for this file, skip and continue
    }
  }

  await writeFileAtomic(INDEX_FILE, JSON.stringify(index));

  // Refresh in-memory cache so subsequent loadIndex() calls skip the disk read.
  const stat = await fs.stat(INDEX_FILE);
  _indexCache = { mtime: stat.mtimeMs, data: index };


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
      const limit = pLimit(EMBEDDING_CONCURRENCY);

      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const vectors = await Promise.all(
          batch.map((chunk) => limit(() => embed(chunk)))
        );

        batch.forEach((chunk, idx) => {
          if (vectors[idx]) {
            index.push({
              file: relativePath,
              content: chunk,
              embedding: normalize(vectors[idx]),
              type: detectType(relativePath),
            });
          }
        });
      }
    } catch (err) {

    }
  }

  if (index.length !== originalLength || fsSync.existsSync(normalizedPath)) {
    await writeFileAtomic(INDEX_FILE, JSON.stringify(index));
    const stat = await fs.stat(INDEX_FILE);
    _indexCache = { mtime: stat.mtimeMs, data: index };
  }
}

// ===========================
// 🔹 LOAD INDEX (sync is fine — called once per session, small JSON mostly)
// ===========================
let _indexCache = null;

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
// 🔹 SEARCH (Hybrid: Vector + Keyword)
// ===========================
export async function search(query, index, options = {}) {
  const { topK = RAG_TOP_K, threshold = RAG_THRESHOLD, alpha = 0.7 } = options;
  if (!index || index.length === 0) return [];

  const qVec = normalize(await embed(query));
  const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);

  const results = index.map((item) => {
    // 1. Vector Score (Semantic)
    const vectorScore = dotProduct(qVec, item.embedding);

    // 2. Keyword Score (Lexical)
    let keywordScore = 0;
    if (queryTerms.length > 0) {
      const contentLower = item.content.toLowerCase();
      let matches = 0;
      for (const term of queryTerms) {
        if (contentLower.includes(term)) matches++;
      }
      keywordScore = matches / queryTerms.length;
      
      // Bonus for exact symbol match (case sensitive or specific word boundaries)
      if (item.content.includes(query)) keywordScore += 0.2;
    }

    // 3. Combined Score
    const score = (alpha * vectorScore) + ((1 - alpha) * keywordScore);

    return { ...item, score, vectorScore, keywordScore };
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
