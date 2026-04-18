import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = ".agent_cache";
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// ===========================
// 🔹 INITIALIZATION
// ===========================
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// ===========================
// 🔹 CACHE KEY GENERATION
// ===========================
function getCacheKey(text, model = "default") {
  const hash = crypto
    .createHash("md5")
    .update(`${model}:${text}`)
    .digest("hex");
  return hash;
}

// ===========================
// 🔹 GET FROM CACHE
// ===========================
export function getCached(key) {
  try {
    ensureCacheDir();
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    
    // Check if expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      fs.unlinkSync(cachePath);
      return null;
    }

    return cached.data;
  } catch (err) {
    console.warn(`⚠️ Cache read failed: ${err.message}`);
    return null;
  }
}

// ===========================
// 🔹 SET TO CACHE
// ===========================
export function setCache(key, data) {
  try {
    ensureCacheDir();
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    
    const cacheEntry = {
      timestamp: Date.now(),
      data: data,
    };

    fs.writeFileSync(cachePath, JSON.stringify(cacheEntry));
  } catch (err) {
    console.warn(`⚠️ Cache write failed: ${err.message}`);
  }
}

// ===========================
// 🔹 CACHE WITH AUTOMATIC KEY
// ===========================
export function getCachedResponse(text, model) {
  const key = getCacheKey(text, model);
  return getCached(key);
}

export function setCachedResponse(text, model, response) {
  const key = getCacheKey(text, model);
  setCache(key, response);
}

// ===========================
// 🔹 CLEAR CACHE
// ===========================
export function clearCache() {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
      console.log(`✅ Cleared ${files.length} cached items`);
    }
  } catch (err) {
    console.error(`❌ Cache clear failed: ${err.message}`);
  }
}

// ===========================
// 🔹 CACHE STATS
// ===========================
export function getCacheStats() {
  try {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);
    
    let totalSize = 0;
    let validCount = 0;
    let expiredCount = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stat = fs.statSync(filePath);
      totalSize += stat.size;

      try {
        const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Date.now() - cached.timestamp > CACHE_TTL) {
          expiredCount++;
        } else {
          validCount++;
        }
      } catch {
        expiredCount++;
      }
    }

    return {
      totalItems: files.length,
      validItems: validCount,
      expiredItems: expiredCount,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      ttlHours: CACHE_TTL / 3600000,
    };
  } catch (err) {
    return {
      error: err.message,
      totalItems: 0,
      validItems: 0,
      expiredItems: 0,
      totalSizeKB: 0,
    };
  }
}

// ===========================
// 🔹 CLEAN EXPIRED CACHE
// ===========================
export function cleanExpiredCache() {
  try {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      
      try {
        const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Date.now() - cached.timestamp > CACHE_TTL) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch {
        // If can't parse, delete it
        fs.unlinkSync(filePath);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
    }
    
    return cleanedCount;
  } catch (err) {
    console.error(`❌ Cache cleanup failed: ${err.message}`);
    return 0;
  }
}
