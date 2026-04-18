import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { ai } from "../llm/llm.js";
import { getCachedResponse, setCachedResponse } from "./cache.js";
import { globalTracker } from "../llm/cost-tracker.js";
import {
  INDEX_FILE,
  EMBEDDING_MODEL,
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

// ===========================
// 🔹 EMBEDDING (with cache + cost tracking)
// ===========================
export async function embed(text) {
  const cached = getCachedResponse(text, EMBEDDING_MODEL);
  if (cached) {
    globalTracker.trackEmbedding(text, true);
    return cached;
  }

  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
  });

  const embedding = res.embedding.values;
  setCachedResponse(text, EMBEDDING_MODEL, embedding);
  globalTracker.trackEmbedding(text, false);

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

// Pre-normalize once at index time → query becomes plain dot-product.
function normalize(v) {
  const mag = magnitude(v);
  if (mag === 0) return v;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / mag;
  return out;
}

// Both vectors expected pre-normalized → just dot product.
function dotProduct(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

// ===========================
// 🔹 SMART CHUNKING (line-based with overlap)
// ===========================
// Previous implementation sliced by raw characters which cut mid-token and
// destroyed code semantics. We now chunk by logical lines to preserve context.
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

function getAllFiles(dir, exts = CODE_EXTS) {
  let results = [];
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of list) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          results = results.concat(getAllFiles(full, exts));
        }
      } else if (exts.includes(path.extname(entry.name))) {
        results.push(full);
      }
    }
  } catch { /* skip inaccessible */ }
  return results;
}

// ===========================
// 🔥 BUILD INDEX (batched + concurrency-limited)
// ===========================
export async function buildIndex(folderPath) {
  const files = getAllFiles(folderPath);
  const index = [];
  const limit = pLimit(EMBEDDING_CONCURRENCY);

  console.log(`🚀 Starting batch indexing for ${files.length} files...`);
  const startTime = Date.now();

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const chunks = chunkText(content);
      if (chunks.length === 0) continue;

      console.log(`📄 Indexing: ${file} (${chunks.length} chunks)`);

      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const vectors = await Promise.all(
          batch.map((chunk) => limit(() => embed(chunk).catch((err) => {
            console.warn(`⚠️ Embedding failed for chunk in ${file}: ${err.message}`);
            return null;
          })))
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
    } catch (err) {
      console.error(`❌ Failed to index ${file}: ${err.message}`);
    }
  }

  // Minified JSON — embedding arrays are large; indentation wastes 5-10x space.
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index));

  _indexCache = { mtime: fs.statSync(INDEX_FILE).mtimeMs, data: index };

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Index saved with ${index.length} embeddings in ${duration}s`);
}

// ===========================
// 🔹 LOAD INDEX (in-memory cache with mtime invalidation)
// ===========================
let _indexCache = null;

export function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    const mtime = fs.statSync(INDEX_FILE).mtimeMs;
    if (_indexCache && _indexCache.mtime === mtime) return _indexCache.data;
    const data = JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
    _indexCache = { mtime, data };
    return data;
  } catch {
    return [];
  }
}

// ===========================
// 🔹 SEARCH (dot product — embeddings pre-normalized)
// ===========================
export async function search(query, index, options = {}) {
  const { topK = RAG_TOP_K, threshold = RAG_THRESHOLD } = options;
  if (!index || index.length === 0) return [];

  const qVec = normalize(await embed(query));
  const lowerQuery = query.toLowerCase();

  return index
    .map((item) => {
      let score = dotProduct(qVec, item.embedding);
      if (item.content.toLowerCase().includes(lowerQuery)) score += 0.1;
      return { ...item, score };
    })
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
