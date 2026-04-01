import fs from "fs";
import path from "path";
import { ai } from "./llm.js";

const INDEX_FILE = "index.json";

// ===========================
// 🔹 EMBEDDING
// ===========================
export async function embed(text) {
  const res = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text,
  });
  return res.embedding.values;
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
// 🔥 BUILD INDEX
// ===========================
export async function buildIndex(folderPath) {
  const files = getAllFiles(folderPath);
  const index = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const chunks = chunkText(content);

    console.log("📄 Indexing:", file);

    for (const chunk of chunks) {
      const vector = await embed(chunk);
      index.push({
        file,
        content: chunk,
        embedding: vector,
        type: detectType(file),
      });
    }
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log("✅ Index saved");
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