import { ai } from "./llm.js";
import { tools, toolDeclarations } from "./tools.js";
import { loadMemory, saveMemory } from "./memory.js";
import { loadIndex, search, buildContext } from "./semantic.js";
import { createPlan } from "./planner.js";
import { config, getSystemPrompt } from "./config.js";
import { retry, isReadOnlyTool } from "./utils.js";
import { globalTracker } from "./cost-tracker.js";

const agentModel = config.model;

/**
 * Main agent loop with streaming, parallel tool execution, and retry logic.
 *
 * @param {string} userInput - The user's request
 * @param {object} callbacks - Event callbacks for UI integration
 * @param {function} callbacks.onPlan - Called with plan array
 * @param {function} callbacks.onThinking - Called when LLM is processing
 * @param {function} callbacks.onText - Called with streamed text chunks
 * @param {function} callbacks.onToolCall - Called with (toolName, args)
 * @param {function} callbacks.onToolResult - Called with (toolName, resultPreview)
 * @param {function} callbacks.onDone - Called when agent finishes
 * @param {function} callbacks.onError - Called with error
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

  let memory = loadMemory();
  const systemInstruction = getSystemPrompt();

  // ─── STEP 1: LLM-POWERED PLAN ───
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

  memory.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  // ─── STEP 4: AGENT LOOP (STREAMING) ───
  let isDone = false;
  let finalResponse = "";
  let iterations = 0;
  const maxIterations = config.maxIterations || 25;

  while (!isDone && iterations < maxIterations) {
    iterations++;
    onThinking();

    let streamedText = "";
    const functionCalls = [];

    try {
      // 🔥 STREAMING: generateContentStream for real-time output
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

      // Process stream chunks in real-time
      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            streamedText += part.text;
            onText(part.text);
          }
          if (part.functionCall) {
            functionCalls.push(part);
          }
        }
      }
    } catch (err) {
      onError(err);
      break;
    }

    // Track generation cost
    const inputText = memory.map(m => 
      m.parts?.map(p => p.text || "").join("") || ""
    ).join(" ");
    globalTracker.trackGeneration(agentModel, inputText, streamedText);

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

      // Separate read-only (parallel) vs write (sequential)
      const readCalls = functionCalls.filter((fc) => isReadOnlyTool(fc.functionCall.name));
      const writeCalls = functionCalls.filter((fc) => !isReadOnlyTool(fc.functionCall.name));

      // ⚡ Execute read-only tools in PARALLEL
      if (readCalls.length > 0) {
        const readResults = await Promise.all(
          readCalls.map(async (fc) => {
            const { name, args } = fc.functionCall;
            onToolCall(name, args);
            const handler = tools[name];
            if (!handler) return { functionResponse: { name, response: { result: `Error: Unknown tool ${name}` } } };
            const result = await handler(args);
            onToolResult(name, typeof result === "string" ? result.slice(0, 100) : "done");
            return { functionResponse: { name, response: { result } } };
          })
        );
        responses.push(...readResults);
      }

      // 🔒 Execute write tools SEQUENTIALLY
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

  // Save memory (async - with LLM summarization if needed)
  await saveMemory(memory);

  // Save cost report to history
  globalTracker.saveToFile(agentModel);

  return finalResponse;
}