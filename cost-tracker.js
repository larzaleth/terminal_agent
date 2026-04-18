import fs from "fs";
import chalk from "chalk";

// ===========================
// 🔹 PRICING (per 1K tokens)
// ===========================
const PRICING = {
  "gemini-2.5-flash": {
    input: 0.00001875,  // $0.01875 per 1M tokens
    output: 0.000075,   // $0.075 per 1M tokens
  },
  "gemini-2.0-flash": {
    input: 0.00001,     // $0.01 per 1M tokens
    output: 0.00004,    // $0.04 per 1M tokens
  },
  "text-embedding-004": {
    input: 0.00001,     // $0.01 per 1M tokens
  },
};

// ===========================
// 🔹 TOKEN ESTIMATION
// ===========================
function estimateTokens(text) {
  if (!text) return 0;
  // Rough estimation: 1 token ≈ 4 characters for English
  // More conservative for better accuracy
  return Math.ceil(text.length / 3.5);
}

// ===========================
// 🔹 COST TRACKER CLASS
// ===========================
export class CostTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.usage = {
      generation: {
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
      },
      embeddings: {
        tokens: 0,
        calls: 0,
      },
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.startTime = Date.now();
  }

  // ===========================
  // 🔹 TRACK GENERATION
  // ===========================
  trackGeneration(model, inputText, outputText) {
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);

    this.usage.generation.inputTokens += inputTokens;
    this.usage.generation.outputTokens += outputTokens;
    this.usage.generation.calls += 1;

    return { inputTokens, outputTokens };
  }

  // ===========================
  // 🔹 TRACK EMBEDDING
  // ===========================
  trackEmbedding(text, fromCache = false) {
    if (fromCache) {
      this.usage.cacheHits += 1;
    } else {
      this.usage.cacheMisses += 1;
      const tokens = estimateTokens(text);
      this.usage.embeddings.tokens += tokens;
      this.usage.embeddings.calls += 1;
      return tokens;
    }
    return 0;
  }

  // ===========================
  // 🔹 CALCULATE COST
  // ===========================
  calculateCost(model) {
    const pricing = PRICING[model] || PRICING["gemini-2.5-flash"];
    
    const generationCost =
      (this.usage.generation.inputTokens / 1000) * pricing.input +
      (this.usage.generation.outputTokens / 1000) * pricing.output;

    const embeddingPricing = PRICING["text-embedding-004"];
    const embeddingCost =
      (this.usage.embeddings.tokens / 1000) * embeddingPricing.input;

    return {
      generation: generationCost,
      embeddings: embeddingCost,
      total: generationCost + embeddingCost,
    };
  }

  // ===========================
  // 🔹 GET STATISTICS
  // ===========================
  getStats(model) {
    const cost = this.calculateCost(model);
    const duration = (Date.now() - this.startTime) / 1000;
    const cacheHitRate = this.usage.cacheHits + this.usage.cacheMisses > 0
      ? (this.usage.cacheHits / (this.usage.cacheHits + this.usage.cacheMisses) * 100).toFixed(1)
      : 0;

    return {
      usage: this.usage,
      cost,
      duration,
      cacheHitRate,
    };
  }

  // ===========================
  // 🔹 DISPLAY REPORT
  // ===========================
  displayReport(model) {
    const stats = this.getStats(model);

    console.log(chalk.cyan("\n" + "=".repeat(50)));
    console.log(chalk.cyan.bold("💰 SESSION COST REPORT"));
    console.log(chalk.cyan("=".repeat(50)));

    console.log(chalk.white("\n📊 Token Usage:"));
    console.log(chalk.dim(`  Input Tokens:  ${stats.usage.generation.inputTokens.toLocaleString()}`));
    console.log(chalk.dim(`  Output Tokens: ${stats.usage.generation.outputTokens.toLocaleString()}`));
    console.log(chalk.dim(`  API Calls:     ${stats.usage.generation.calls}`));

    console.log(chalk.white("\n🔍 Embeddings:"));
    console.log(chalk.dim(`  Tokens:        ${stats.usage.embeddings.tokens.toLocaleString()}`));
    console.log(chalk.dim(`  API Calls:     ${stats.usage.embeddings.calls}`));

    console.log(chalk.white("\n💾 Cache Performance:"));
    console.log(chalk.green(`  Cache Hits:    ${stats.usage.cacheHits}`));
    console.log(chalk.yellow(`  Cache Misses:  ${stats.usage.cacheMisses}`));
    console.log(chalk.cyan(`  Hit Rate:      ${stats.cacheHitRate}%`));

    console.log(chalk.white("\n💵 Estimated Cost:"));
    console.log(chalk.dim(`  Generation:    $${stats.cost.generation.toFixed(6)}`));
    console.log(chalk.dim(`  Embeddings:    $${stats.cost.embeddings.toFixed(6)}`));
    console.log(chalk.green.bold(`  Total:         $${stats.cost.total.toFixed(6)}`));

    const savedCost = stats.usage.cacheHits > 0
      ? (stats.usage.cacheHits * stats.cost.total / (stats.usage.cacheHits + stats.usage.cacheMisses))
      : 0;
    
    if (savedCost > 0) {
      console.log(chalk.green(`  Saved (cache): ~$${savedCost.toFixed(6)}`));
    }

    console.log(chalk.white(`\n⏱️  Session Duration: ${stats.duration.toFixed(1)}s`));
    console.log(chalk.cyan("=".repeat(50) + "\n"));
  }

  // ===========================
  // 🔹 SAVE TO FILE
  // ===========================
  saveToFile(model, filename = "cost-report.json") {
    const stats = this.getStats(model);
    const report = {
      timestamp: new Date().toISOString(),
      model,
      ...stats,
    };

    try {
      let history = [];
      if (fs.existsSync(filename)) {
        history = JSON.parse(fs.readFileSync(filename, "utf-8"));
      }
      history.push(report);

      // Keep only last 100 sessions
      if (history.length > 100) {
        history = history.slice(-100);
      }

      fs.writeFileSync(filename, JSON.stringify(history, null, 2));
    } catch (err) {
      console.error(chalk.red(`❌ Failed to save cost report: ${err.message}`));
    }
  }

  // ===========================
  // 🔹 QUICK SUMMARY
  // ===========================
  getQuickSummary(model) {
    const stats = this.getStats(model);
    return `💰 $${stats.cost.total.toFixed(6)} | 📊 ${stats.usage.generation.inputTokens + stats.usage.generation.outputTokens} tokens | 💾 ${stats.cacheHitRate}% cache hit`;
  }
}

