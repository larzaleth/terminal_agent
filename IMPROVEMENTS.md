# AI Coding Agent - Improvement Roadmap

## 🚀 Priority 1: Performance Optimizations

### 1.1 Batch Embedding API Calls
**Problem:** Sequential embedding in semantic.js is slow
**Solution:**
```javascript
// In semantic.js
export async function buildIndex(folderPath) {
  const files = getAllFiles(folderPath);
  const index = [];
  const BATCH_SIZE = 10; // Process 10 chunks at once

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const chunks = chunkText(content);
    
    console.log("📄 Indexing:", file);
    
    // Batch embed chunks
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const vectors = await Promise.all(batch.map(chunk => embed(chunk)));
      
      batch.forEach((chunk, idx) => {
        index.push({
          file,
          content: chunk,
          embedding: vectors[idx],
          type: detectType(file),
        });
      });
    }
  }
  
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log("✅ Index saved");
}
```
**Impact:** 5-10x faster indexing

### 1.2 Add Response Caching
**Problem:** Same queries trigger API calls repeatedly
**Solution:**
```javascript
// New file: cache.js
import fs from "fs";
import crypto from "crypto";

const CACHE_DIR = ".agent_cache";
const CACHE_TTL = 3600000; // 1 hour

function getCacheKey(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

export function getCached(key) {
  const cachePath = `${CACHE_DIR}/${key}.json`;
  if (!fs.existsSync(cachePath)) return null;
  
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    fs.unlinkSync(cachePath);
    return null;
  }
  
  return cached.data;
}

export function setCache(key, data) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);
  fs.writeFileSync(`${CACHE_DIR}/${key}.json`, JSON.stringify({
    timestamp: Date.now(),
    data
  }));
}
```
**Impact:** 50-90% reduction in API calls for repeated queries

### 1.3 Streaming File Reader for Large Files
**Problem:** Large files cause memory issues
**Solution:**
```javascript
// In tools.js
import { createReadStream } from "fs";

read_file: async ({ path: filePath }) => {
  try {
    const stat = fs.statSync(filePath);
    const MAX_SIZE = 1024 * 1024; // 1MB
    
    if (stat.size > MAX_SIZE) {
      return `Error: File too large (${(stat.size / 1024 / 1024).toFixed(2)}MB). Use grep_search to find specific content instead.`;
    }
    
    // For smaller files, read normally
    const content = fs.readFileSync(filePath, "utf-8");
    const numbered = content.split("\n").map((line, i) => `${i + 1}: ${line}`).join("\n");
    return truncate(numbered, 8000);
  } catch (err) {
    return `Error: ${err.message}`;
  }
}
```
**Impact:** Prevents memory crashes, better UX

---

## 🎯 Priority 2: Smart Features

### 2.1 File Change Preview (Git-style Diff)
**Problem:** No visibility into what will change before writing
**Solution:**
```javascript
// New tool: preview_edit
import { diffLines } from "diff"; // npm install diff

preview_edit: async ({ path: filePath, target, replacement }) => {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    if (!content.includes(target)) {
      return "Error: Target string not found";
    }
    
    const newContent = content.replace(target, replacement);
    const diff = diffLines(content, newContent);
    
    let preview = "📝 Preview of changes:\n\n";
    diff.forEach(part => {
      const color = part.added ? "+" : part.removed ? "-" : " ";
      const lines = part.value.split("\n").slice(0, -1);
      lines.forEach(line => {
        preview += `${color} ${line}\n`;
      });
    });
    
    return preview + "\n✅ To apply: Use edit_file with same parameters";
  } catch (err) {
    return `Error: ${err.message}`;
  }
}
```
**Impact:** Prevents accidental overwrites, builds trust

