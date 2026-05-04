import fs from "fs";
import chalk from "chalk";
import { COST_REPORT_FILE } from "../config/constants.js";
import { writeFileAtomicSync } from "../utils/utils.js";

import { estimateTokens as baseEstimateTokens } from "../utils/utils.js";

// Cost tracker uses a more aggressive ratio (3.5) — closer to actual billed
// tokens for OpenAI / Gemini when usageMetadata is unavailable. Memory/context
// window logic in utils.js intentionally uses the looser default ratio (4).
const estimateTokens = (text) => baseEstimateTokens(text, 3.5);

// ===========================
// 🔹 PRICING (per 1K tokens, USD)
// Sources: Google AI Studio, OpenAI, Anthropic pricing pages (Jan 2026).
// ===========================
const PRICING = {
  // Gemini
  "gemini-3.1-pro": { input: 0.00125, output: 0.005 },
  "gemini-3-flash": { input: 0.00001875, output: 0.000075 },
  "gemini-2.5-flash": { input: 0.00001875, output: 0.000075 },
  "gemini-2.0-flash": { input: 0.00001, output: 0.00004 },
  "gemini-1.5-flash": { input: 0.0000075, output: 0.00003 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "text-embedding-004": { input: 0.00001 },

  // OpenAI
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4.1": { input: 0.002, output: 0.008 },
  "gpt-4.1-mini": { input: 0.0004, output: 0.0016 },
  "o1": { input: 0.015, output: 0.06 },
  "o1-mini": { input: 0.003, output: 0.012 },
  "o3-mini": { input: 0.0011, output: 0.0044 },
  "text-embedding-3-small": { input: 0.00002 },
  "text-embedding-3-large": { input: 0.00013 },

  // Anthropic
  "claude-3-5-sonnet-latest": { input: 0.003, output: 0.015 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku-latest": { input: 0.0008, output: 0.004 },
  "claude-3-opus-latest": { input: 0.015, output: 0.075 },
};

// Pre-sort once at module load time (longer keys first → better prefix specificity).
const SORTED_PRICING_KEYS = Object.keys(PRICING).sort((a, b) => b.length - a.length);

function pricingFor(model) {
  if (PRICING[model]) return PRICING[model];
  for (const key of SORTED_PRICING_KEYS) {
    if (model?.startsWith(key)) return PRICING[key];
  }
  return PRICING["gemini-2.5-flash"]; // safe default for unknown models
}

// Fallback char→token ratio ONLY used when the API did not return usageMetadata.
// Real counts come from response.usageMetadata (populated by Gemini).

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
      embeddings: { tokens: 0, calls: 0, byModel: {} },
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

  trackEmbedding(text, fromCache = false, model = "text-embedding-004") {
    if (fromCache) {
      this.usage.cacheHits += 1;
      return 0;
    }
    this.usage.cacheMisses += 1;
    const tokens = estimateTokens(text);
    this.usage.embeddings.tokens += tokens;
    this.usage.embeddings.calls += 1;
    if (!this.usage.embeddings.byModel[model]) {
      this.usage.embeddings.byModel[model] = { tokens: 0, calls: 0 };
    }
    this.usage.embeddings.byModel[model].tokens += tokens;
    this.usage.embeddings.byModel[model].calls += 1;
    return tokens;
  }

  calculateCost(model) {
    const pricing = pricingFor(model);
    const generationCost =
      (this.usage.generation.inputTokens / 1000) * pricing.input +
      (this.usage.generation.outputTokens / 1000) * (pricing.output ?? pricing.input);

    const byModel = this.usage.embeddings.byModel || {};
    const embeddingCost = Object.entries(byModel).reduce((sum, [embeddingModel, usage]) => {
      const embeddingPricing = pricingFor(embeddingModel);
      return sum + ((usage.tokens || 0) / 1000) * embeddingPricing.input;
    }, 0);

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

  saveTurn(model, turnEntry, filename = COST_REPORT_FILE) {
    const usdToIdr = 16000;
    const requestCostIdr = Math.ceil(turnEntry.cost * usdToIdr);

    const entry = {
      timestamp: new Date().toISOString(),
      model,
      tokens: turnEntry.tokens,
      cost_usd: turnEntry.cost,
      cost_idr: requestCostIdr,
    };

    try {
      let data = { requests: [], total_usd: 0, total_idr: 0 };
      if (fs.existsSync(filename)) {
        try {
          const raw = fs.readFileSync(filename, "utf-8");
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Migration from legacy array format
            data.requests = parsed.map((p) => ({
              timestamp: p.timestamp,
              model: p.model,
              tokens: (p.usage?.generation?.inputTokens || 0) + (p.usage?.generation?.outputTokens || 0),
              cost_usd: p.cost?.total || 0,
              cost_idr: Math.ceil((p.cost?.total || 0) * usdToIdr),
            }));
            data.total_usd = data.requests.reduce((s, r) => s + r.cost_usd, 0);
            data.total_idr = data.requests.reduce((s, r) => s + r.cost_idr, 0);
          } else {
            data = parsed;
          }
        } catch {
          /* reset on parse error */
        }
      }

      data.requests.push(entry);
      data.total_usd += entry.cost_usd;
      data.total_idr += entry.cost_idr;

      // Keep only last 1000 requests to avoid file bloating
      if (data.requests.length > 1000) {
        data.requests = data.requests.slice(-1000);
      }

      writeFileAtomicSync(filename, JSON.stringify(data, null, 2));
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

    const data = JSON.parse(fs.readFileSync(COST_REPORT_FILE, "utf-8"));
    const requests = data.requests || [];
    const recent = requests.slice(-limit);

    console.log(chalk.cyan("\n" + "=".repeat(50)));
    console.log(chalk.cyan.bold(`📊 COST HISTORY (Last ${limit} requests)`));
    console.log(chalk.cyan("=".repeat(50) + "\n"));

    recent.forEach((req, idx) => {
      const date = new Date(req.timestamp).toLocaleString();
      console.log(chalk.white(`${idx + 1}. ${date}`));
      console.log(chalk.dim(`   Model: ${req.model}`));
      console.log(chalk.dim(`   Cost:  $${req.cost_usd.toFixed(6)} (Rp${req.cost_idr.toLocaleString()})`));
      console.log(chalk.dim(`   Tokens: ${req.tokens.toLocaleString()}\n`));
    });

    console.log(chalk.green.bold(`💰 Grand Total: $${data.total_usd.toFixed(4)} (Rp${data.total_idr.toLocaleString()})`));
    console.log(chalk.cyan("=".repeat(50) + "\n"));
  } catch (err) {
    console.error(chalk.red(`❌ Failed to read cost history: ${err.message}`));
  }
}