// ===========================
// 🔹 GLOBAL TRACKER INSTANCE
// ===========================
export const globalTracker = new CostTracker();

// ===========================
// 🔹 HELPER: VIEW HISTORY
// ===========================
export function viewCostHistory(limit = 10) {
  try {
    if (!fs.existsSync("cost-report.json")) {
      console.log(chalk.yellow("📊 No cost history found."));
      return;
    }

    const history = JSON.parse(fs.readFileSync("cost-report.json", "utf-8"));
    const recent = history.slice(-limit);

    console.log(chalk.cyan("\n" + "=".repeat(50)));
    console.log(chalk.cyan.bold("📊 COST HISTORY (Last " + limit + " sessions)"));
    console.log(chalk.cyan("=".repeat(50) + "\n"));

    let totalCost = 0;
    recent.forEach((session, idx) => {
      const date = new Date(session.timestamp).toLocaleString();
      console.log(chalk.white(`${idx + 1}. ${date}`));
      console.log(chalk.dim(`   Model: ${session.model}`));
      console.log(chalk.dim(`   Cost: $${session.cost.total.toFixed(6)}`));
      console.log(chalk.dim(`   Duration: ${session.duration.toFixed(1)}s`));
      console.log(chalk.dim(`   Cache Hit Rate: ${session.cacheHitRate}%\n`));
      totalCost += session.cost.total;
    });

    console.log(chalk.green.bold(`💰 Total Cost (last ${limit}): $${totalCost.toFixed(6)}`));
    console.log(chalk.cyan("=".repeat(50) + "\n"));
  } catch (err) {
    console.error(chalk.red(`❌ Failed to read cost history: ${err.message}`));
  }
}