### 2.2 Multi-file Edit Support
**Problem:** Can only edit one file at a time
**Solution:**
```javascript
// New tool: batch_edit
batch_edit: async ({ edits }) => {
  // edits = [{ path, target, replacement }, ...]
  const results = [];
  
  for (const edit of edits) {
    try {
      const content = fs.readFileSync(edit.path, "utf-8");
      const newContent = content.replace(edit.target, edit.replacement);
      fs.writeFileSync(edit.path, newContent);
      results.push(`✅ ${edit.path}`);
    } catch (err) {
      results.push(`❌ ${edit.path}: ${err.message}`);
    }
  }
  
  return results.join("\n");
}
```
**Impact:** Enables complex refactoring

### 2.3 Context Window Management
**Problem:** No tracking of token usage
**Solution:**
```javascript
// In agents.js
function estimateTokens(text) {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

function getContextStats(memory) {
  const totalTokens = memory.reduce((sum, msg) => {
    const text = msg.parts.map(p => p.text || "").join("");
    return sum + estimateTokens(text);
  }, 0);
  
  return {
    messages: memory.length,
    estimatedTokens: totalTokens,
    percentOfLimit: (totalTokens / 1000000) * 100 // Gemini 2.5 limit
  };
}

// Show this to user periodically
```
**Impact:** Prevents context overflow errors

### 2.4 Undo/Rollback System
**Problem:** No way to revert changes
**Solution:**
```javascript
// New file: backup.js
const BACKUP_DIR = ".agent_backups";

export function backupFile(filePath) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  
  const timestamp = Date.now();
  const backupPath = `${BACKUP_DIR}/${path.basename(filePath)}.${timestamp}`;
  
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  }
  return null;
}

export function listBackups(filePath) {
  const fileName = path.basename(filePath);
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(fileName))
    .sort()
    .reverse();
  
  return backups;
}

export function restoreBackup(backupPath, targetPath) {
  fs.copyFileSync(backupPath, targetPath);
}
```
**Impact:** Safety net for users

---

## 🎯 Priority 3: Code Quality

### 3.1 Add Comprehensive Logging
**Problem:** Only console.log, no structured logging
**Solution:**
```javascript
// New file: logger.js
import fs from "fs";
import chalk from "chalk";

const LOG_FILE = "agent.log";
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

class Logger {
  constructor(level = "INFO") {
    this.level = LOG_LEVELS[level];
  }
  
  log(level, message, meta = {}) {
    if (LOG_LEVELS[level] < this.level) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };
    
    // Write to file
    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + "\n");
    
    // Console output with colors
    const colors = {
      DEBUG: chalk.gray,
      INFO: chalk.blue,
      WARN: chalk.yellow,
      ERROR: chalk.red
    };
    
    console.log(colors[level](`[${level}] ${message}`));
  }
  
  debug(msg, meta) { this.log("DEBUG", msg, meta); }
  info(msg, meta) { this.log("INFO", msg, meta); }
  warn(msg, meta) { this.log("WARN", msg, meta); }
  error(msg, meta) { this.log("ERROR", msg, meta); }
}

export const logger = new Logger();
```
**Impact:** Better debugging, monitoring

### 3.2 Add JSDoc Types
**Problem:** No type information
**Solution:**
```javascript
/**
 * Build semantic index for a folder
 * @param {string} folderPath - Path to folder to index
 * @param {Object} options - Indexing options
 * @param {string[]} options.extensions - File extensions to include
 * @param {number} options.chunkSize - Chunk size for splitting files
 * @returns {Promise<void>}
 */
export async function buildIndex(folderPath, options = {}) {
  const { extensions = [".js", ".ts", ".json"], chunkSize = 500 } = options;
  // ...
}
```
**Impact:** Better IDE support, fewer bugs

### 3.3 Input Validation
**Problem:** Missing validation in tools
**Solution:**
```javascript
// In tools.js
function validatePath(filePath) {
  if (!filePath) throw new Error("Path is required");
  if (!isSafePath(filePath)) throw new Error("Path traversal detected");
  if (filePath.length > 260) throw new Error("Path too long");
  return true;
}

read_file: async ({ path: filePath }) => {
  try {
    validatePath(filePath);
    // ... rest of implementation
  } catch (err) {
    return `Error: ${err.message}`;
  }
}
```

