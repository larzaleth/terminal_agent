import { ai } from "./llm.js";
import { config } from "./config.js";

export async function createPlan(userInput) {
  try {
    const response = await ai.models.generateContent({
      model: config.plannerModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Analyze this coding task and create a brief step-by-step plan (3-6 steps max).
Each step should be one clear, actionable action.

Task: ${userInput}

Respond with ONLY a JSON array of objects with "step" and "action" keys.
Example: [{"step": "Read package.json to understand dependencies", "action": "explore"}, {"step": "Create new helper function", "action": "implement"}]

Actions can be: "explore", "analyze", "implement", "test", "respond"`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
      },
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extract JSON array from response (handles markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]);
      if (Array.isArray(plan) && plan.length > 0) {
        return plan;
      }
    }
  } catch (err) {
    console.log(`⚠️ Planner fallback: ${err.message}`);
  }

  // Fallback plan if LLM fails
  return [
    { step: "Understand the request", action: "analyze" },
    { step: "Explore relevant code", action: "explore" },
    { step: "Implement solution", action: "implement" },
  ];
}