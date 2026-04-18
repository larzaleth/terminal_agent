import fs from "fs";
import chalk from "chalk";
import { COST_REPORT_FILE } from "../config/constants.js";

// ===========================
// 🔹 PRICING (per 1K tokens)
// ===========================
const PRICING = {
  "gemini-2.5-flash": {
    input: 0.00001875,  // $0.01875 per 1M tokens
    output: 0.000075,   // $0.075 per 1M tokens
  },
  "gemini-2.0-flash": {
    input: 0.00001,
    output: 0.00004,
  },
  "text-embedding-004": {
    input: 0.00001,
  },
};

// Fallback char→token ratio ONLY used when the API did not return usageMetadata.
// Real counts come from response.usageMetadata (populated by Gemini).
function estimateTokens(text) {
  if (!text) return 0;
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
      generation: { inputTokens: 0, outputTokens: 0, calls: 0 },
      embeddings: { tokens: 0, calls: 0 },
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.startTime = Date.now();
  }

  /**
   * Track an LLM generation call. Prefer passing exact token counts from
   * `response.usageMetadata`; falls back to char-based estimation only
   * when counts are not provided.
   *
   * @param {string} _model
   * @param {object|string} inputOrMeta - either usageMetadata {promptTokenCount, candidatesTokenCount} OR raw input text
   * @param {string} [outputText] - raw output text (only used when first arg is string)
   */
  trackGeneration(_model, inputOrMeta, outputText) {
    let inputTokens = 0;
    let outputTokens = 0;

    if (inputOrMeta && typeof inputOrMeta === "object") {
      inputTokens = inputOrMeta.promptTokenCount ?? inputOrMeta.inputTokens ?? 0;
      outputTokens =
        inputOrMeta.candidatesTokenCount ??
        inputOrMeta.outputTokens ??
        (typeof inputOrMeta.totalTokenCount === "number"
          ? Math.max(0, inputOrMeta.totalTokenCount - inputTokens)
          : 0);
    } else {
      inputTokens = estimateTokens(inputOrMeta);
      outputTokens = estimateTokens(outputText);
    }

    this.usage.generation.inputTokens += inputTokens;
    this.usage.generation.outputTokens += outputTokens;
    this.usage.generation.calls += 1;

    return { inputTokens, outputTokens };
  }

  trackEmbedding(text, fromCache = false) {
    if (fromCache) {
      this.usage.cacheHits += 1;
      return 0;
    }
    this.usage.cacheMisses += 1;
    const tokens = estimateTokens(text);
    this.usage.embeddings.tokens += tokens;
    this.usage.embeddings.calls += 1;
    return tokens;
  }

  calculateCost(model) {
    const pricing = PRICING[model] || PRICING["gemini-2.5-flash"];
    const generationCost =
      (this.usage.generation.inputTokens / 1000) * pricing.input +
      (this.usage.generation.outputTokens / 1000) * pricing.output;

    const embeddingPricing = PRICING["text-embedding-004"];
    const embeddingCost = (this.usage.embeddings.tokens / 1000) * embeddingPricing.input;

    return {
      generation: generationCost,
      embeddings: embeddingCost,
      total: generationCost + embeddingCost,
    };
  }

  getStats(model) {
    const cost = this.calculateCost(model);
    const duration = (Date.now() - this.startTime) / 1000;
    const totalCacheEvents = this.usage.cacheHits + this.usage.cacheMisses;
    const cacheHitRate = totalCacheEvents > 0
      ? (this.usage.cacheHits / totalCacheEvents * 100).toFixed(1)
      : 0;

    return { usage: this.usage, cost, duration, cacheHitRate };
  }

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

    console.log(chalk.white(`\n⏱️  Session Duration: ${stats.duration.toFixed(1)}s`));
    console.log(chalk.cyan("=".repeat(50) + "\n"));
  }

  saveToFile(model, filename = COST_REPORT_FILE) {
    const stats = this.getStats(model);
    const report = { timestamp: new Date().toISOString(), model, ...stats };

    try {
      let history = [];
      if (fs.existsSync(filename)) {
        history = JSON.parse(fs.readFileSync(filename, "utf-8"));
      }
      history.push(report);
      if (history.length > 100) history = history.slice(-100);
      fs.writeFileSync(filename, JSON.stringify(history, null, 2));
    } catch (err) {
      console.error(chalk.red(`❌ Failed to save cost report: ${err.message}`));
    }
  }

  getQuickSummary(model) {
    const stats = this.getStats(model);
    const total = stats.usage.generation.inputTokens + stats.usage.generation.outputTokens;
    return `💰 $${stats.cost.total.toFixed(6)} | 📊 ${total} tokens | 💾 ${stats.cacheHitRate}% cache hit`;
  }
}

export const globalTracker = new CostTracker();

// ===========================
// 🔹 HELPER: VIEW HISTORY
// ===========================
export function viewCostHistory(limit = 10) {
  try {
    if (!fs.existsSync(COST_REPORT_FILE)) {
      console.log(chalk.yellow("📊 No cost history found."));
      return;
    }

    const history = JSON.parse(fs.readFileSync(COST_REPORT_FILE, "utf-8"));
    const recent = history.slice(-limit);

    console.log(chalk.cyan("\n" + "=".repeat(50)));
    console.log(chalk.cyan.bold(`📊 COST HISTORY (Last ${limit} sessions)`));
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