---

## 🎯 Priority 4: New Features

### 4.1 Git Integration Tools
```javascript
git_status: async () => {
  return execSync("git status --short").toString();
},

git_diff: async ({ file = "" }) => {
  const cmd = file ? `git diff ${file}` : "git diff";
  return truncate(execSync(cmd).toString(), 3000);
},

git_commit: async ({ message }) => {
  await confirmExecution(`git add -A && git commit -m "${message}"`);
  return execSync(`git add -A && git commit -m "${message}"`).toString();
}
```

### 4.2 Code Analysis Integration
```javascript
analyze_code: async ({ path: filePath }) => {
  // For JavaScript/TypeScript
  if (filePath.endsWith(".js") || filePath.endsWith(".ts")) {
    try {
      const result = execSync(`npx eslint ${filePath} --format json`, {
        encoding: "utf-8"
      });
      return JSON.stringify(JSON.parse(result), null, 2);
    } catch (err) {
      return "No issues found or ESLint not configured";
    }
  }
  
  return "Analysis not supported for this file type";
}
```

### 4.3 Test Generation
```javascript
generate_test: async ({ sourceFile }) => {
  const content = fs.readFileSync(sourceFile, "utf-8");
  
  const prompt = `Generate comprehensive unit tests for this code:\n\n${content}\n\nUse Jest framework.`;
  
  const model = getModel();
  const response = await ask(model, [{ role: "user", content: prompt }]);
  
  const testFile = sourceFile.replace(/\.js$/, ".test.js");
  return `Suggested test file: ${testFile}\n\n${response}`;
}
```

### 4.4 Cost Tracking
```javascript
// New file: cost-tracker.js
const COSTS = {
  "gemini-2.5-flash": { input: 0.0001, output: 0.0003 }, // per 1K tokens
  "text-embedding-004": { input: 0.00001 }
};

export class CostTracker {
  constructor() {
    this.usage = { inputTokens: 0, outputTokens: 0, embeddings: 0 };
  }
  
  trackGeneration(model, inputTokens, outputTokens) {
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
  }
  
  trackEmbedding(count) {
    this.usage.embeddings += count;
  }
  
  getCost() {
    const model = config.model;
    const costs = COSTS[model];
    
    return {
      generation: (this.usage.inputTokens / 1000 * costs.input) + 
                  (this.usage.outputTokens / 1000 * costs.output),
      embeddings: this.usage.embeddings / 1000 * COSTS["text-embedding-004"].input,
      get total() { return this.generation + this.embeddings; }
    };
  }
  
  getReport() {
    const cost = this.getCost();
    return `
💰 Session Cost:
   Input: ${this.usage.inputTokens} tokens ($${cost.generation.toFixed(4)})
   Embeddings: ${this.usage.embeddings} ($${cost.embeddings.toFixed(4)})
   Total: $${cost.total.toFixed(4)}
    `.trim();
  }
}
```

### 4.5 Interactive Planning
```javascript
// In cli.js - after plan is created
onPlan: async (plan) => {
  spinner.stop();
  console.log(chalk.magenta.bold("\n📋 PROPOSED PLAN:"));
  plan.forEach((p, i) => {
    console.log(chalk.magenta(`  ${i + 1}. ${p.step}`));
  });
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(chalk.yellow("\nProceed with this plan? (Y/n/edit) > "));
  rl.close();
  
  if (answer.trim().toLowerCase() === "n") {
    console.log(chalk.red("❌ Plan rejected. Please rephrase your request."));
    return prompt();
  }
  
  console.log("");
}
```

---

## 🎯 Priority 5: Robustness

