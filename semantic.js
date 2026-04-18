import fs from "fs";
import path from "path";
import { ai } from "./llm.js";
import { getCachedResponse, setCachedResponse } from "./cache.js";
import { globalTracker } from "./cost-tracker.js";

const INDEX_FILE = "index.json";
const EMBEDDING_MODEL = "text-embedding-004";

// ===========================
// 🔹 EMBEDDING (WITH CACHE & COST TRACKING)
// ===========================
export async function embed(text) {
  // Check cache first
  const cached = getCachedResponse(text, EMBEDDING_MODEL);
  if (cached) {
    globalTracker.trackEmbedding(text, true); // Track cache hit
    return cached;
  }

  // If not cached, get from API
  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
  });
  
  const embedding = res.embedding.values;
  
  // Cache the result
  setCachedResponse(text, EMBEDDING_MODEL, embedding);
  
  // Track cost
  globalTracker.trackEmbedding(text, false); // Track cache miss
  
  return embedding;
}

// ===========================
// 🔹 COSINE SIMILARITY
// ===========================
function cosineSim(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

// ===========================
// 🔹 CHUNKING
// ===========================
function chunkText(text, size = 500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// ===========================
// 🔹 DETECT TYPE
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

// ===========================
// 🔹 GET FILES
// ===========================
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv"]);

function getAllFiles(dir, ext = [".js", ".ts", ".json", ".jsx", ".tsx", ".mjs"]) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        if (!IGNORE_DIRS.has(file)) {
          results = results.concat(getAllFiles(full, ext));
        }
      } else if (ext.includes(path.extname(file))) {
        results.push(full);
      }
    }
  } catch { /* skip inaccessible */ }
  return results;
}

// ===========================
// 🔥 BUILD INDEX (WITH BATCH EMBEDDINGS)
// ===========================
export async function buildIndex(folderPath) {
  const files = getAllFiles(folderPath);
  const index = [];
  const BATCH_SIZE = 10; // Process 10 chunks at once for better performance

  console.log(`🚀 Starting batch indexing for ${files.length} files...`);
  const startTime = Date.now();

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const chunks = chunkText(content);

      console.log(`📄 Indexing: ${file} (${chunks.length} chunks)`);

      // 🔥 BATCH PROCESSING: Process multiple chunks in parallel
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        
        // Embed all chunks in batch simultaneously
        const vectors = await Promise.all(
          batch.map(chunk => embed(chunk).catch(err => {
            console.warn(`⚠️ Embedding failed for chunk in ${file}: ${err.message}`);
            return null;
          }))
        );

        // Add successful embeddings to index
        batch.forEach((chunk, idx) => {
          if (vectors[idx]) {
            index.push({
              file,
              content: chunk,
              embedding: vectors[idx],
              type: detectType(file),
            });
          }
        });
      }
    } catch (err) {
      console.error(`❌ Failed to index ${file}: ${err.message}`);
    }
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Index saved with ${index.length} embeddings in ${duration}s`);
}

// ===========================
// 🔹 LOAD INDEX
// ===========================
export function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return [];
  }
}

// ===========================
// 🔹 SEARCH
// ===========================
export async function search(query, index, options = {}) {
  const { topK = 3, threshold = 0.7 } = options;
  const qVec = await embed(query);

  return index
    .map((item) => {
      let score = cosineSim(qVec, item.embedding);

      // Keyword boost
      if (item.content.toLowerCase().includes(query.toLowerCase())) {
        score += 0.1;
      }

      return { ...item, score };
    })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ===========================
// 🔹 BUILD CONTEXT
// ===========================
export function buildContext(results, maxLength = 3000) {
  let context = results
    .map((r) => `FILE: ${r.file}\nTYPE: ${r.type}\n\n${r.content}`)
    .join("\n---\n");

  return context.slice(0, maxLength);
}