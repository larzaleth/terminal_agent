import { getProvider } from "../llm/providers/index.js";
import { loadConfig } from "../config/config.js";
import { wordCount } from "../utils/utils.js";
import { log } from "../utils/logger.js";
import { PLANNER_MIN_WORDS } from "../config/constants.js";

/**
 * Build a brief plan for a user request. Short/simple requests skip the
 * planner entirely to save both latency and tokens.
 */
export async function createPlan(userInput, memory = []) {
  const isContinuation = /^(lanjut|continue|next|go\s?ahead|ok|okay|yup|ya|sip|gas|gaspoll)/i.test(userInput.trim());
  const isRefactor = /\b(refactor|restructur|extract|split|modulariz|reorganiz|move\s+(to|into|component)|break\s+(up|apart|into)|decompos)/i.test(userInput);
  
  if (wordCount(userInput) < PLANNER_MIN_WORDS && !isContinuation) {
    return [{ step: "Process request", action: "respond" }];
  }

  const config = loadConfig();

  // Build context hint based on detected intent
  let contextHint = "";
  if (isContinuation && memory.length > 0) {
    contextHint = `\nContext: This is a continuation of the previous conversation. Refer to the history to see what was done and what remains.`;
  }
  
  let modeHint = "";
  if (isRefactor) {
    modeHint = `\nMode: FAST (refactoring). Prioritize speed. Steps should use write_file for new modules and replace_lines for removing extracted code. Minimize read steps — one read pass at most.`;
  } else {
    modeHint = `\nMode: CAREFUL (default). Prioritize correctness. Steps should include reading and understanding code before making changes. Verify impact on dependents.`;
  }

  try {
    const provider = await getProvider(config.provider || "gemini");
    const text = await provider.generate({
      model: config.plannerModel,
      prompt: `Analyze this coding task and create a brief step-by-step plan (3-6 steps max).
Each step should be one clear, actionable action.

Task: ${userInput}${contextHint}${modeHint}

Respond with ONLY a JSON array of objects with "step" and "action" keys.
Example: [{"step": "Read package.json to understand dependencies", "action": "explore"}, {"step": "Create new helper function", "action": "implement"}]

Actions can be: "explore", "analyze", "implement", "test", "respond"`,
    });

    // Robust extraction: strip markdown blocks, then find the outermost [...]
    const cleanText = text.replace(/```(?:json)?\n?([\s\S]*?)```/g, "$1").trim();
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/); // greedy match for outermost brackets
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]);
      if (Array.isArray(plan) && plan.length > 0) return plan;
    }
  } catch (err) {
    log.warn(`Planner fallback: ${err.message}`);
  }

  // Fallback plans based on mode
  if (isRefactor) {
    return [
      { step: "Read source file to map structure", action: "explore" },
      { step: "Create new modular files", action: "implement" },
      { step: "Remove extracted code from source", action: "implement" },
      { step: "Update imports and verify", action: "test" },
    ];
  }

  return [
    { step: "Understand the request", action: "analyze" },
    { step: "Explore relevant code", action: "explore" },
    { step: "Implement solution", action: "implement" },
  ];
}