### 5.1 Graceful Degradation
```javascript
// In agents.js
try {
  const index = loadIndex();
  if (index.length > 0) {
    const results = await search(userInput, index, { topK: 3, threshold: 0.7 });
    context = buildContext(results);
  }
} catch (err) {
  logger.warn("RAG failed, continuing without context", { error: err.message });
  // Continue without RAG - agent still works
}
```

### 5.2 Better Error Messages
```javascript
// In tools.js
catch (err) {
  if (err.code === "ENOENT") {
    return `Error: File not found at ${filePath}. Use list_dir to check the path.`;
  }
  if (err.code === "EACCES") {
    return `Error: Permission denied for ${filePath}. Check file permissions.`;
  }
  return `Error: ${err.message}`;
}
```

### 5.3 Incremental Index Updates
```javascript
// In semantic.js
export async function updateIndex(filePath) {
  let index = loadIndex();
  
  // Remove old entries for this file
  index = index.filter(item => item.file !== filePath);
  
  // Add new entries
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    const chunks = chunkText(content);
    
    for (const chunk of chunks) {
      const vector = await embed(chunk);
      index.push({
        file: filePath,
        content: chunk,
        embedding: vector,
        type: detectType(filePath),
      });
    }
  }
  
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Auto-update after file writes
write_file: async ({ path: filePath, content }) => {
  // ... write logic
  await updateIndex(filePath); // Keep index fresh
  return `Success: Written to ${filePath}`;
}
```

---

## 🎯 Priority 6: Configuration & Extensibility

### 6.1 Plugin Architecture
```javascript
// New file: plugins.js
export class PluginManager {
  constructor() {
    this.plugins = new Map();
  }
  
  register(name, plugin) {
    if (!plugin.tools && !plugin.hooks) {
      throw new Error("Plugin must provide tools or hooks");
    }
    this.plugins.set(name, plugin);
  }
  
  getTools() {
    const tools = {};
    for (const [name, plugin] of this.plugins) {
      if (plugin.tools) {
        Object.assign(tools, plugin.tools);
      }
    }
    return tools;
  }
  
  async runHook(hookName, ...args) {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.[hookName]) {
        await plugin.hooks[hookName](...args);
      }
    }
  }
}

// Example plugin
const githubPlugin = {
  name: "github",
  tools: {
    create_pr: async ({ title, body }) => {
      // GitHub PR creation logic
    }
  },
  hooks: {
    beforeCommit: async (files) => {
      console.log("Running pre-commit checks...");
    }
  }
};
```

### 6.2 Per-Project Configuration
```javascript
// In config.js
export function loadConfig() {
  const defaultConfig = { /* ... */ };
  
  // Global config
  const globalPath = path.join(os.homedir(), ".myagent.config.json");
  let config = defaultConfig;
  
  if (fs.existsSync(globalPath)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(globalPath)) };
  }
  
  // Project-specific config (overrides global)
  const projectPath = path.join(process.cwd(), "agent.config.json");
  if (fs.existsSync(projectPath)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(projectPath)) };
  }
  
  return config;
}
```

---

## 📊 Recommended Implementation Order

### Phase 1: Quick Wins (1-2 days)
1. ✅ Add batch embedding (2.1)
2. ✅ Add response caching (2.2)
3. ✅ Add JSDoc types (3.2)
4. ✅ Add cost tracking (4.4)
5. ✅ Better error messages (5.2)

### Phase 2: User Experience (3-4 days)
1. ✅ File change preview (2.1)
2. ✅ Interactive planning (4.5)
3. ✅ Undo/rollback (2.4)
4. ✅ Git integration (4.1)
5. ✅ Streaming file reader (1.3)

### Phase 3: Advanced Features (1 week)
1. ✅ Multi-file edit (2.2)
2. ✅ Code analysis (4.2)
3. ✅ Test generation (4.3)
4. ✅ Incremental indexing (5.3)
5. ✅ Context window management (2.3)

### Phase 4: Architecture (1-2 weeks)
1. ✅ Plugin system (6.1)
2. ✅ Per-project config (6.2)
3. ✅ Comprehensive logging (3.1)
4. ✅ Graceful degradation (5.1)

