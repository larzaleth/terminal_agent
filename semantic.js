import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 🔹 embed
export async function embed(text) {
  const res = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text,
  });

  return res.embedding.values;
}

// 🔹 cosine similarity
function cosineSim(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

// 🔹 recursive file read
function getAllFiles(dir, ext = [".js", ".ts", ".json"]) {
  let results = [];

  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(full, ext));
    } else {
      if (ext.includes(path.extname(file))) {
        results.push(full);
      }
    }
  }

  return results;
}

// 🔥 build index
export async function buildIndex(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error("❌ Folder tidak valid: " + folderPath);
  }

  const files = getAllFiles(folderPath);
  const index = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");

    console.log("📄 Embedding:", file);

    const vector = await embed(content);

    index.push({
      file,
      content,
      embedding: vector,
    });
  }

  fs.writeFileSync("index.json", JSON.stringify(index, null, 2));
  console.log("✅ Index saved (index.json)");
}

// 🔹 load index
export function loadIndex() {
  if (!fs.existsSync("index.json")) return [];
  return JSON.parse(fs.readFileSync("index.json", "utf-8"));
}

// 🔹 search
export async function search(query, index) {
  const qVec = await embed(query);

  return index
    .map((item) => ({
      ...item,
      score: cosineSim(qVec, item.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
