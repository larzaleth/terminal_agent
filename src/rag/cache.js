import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CACHE_DIR, CACHE_TTL_MS, CACHE_MAX_ENTRIES } from "../config/constants.js";
import { writeFileAtomicSync } from "../utils/utils.js";

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(text, model = "default") {
  return crypto.createHash("md5").update(`${model}:${text}`).digest("hex");
}

// ===========================
// 🔹 LRU-ish eviction: when count exceeds MAX, drop oldest by mtime.
// ===========================
function evictIfNeeded() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    if (files.length <= CACHE_MAX_ENTRIES) return;

    const withTime = files.map((f) => {
      const full = path.join(CACHE_DIR, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    }).sort((a, b) => a.mtime - b.mtime);

    const toRemove = withTime.slice(0, files.length - CACHE_MAX_ENTRIES);
    for (const { full } of toRemove) {
      try { fs.unlinkSync(full); } catch { /* ignore */ }
    }
  } catch { /* best-effort */ }
}

// ===========================
// 🔹 GET / SET
// ===========================
export function getCached(key) {
  try {
    ensureCacheDir();
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(cachePath)) return null;

    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      fs.unlinkSync(cachePath);
      return null;
    }
    return cached.data;
  } catch (err) {
    console.warn(`⚠️ Cache read failed: ${err.message}`);
    return null;
  }
}

export function setCache(key, data) {
  try {
    ensureCacheDir();
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    writeFileAtomicSync(cachePath, JSON.stringify({ timestamp: Date.now(), data }));
    evictIfNeeded();
  } catch (err) {
    console.warn(`⚠️ Cache write failed: ${err.message}`);
  }
}

export function getCachedResponse(text, model) {
  return getCached(getCacheKey(text, model));
}

export function setCachedResponse(text, model, response) {
  setCache(getCacheKey(text, model), response);
}

// ===========================
// 🔹 MANAGEMENT
// ===========================
export function clearCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
    console.log(`✅ Cleared ${files.length} cached items`);
  } catch (err) {
    console.error(`❌ Cache clear failed: ${err.message}`);
  }
}

export function getCacheStats() {
  try {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);
    let totalSize = 0, validCount = 0, expiredCount = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      totalSize += fs.statSync(filePath).size;
      try {
        const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Date.now() - cached.timestamp > CACHE_TTL_MS) expiredCount++;
        else validCount++;
      } catch { expiredCount++; }
    }

    return {
      totalItems: files.length,
      validItems: validCount,
      expiredItems: expiredCount,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      ttlHours: CACHE_TTL_MS / 3600000,
    };
  } catch (err) {
    return { error: err.message, totalItems: 0, validItems: 0, expiredItems: 0, totalSizeKB: 0 };
  }
}

export function cleanExpiredCache() {
  try {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      try {
        const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
    return cleanedCount;
  } catch (err) {
    console.error(`❌ Cache cleanup failed: ${err.message}`);
    return 0;
  }
}