---

## 🔒 Security Improvements

1. **Command Whitelist/Blacklist**
```javascript
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//, // Deleting root
  /:\(\)\{:\|:&\};:/, // Fork bomb
  /sudo\s+/, // Sudo commands
  />\/dev\/sd[a-z]/, // Writing to disk devices
];

function isCommandSafe(cmd) {
  return !DANGEROUS_PATTERNS.some(pattern => pattern.test(cmd));
}
```

2. **API Key Encryption**
```javascript
import crypto from "crypto";

function encryptKey(key, password) {
  const cipher = crypto.createCipher("aes-256-cbc", password);
  return cipher.update(key, "utf8", "hex") + cipher.final("hex");
}
```

3. **File Access Restrictions**
```javascript
const RESTRICTED_PATHS = [
  "/etc/",
  "/sys/",
  "/proc/",
  os.homedir() + "/.ssh/"
];

function isSafePath(filePath) {
  const absolute = path.resolve(filePath);
  return !RESTRICTED_PATHS.some(restricted => absolute.startsWith(restricted));
}
```

---

## 📈 Monitoring & Analytics

```javascript
// New file: telemetry.js
export class Telemetry {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulTasks: 0,
      failedTasks: 0,
      toolUsage: {},
      averageResponseTime: 0,
      totalCost: 0
    };
  }
  
  trackToolUse(toolName) {
    this.metrics.toolUsage[toolName] = (this.metrics.toolUsage[toolName] || 0) + 1;
  }
  
  getReport() {
    return {
      ...this.metrics,
      successRate: (this.metrics.successfulTasks / this.metrics.totalRequests * 100).toFixed(2) + "%",
      mostUsedTool: Object.entries(this.metrics.toolUsage)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || "none"
    };
  }
}
```

---

## 🌟 Bonus: Multi-Model Support

```javascript
// In llm.js
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai"; // npm install openai
import Anthropic from "@anthropic-ai/sdk"; // npm install @anthropic-ai/sdk

export class UniversalLLM {
  constructor(provider, apiKey) {
    this.provider = provider;
    
    if (provider === "gemini") {
      this.client = new GoogleGenAI({ apiKey });
    } else if (provider === "openai") {
      this.client = new OpenAI({ apiKey });
    } else if (provider === "anthropic") {
      this.client = new Anthropic({ apiKey });
    }
  }
  
  async generateContent({ model, contents, config }) {
    if (this.provider === "gemini") {
      return this.client.models.generateContent({ model, contents, config });
    } else if (this.provider === "openai") {
      // Convert to OpenAI format
      const messages = contents.map(c => ({
        role: c.role,
        content: c.parts.map(p => p.text).join("\n")
      }));
      
      const response = await this.client.chat.completions.create({
        model,
        messages,
        ...config
      });
      
      return {
        candidates: [{
          content: {
            parts: [{ text: response.choices[0].message.content }]
          }
        }]
      };
    }
    // Add Anthropic support similarly
  }
}
```

---

## 📝 Documentation Improvements

1. **Add Architecture Diagram**
2. **Create Examples Directory** with common use cases
3. **Add Troubleshooting Guide**
4. **Create Contributing Guide**
5. **Add Performance Benchmarks**
6. **Translate README to English** (currently mixed ID/EN)

---

## 🎯 Summary of Top 10 Priorities

1. **Batch Embeddings** - 10x faster indexing
2. **Response Caching** - 50-90% fewer API calls
3. **File Change Preview** - Prevents mistakes
4. **Cost Tracking** - User awareness
5. **Git Integration** - Essential for real coding
6. **Undo/Rollback** - Safety net
7. **Better Error Messages** - Improved UX
8. **Interactive Planning** - User control
9. **Logging System** - Debugging & monitoring
10. **Plugin Architecture** - Extensibility

Would you like me to implement any of these improvements right away?
