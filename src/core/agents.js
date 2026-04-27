import pLimit from "p-limit";
import { tools as builtinTools, toolDeclarations as builtinDecls } from "../tools/tools.js";
import { loadMemory, saveMemory, compressMemoryIfNeeded } from "./memory.js";
import { loadIndex, search, buildContext } from "../rag/semantic.js";
import { createPlan } from "./planner.js";
import { loadConfig, getSystemPrompt } from "../config/config.js";
import { retry, isReadOnlyTool } from "../utils/utils.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { getProvider } from "../llm/providers/index.js";
import { toJsonSchemaTools } from "../llm/providers/base.js";
import { TOOL_CONCURRENCY } from "../config/constants.js";
import { getMcpTools } from "../mcp/client.js";

/**
 * Main agent loop — provider-agnostic, streaming, parallel tool execution,
 * retry logic, MCP tool merge.
 * 
 * @param {string} userInput - The user's input prompt.
 * @param {Object} [callbacks] - Optional event callbacks for the UI.
 * @param {Function} [callbacks.onPlan] - Called when a plan is generated: `(plan: Array<{step: string, action: string}>) => void`.
 * @param {Function} [callbacks.onThinking] - Called when the agent is "thinking" (waiting for LLM response).
 * @param {Function} [callbacks.onText] - Called with chunks of text as they stream from the LLM: `(text: string) => void`.
 * @param {Function} [callbacks.onToolCall] - Called when a tool is invoked: `(name: string, args: Object) => void`.
 * @param {Function} [callbacks.onToolResult] - Called when a tool finishes: `(name: string, summary: string) => void`.
 * @param {Function} [callbacks.onRetry] - Called when an API request fails and is retried.
 * @param {Function} [callbacks.onDone] - Called when the agent loop naturally finishes.
 * @param {Function} [callbacks.onError] - Called if a fatal error occurs in the loop: `(err: Error) => void`.
 * @param {AbortSignal} [callbacks.signal] - AbortSignal to cancel the agent loop early.
 * @returns {Promise<string>} The complete final response string from the agent.
 */
export async function runAgent(userInput, callbacks = {}) {
  const {
    onPlan = () => {},
    onThinking = () => {},
    onText = (t) => process.stdout.write(t),
    onToolCall = () => {},
    onToolResult = () => {},
    onRetry = () => {},
    onDone = () => {},
    onError = () => {},
    signal,
  } = callbacks;

  const config = loadConfig();
  const providerName = config.provider || "gemini";
  const provider = getProvider(providerName);
  const agentModel = config.model;
  const systemInstruction = getSystemPrompt();

  // ─── Merge built-in tools with any connected MCP tools ──────────────
  const mcpTools = await getMcpTools(); // { decls: [...], handler(name, args) }
  const allDecls = [...builtinDecls, ...mcpTools.decls];
  const toolSchemas = toJsonSchemaTools(allDecls);
  const dispatchTool = async (name, args) => {
    if (builtinTools[name]) return builtinTools[name](args);
    if (mcpTools.has(name)) return mcpTools.handler(name, args);
    return `Error: Unknown tool ${name}`;
  };

  // ─── STEP 1: Plan (auto-skipped for short requests) ─────────────────
  const memory = loadMemory();
  onThinking();
  let plan;
  try {
    plan = await createPlan(userInput);
    onPlan(plan);
  } catch {
    plan = [{ step: "Process request", action: "respond" }];
    onPlan(plan);
  }

  // ─── STEP 2: RAG context ────────────────────────────────────────────
  let context = "";
  try {
    const index = loadIndex();
    if (index.length > 0) {
      const results = await search(userInput, index, { topK: 3, threshold: 0.7 });
      context = buildContext(results);
    }
  } catch {
    /* RAG optional */
  }

  const userMessage = context
    ? `User request:\n${userInput}\n\nRelevant code context:\n${context}\n\nFollow existing code patterns strictly.`
    : userInput;

  memory.push({ role: "user", blocks: [{ type: "text", text: userMessage }] });

  // ─── STEP 3: Agent loop ─────────────────────────────────────────────
  let isDone = false;
  let finalResponse = "";
  let iterations = 0;
  const maxIterations = config.maxIterations || 25;
  const toolLimit = pLimit(TOOL_CONCURRENCY);

  while (!isDone && iterations < maxIterations) {
    if (signal?.aborted) {
      onText("\n⚠️ Cancelled by user.\n");
      break;
    }
    iterations++;
    onThinking();

    let streamedText = "";
    const toolCalls = [];
    let usage = null;

    try {
      const stream = await retry(
        () =>
          provider.stream({
            model: agentModel,
            systemInstruction,
            messages: memory,
            tools: toolSchemas,
          }),
        { onRetry }
      );

      for await (const evt of stream) {
        if (evt.type === "text") {
          streamedText += evt.text;
          onText(evt.text);
        } else if (evt.type === "tool_call") {
          toolCalls.push(evt);
        } else if (evt.type === "usage") {
          usage = evt;
        }
      }
    } catch (err) {
      onError(err);
      break;
    }

    // Track tokens — use API-reported counts when available.
    if (usage) {
      globalTracker.trackGeneration(agentModel, {
        promptTokenCount: usage.inputTokens,
        candidatesTokenCount: usage.outputTokens,
      });
    } else {
      globalTracker.trackGeneration(agentModel, "", streamedText);
    }

    // Build assistant message from this turn's output.
    const blocks = [];
    if (streamedText) blocks.push({ type: "text", text: streamedText });
    for (const tc of toolCalls) {
      blocks.push({ type: "tool_call", id: tc.id, name: tc.name, args: tc.args });
    }
    if (blocks.length === 0) break;

    memory.push({ role: "assistant", blocks });
    finalResponse += streamedText;

    if (toolCalls.length === 0) {
      isDone = true;
      continue;
    }

    // ─── EXECUTE TOOL CALLS ─────────────────────────────────────────
    const readCalls = toolCalls.filter((tc) => isReadOnlyTool(tc.name));
    const writeCalls = toolCalls.filter((tc) => !isReadOnlyTool(tc.name));
    const resultBlocks = [];

    // Read-only: parallel (capped concurrency)
    if (readCalls.length > 0) {
      const results = await Promise.all(
        readCalls.map((tc) =>
          toolLimit(async () => {
            onToolCall(tc.name, tc.args);
            const result = await dispatchTool(tc.name, tc.args);
            onToolResult(tc.name, typeof result === "string" ? result.slice(0, 100) : "done");
            return { type: "tool_result", id: tc.id, name: tc.name, output: String(result) };
          })
        )
      );
      resultBlocks.push(...results);
    }

    // Writes: sequential
    for (const tc of writeCalls) {
      onToolCall(tc.name, tc.args);
      const result = await dispatchTool(tc.name, tc.args);
      onToolResult(tc.name, typeof result === "string" ? result.slice(0, 100) : "done");
      resultBlocks.push({ type: "tool_result", id: tc.id, name: tc.name, output: String(result) });
    }

    memory.push({ role: "tool", blocks: resultBlocks });

    // P0: Adaptive context window management — compress if turn gets too long.
    const nextMemory = await compressMemoryIfNeeded(memory);
    if (nextMemory !== memory) {
      // If compressed, replace the local memory object.
      memory.length = 0;
      memory.push(...nextMemory);
    }
  }

  if (iterations >= maxIterations) {
    const msg = "\n⚠️ Max iterations reached. Stopping agent loop.\n";
    onText(msg);
    finalResponse += msg;
  }

  onDone();

  await saveMemory(memory, signal);
  globalTracker.saveToFile(agentModel);

  return finalResponse;
}
