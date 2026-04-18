import pLimit from "p-limit";
import { ai } from "../llm/llm.js";
import { tools, toolDeclarations } from "../tools/tools.js";
import { loadMemory, saveMemory } from "./memory.js";
import { loadIndex, search, buildContext } from "../rag/semantic.js";
import { createPlan } from "./planner.js";
import { config, getSystemPrompt } from "../config/config.js";
import { retry, isReadOnlyTool } from "../utils/utils.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { TOOL_CONCURRENCY } from "../config/constants.js";

/**
 * Main agent loop with streaming, parallel tool execution, and retry logic.
 *
 * @param {string} userInput - The user's request
 * @param {object} callbacks - Event callbacks for UI integration
 */
export async function runAgent(userInput, callbacks = {}) {
  const {
    onPlan = () => {},
    onThinking = () => {},
    onText = (t) => process.stdout.write(t),
    onToolCall = () => {},
    onToolResult = () => {},
    onDone = () => {},
    onError = () => {},
  } = callbacks;

  const agentModel = config.model;
  let memory = loadMemory();
  const systemInstruction = getSystemPrompt();

  // ─── STEP 1: LLM-POWERED PLAN (auto-skipped for short requests) ───
  onThinking();
  let plan;
  try {
    plan = await createPlan(userInput);
    onPlan(plan);
  } catch {
    plan = [{ step: "Process request", action: "respond" }];
    onPlan(plan);
  }

  // ─── STEP 2: RAG CONTEXT SEARCH ───
  let context = "";
  try {
    const index = loadIndex();
    if (index.length > 0) {
      const results = await search(userInput, index, { topK: 3, threshold: 0.7 });
      context = buildContext(results);
    }
  } catch {
    // RAG is optional, continue without context
  }

  // ─── STEP 3: INJECT USER MESSAGE WITH CONTEXT ───
  const userMessage = context
    ? `User request:\n${userInput}\n\nRelevant code context:\n${context}\n\nFollow existing code patterns strictly.`
    : userInput;

  memory.push({ role: "user", parts: [{ text: userMessage }] });

  // ─── STEP 4: AGENT LOOP (STREAMING) ───
  let isDone = false;
  let finalResponse = "";
  let iterations = 0;
  const maxIterations = config.maxIterations || 25;
  const toolLimit = pLimit(TOOL_CONCURRENCY);

  while (!isDone && iterations < maxIterations) {
    iterations++;
    onThinking();

    let streamedText = "";
    const functionCalls = [];
    let usageMetadata = null;

    try {
      const stream = await retry(() =>
        ai.models.generateContentStream({
          model: agentModel,
          contents: memory,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: toolDeclarations }],
          },
        })
      );

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            streamedText += part.text;
            onText(part.text);
          }
          if (part.functionCall) functionCalls.push(part);
        }
        // Gemini emits usageMetadata on the final chunk — overwrite so the
        // last non-null wins.
        if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
      }
    } catch (err) {
      onError(err);
      break;
    }

    // Use exact token counts from the API when available — char-based
    // estimation is only a fallback.
    if (usageMetadata) {
      globalTracker.trackGeneration(agentModel, usageMetadata);
    } else {
      globalTracker.trackGeneration(agentModel, "", streamedText);
    }

    // Build model message for memory
    const modelParts = [];
    if (streamedText) modelParts.push({ text: streamedText });
    modelParts.push(...functionCalls);

    if (modelParts.length === 0) break;
    memory.push({ role: "model", parts: modelParts });
    finalResponse += streamedText;

    // ─── EXECUTE TOOL CALLS ───
    if (functionCalls.length > 0) {
      const responses = [];

      const readCalls = functionCalls.filter((fc) => isReadOnlyTool(fc.functionCall.name));
      const writeCalls = functionCalls.filter((fc) => !isReadOnlyTool(fc.functionCall.name));

      // ⚡ Read-only tools in parallel — concurrency-capped to avoid 429s.
      if (readCalls.length > 0) {
        const readResults = await Promise.all(
          readCalls.map((fc) => toolLimit(async () => {
            const { name, args } = fc.functionCall;
            onToolCall(name, args);
            const handler = tools[name];
            if (!handler) {
              return { functionResponse: { name, response: { result: `Error: Unknown tool ${name}` } } };
            }
            const result = await handler(args);
            onToolResult(name, typeof result === "string" ? result.slice(0, 100) : "done");
            return { functionResponse: { name, response: { result } } };
          }))
        );
        responses.push(...readResults);
      }

      // 🔒 Write tools sequentially.
      for (const fc of writeCalls) {
        const { name, args } = fc.functionCall;
        onToolCall(name, args);
        const handler = tools[name];
        if (!handler) {
          responses.push({ functionResponse: { name, response: { result: `Error: Unknown tool ${name}` } } });
          continue;
        }
        const result = await handler(args);
        onToolResult(name, typeof result === "string" ? result.slice(0, 100) : "done");
        responses.push({ functionResponse: { name, response: { result } } });
      }

      memory.push({ role: "user", parts: responses });
    } else {
      isDone = true;
    }
  }

  if (iterations >= maxIterations) {
    const msg = "\n⚠️ Max iterations reached. Stopping agent loop.\n";
    onText(msg);
    finalResponse += msg;
  }

  onDone();

  await saveMemory(memory);
  globalTracker.saveToFile(agentModel);

  return finalResponse;
}
