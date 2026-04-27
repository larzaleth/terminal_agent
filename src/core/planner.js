import { getProvider } from "../llm/providers/index.js";
import { loadConfig } from "../config/config.js";
import { wordCount } from "../utils/utils.js";
import { PLANNER_MIN_WORDS } from "../config/constants.js";

/**
 * Build a brief plan for a user request. Short/simple requests skip the
 * planner entirely to save both latency and tokens.
 */
export async function createPlan(userInput) {
  if (wordCount(userInput) < PLANNER_MIN_WORDS) {
    return [{ step: "Process request", action: "respond" }];
  }

  const config = loadConfig();

  try {
    const provider = getProvider(config.provider || "gemini");
    const text = await provider.generate({
      model: config.plannerModel,
      prompt: `Analyze this coding task and create a brief step-by-step plan (3-6 steps max).
Each step should be one clear, actionable action.

Task: ${userInput}

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
    console.log(`⚠️ Planner fallback: ${err.message}`);
  }

  return [
    { step: "Understand the request", action: "analyze" },
    { step: "Explore relevant code", action: "explore" },
    { step: "Implement solution", action: "implement" },
  ];
}
