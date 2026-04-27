import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tools } from "../src/tools/tools.js";

function makeWorkspaceTempDir() {
  const dir = path.join(process.cwd(), `.tmp-tools-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test("read_file: previews large files without reading full output into the response", async () => {
  const dir = makeWorkspaceTempDir();
  const filePath = path.join(dir, "large.txt");

  try {
    const lines = Array.from({ length: 2000 }, (_, i) => `line-${i + 1} ${"x".repeat(20)}`);
    fs.writeFileSync(filePath, lines.join("\n"));

    const result = await tools.read_file({ path: filePath });
    assert.match(result, /^1: line-1 /);
    assert.match(result, /\(truncated, file preview only\)$/);
    assert.ok(result.length < 9000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("grep_search: falls back when ripgrep is unavailable and respects include filters", async () => {
  const dir = makeWorkspaceTempDir();
  const jsFile = path.join(dir, "match.js");
  const mdFile = path.join(dir, "ignore.md");
  const originalPath = process.env.PATH;
  const originalWindowsPath = process.env.Path;

  try {
    fs.writeFileSync(jsFile, "const token = 'needle';\nconsole.log(token);\n");
    fs.writeFileSync(mdFile, "needle in markdown\n");
    process.env.PATH = "";
    process.env.Path = "";

    const result = await tools.grep_search({ pattern: "needle", dir, include: "*.js" });
    assert.match(result, /Found 1 matches/);
    assert.match(result, /match\.js:1:/);
    assert.doesNotMatch(result, /ignore\.md/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalWindowsPath === undefined) delete process.env.Path;
    else process.env.Path = originalWindowsPath;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
