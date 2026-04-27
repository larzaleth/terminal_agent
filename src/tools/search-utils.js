import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { appendBoundedBuffer } from "../utils/utils.js";
import { IGNORE_DIRS, BINARY_EXTS } from "../config/constants.js";

export const GREP_MAX_MATCHES = 50;

/**
 * Async recursive walker. Yields files lazily.
 */
export async function* walkFiles(dir, include) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        yield* walkFiles(fullPath, include);
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTS.has(ext)) continue;
      if (include && !matchesIncludePattern(entry.name, include)) continue;
      yield fullPath;
    }
  }
}

export function matchesIncludePattern(fileName, include) {
  if (!include) return true;
  const escaped = include
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(fileName);
}

export function createSearchMatcher(pattern, isRegex) {
  if (!isRegex) {
    const needle = pattern.toLowerCase();
    return (line) => line.toLowerCase().includes(needle);
  }
  const regex = new RegExp(pattern, "i");
  return (line) => regex.test(line);
}

export async function collectMatchesFromFile(filePath, matcher, matches, maxMatches) {
  const stream = fsSync.createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;

  try {
    for await (const line of reader) {
      lineNumber++;
      if (!matcher(line)) continue;
      matches.push(`${filePath}:${lineNumber}: ${line.trim()}`);
      if (matches.length >= maxMatches) return true;
    }
  } finally {
    reader.close();
    stream.destroy();
  }
  return false;
}

export async function fallbackGrepSearch({
  pattern,
  dir,
  include,
  isRegex,
  maxMatches = GREP_MAX_MATCHES,
}) {
  const matcher = createSearchMatcher(pattern, isRegex);
  const matches = [];
  let filesScanned = 0;
  let sawFiles = false;

  for await (const file of walkFiles(dir, include)) {
    sawFiles = true;
    filesScanned++;
    try {
      const reachedLimit = await collectMatchesFromFile(file, matcher, matches, maxMatches);
      if (reachedLimit) break;
    } catch {
      /* skip unreadable files */
    }
  }

  return {
    matches,
    filesScanned,
    sawFiles,
    limited: matches.length >= maxMatches,
  };
}

export async function ripgrepSearch({
  pattern,
  dir,
  include,
  isRegex,
  maxMatches = GREP_MAX_MATCHES,
}) {
  return new Promise((resolve) => {
    const args = ["--line-number", "--color", "never", "--max-count", String(maxMatches)];
    if (!isRegex) args.push("--fixed-strings");
    if (include) args.push("--glob", include);
    args.push("--", pattern, dir);

    const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const matches = [];
    let stderr = "";
    let remainder = "";
    let abortedAfterLimit = false;

    const pushLines = (text) => {
      remainder += text;
      const lines = remainder.split(/\r?\n/);
      remainder = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) continue;
        if (matches.length < maxMatches) {
          matches.push(line);
          continue;
        }
        abortedAfterLimit = true;
        child.kill();
        break;
      }
    };

    child.stdout.on("data", (chunk) => {
      pushLines(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendBoundedBuffer(stderr, chunk.toString(), 4096);
    });

    child.on("error", () => {
      resolve(null);
    });

    child.on("close", (code) => {
      if (remainder && matches.length < maxMatches) matches.push(remainder);
      if (abortedAfterLimit) return resolve({ matches, limited: true });
      if (code === 0) return resolve({ matches, limited: false });
      if (code === 1) return resolve({ matches: [], limited: false });
      resolve({ error: stderr.trim() || `ripgrep exited with code ${code}` });
    });
  });
}
