import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve package.json relative to this file so the path works regardless of
// where the user invokes the CLI from. Read once and cache.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.resolve(__dirname, "..", "..", "package.json");

let _cached;
export function getPackageVersion() {
  if (_cached) return _cached;
  try {
    const raw = fs.readFileSync(PKG_PATH, "utf-8");
    _cached = JSON.parse(raw).version || "0.0.0";
  } catch {
    _cached = "0.0.0";
  }
  return _cached;
}

export function getPackageInfo() {
  try {
    const raw = fs.readFileSync(PKG_PATH, "utf-8");
    const pkg = JSON.parse(raw);
    return { name: pkg.name, version: pkg.version, description: pkg.description };
  } catch {
    return { name: "ai-coding-agent", version: "0.0.0", description: "" };
  }
}
