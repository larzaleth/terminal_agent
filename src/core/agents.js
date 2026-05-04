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
import { TOOL_CONCURRENCY, MAX_ITERATIONS_DEFAULT } from "../config/constants.js";
import { getMcpTools } from "../mcp/client.js";
import { log } from "../utils/logger.js";

const LOOP_WINDOW = 10;        // only look at the last N tool calls for dupe detection
const LOOP_DUPE_LIMIT = 5;    // same signature ≥ this many times within window → stop
const FILE_READ_WARN = 6;      // warn agent after N reads of the same file
const FILE_READ_HARD_LIMIT = 15; // block further reads of that file (but don't stop agent)
const WRITE_TOOLS = new Set(["write_file", "edit_file", "replace_lines", "batch_edit"]);

/**
 * @typedef {Object} AgentRunOptions
 * @property {import("./agents/types.js").AgentDefinition} [definition]
 *   Optional specialized-agent definition. When set, runAgent filters tools,
 *   overrides the system prompt, and uses the definition's model/provider.
 *   Leaving this blank runs the classic "default" agent with all tools.
 */

/**
 * Build the runtime tool set for a given agent definition.
 * Returns the filtered handlers map, JSON-schema tool list, and dispatcher.
 */
async function buildToolset(definition) {
  const mcp = await getMcpTools();

  let handlers = { ...builtinTools };
  let decls = [...builtinDecls];

  if (definition?.allowedTools && definition.allowedTools.length > 0) {
    const allowed = new Set(definition.allowedTools);
    handlers = Object.fromEntries(
      Object.entries(handlers).filter(([name]) => allowed.has(name))
    );
    decls = decls.filter((d) => allowed.has(d.name));
  }

  // MCP tools are always available unless definition explicitly excludes them.
  const includeMcp = definition?.disableMcp !== true;
  const allDecls = includeMcp ? [...decls, ...mcp.decls] : decls;

  const dispatch = async (name, args) => {
    if (handlers[name]) return handlers[name](args);
    if (includeMcp && mcp.has(name)) return mcp.handler(name, args);
    return `Error: Tool '${name}' is not available for this agent.`;
  };

  return {
    handlers,
    decls: allDecls,
    dispatch,
    schemas: toJsonSchemaTools(allDecls),
  };
}

/**
 * Resolve effective runtime config for this agent run.
 * Definition overrides > user config > built-in defaults.
 */
function resolveRuntime(definition) {
  const cfg = loadConfig();
  return {
    provider: definition?.provider || cfg.provider || "gemini",
    model: definition?.model || cfg.model,
    maxIterations: definition?.maxIterations || cfg.maxIterations || MAX_ITERATIONS_DEFAULT,
    systemInstruction: definition?.systemPromptOverride || getSystemPrompt(),
  };
}

/**
 * Main agent loop — provider-agnostic, streaming, parallel tool execution,
 * retry logic, MCP tool merge. Accepts an optional `definition` to run a
 * specialized sub-agent (read-only analyzer, security-scanner, …) with a
 * restricted toolset and custom system prompt.
 *
 * @param {string} userInput
 * @param {Object & AgentRunOptions} [callbacks]
 * @returns {Promise<string>} Final response text.
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
    definition,
  } = callbacks;

  const runtime = resolveRuntime(definition);
  const provider = getProvider(runtime.provider);
  const toolset = await buildToolset(definition);
  const toolLimit = pLimit(TOOL_CONCURRENCY);

  // ─── STEP 1: Plan (auto-skipped for short requests or agents that opt out) ─
  const memory = loadMemory();
  onThinking();

  let plan;
  if (definition?.skipPlanner) {
    plan = [{ step: "Process request", action: "respond" }];
  } else {
    try {
      plan = await createPlan(userInput, memory);
    } catch {
      plan = [{ step: "Process request", action: "respond" }];
    }
  }
  onPlan(plan);

  // ─── STEP 2: RAG context (skippable for read-only auditors) ───────────────
  let context = "";
  if (!definition?.skipRag) {
    try {
      const index = loadIndex();
      if (index.length > 0) {
        const results = await search(userInput, index, { topK: 3, threshold: 0.7 });
        context = buildContext(results);
      }
    } catch {
      /* RAG is optional */
    }
  }

  const userMessage = context
    ? `User request:\n${userInput}\n\nRelevant code context:\n${context}\n\nFollow existing code patterns strictly.`
    : userInput;

  memory.push({ role: "user", blocks: [{ type: "text", text: userMessage }] });

  // ─── STEP 3: Agent loop ───────────────────────────────────────────────────
  let isDone = false;
  let finalResponse = "";
  let iterations = 0;
  const recentSignatures = [];     // sliding window of recent tool call signatures
  let consecutiveFailures = 0;
  const fileReadCounts = new Map();  // track how many times each file has been read

  while (!isDone && iterations < runtime.maxIterations) {
    if (signal?.aborted) {
      onText("\n⚠️ Cancelled by user.\n");
      break;
    }
    iterations++;
    onThinking();

    let streamedText = "";
    let thisTurnThoughts = "";
    const toolCalls = [];
    let usage = null;

    try {
      const stream = await retry(
        () =>
          provider.stream({
            model: runtime.model,
            systemInstruction: runtime.systemInstruction,
            messages: memory,
            tools: toolset.schemas,
          }),
        { onRetry }
      );

      for await (const evt of stream) {
        if (evt.type === "text") {
          streamedText += evt.text;
          onText(evt.text);
        } else if (evt.type === "thought") {
          thisTurnThoughts += evt.text;
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
      globalTracker.trackGeneration(runtime.model, {
        promptTokenCount: usage.inputTokens,
        candidatesTokenCount: usage.outputTokens,
      });
    } else {
      globalTracker.trackGeneration(runtime.model, "", streamedText);
    }

    // Build assistant message from this turn's output.
    const blocks = [];
    if (thisTurnThoughts) blocks.push({ type: "thought", text: thisTurnThoughts });
    if (streamedText) blocks.push({ type: "text", text: streamedText });
    for (const tc of toolCalls) {
      blocks.push({
        type: "tool_call",
        id: tc.id,
        name: tc.name,
        args: tc.args,
        ...(tc.thoughtSignature && { thoughtSignature: tc.thoughtSignature }),
      });
    }
    if (blocks.length === 0) break;

    memory.push({ role: "assistant", blocks });
    finalResponse += streamedText;

    if (toolCalls.length === 0) {
      isDone = true;
      continue;
    }

    // ─── LOOP DETECTION (sliding window, self-resetting) ─────────────────
    // Add current tool call signatures to the window, then check if any
    // single signature has appeared LOOP_DUPE_LIMIT+ times in the window.
    for (const tc of toolCalls) {
      recentSignatures.push(tc.name + ":" + JSON.stringify(tc.args));
    }
    while (recentSignatures.length > LOOP_WINDOW) recentSignatures.shift();

    const counts = new Map();
    for (const sig of recentSignatures) counts.set(sig, (counts.get(sig) || 0) + 1);
    const mostRepeated = Math.max(0, ...counts.values());

    // ─── SAME-FILE/DIR READ DETECTION ─────────────────────────────────────
    // Catches the pattern where agent reads the same file with different
    // line ranges, or lists the same directory repeatedly.
    for (const tc of toolCalls) {
      // Reset read counters when agent makes successful writes (= progress)
      if (WRITE_TOOLS.has(tc.name)) {
        fileReadCounts.clear();
        continue;
      }
      const trackedPath = (tc.name === "read_file" && tc.args?.path)
        || (tc.name === "list_dir" && tc.args?.dir);
      if (trackedPath) {
        const p = String(trackedPath);
        const c = (fileReadCounts.get(p) || 0) + 1;
        fileReadCounts.set(p, c);
        if (c === FILE_READ_WARN) {
          const action = tc.name === "read_file" ? "read" : "listed";
          memory.push({
            role: "tool",
            blocks: [{
              type: "tool_result",
              id: "file_read_warn",
              name: "system",
              output: `⚠️ EFFICIENCY WARNING: You have ${action} '${p}' ${c} times. STOP. Use the information you already have. Remember: 'write_file' auto-creates parent directories, so you do NOT need to check if directories exist. Just write files directly.`,
            }],
          });
        }
      }
    }
    // Check if any file has been read too many times → inject warning but DON'T stop agent
    const maxFileReads = Math.max(0, ...fileReadCounts.values());
    if (maxFileReads >= FILE_READ_HARD_LIMIT) {
      // Find which file(s) hit the limit
      const overreadFiles = [...fileReadCounts.entries()].filter(([, c]) => c >= FILE_READ_HARD_LIMIT).map(([f]) => f);
      memory.push({
        role: "tool",
        blocks: [{
          type: "tool_result",
          id: "file_read_block",
          name: "system",
          output: `🛑 READ LIMIT: You have read these files/dirs too many times: ${overreadFiles.join(", ")}. You MUST stop reading them and work with what you have. Use write_file and replace_lines to make progress. Do NOT read these paths again.`,
        }],
      });
    }

    let wasForcedToStop = false;
    if (mostRepeated >= LOOP_DUPE_LIMIT || consecutiveFailures >= 3) {
      const reason = mostRepeated >= LOOP_DUPE_LIMIT ? "Loop detected" : "Persistent failures detected";
      const msg = `\n⚠️ ${reason} — stopping to provide a conclusion.\n`;
      onText(msg);
      finalResponse += msg;

      memory.push({
        role: "tool",
        blocks: [{
          type: "tool_result",
          id: "loop_break",
          name: "system",
          output: `CRITICAL: ${reason.toUpperCase()}. STOP all actions now. Provide your final [RESULT] summary explaining why you stopped and what the user needs to do next.`,
        }],
      });

      toolCalls.length = 0;
      wasForcedToStop = true;
    }

    // ─── EXECUTE TOOL CALLS ──────────────────────────────────────────────
    if (toolCalls.length === 0) {
      if (!wasForcedToStop) isDone = true;
      continue;
    }

    const readCalls = toolCalls.filter((tc) => isReadOnlyTool(tc.name));
    const writeCalls = toolCalls.filter((tc) => !isReadOnlyTool(tc.name));
    const resultBlocks = [];

    // Read-only: parallel (capped concurrency)
    if (readCalls.length > 0) {
      const results = await Promise.all(
        readCalls.map((tc) =>
          toolLimit(async () => {
            onToolCall(tc.name, tc.args);
            const result = await toolset.dispatch(tc.name, tc.args);
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
      const result = await toolset.dispatch(tc.name, tc.args);
      onToolResult(tc.name, typeof result === "string" ? result.slice(0, 100) : "done");
      resultBlocks.push({ type: "tool_result", id: tc.id, name: tc.name, output: String(result) });
    }

    memory.push({ role: "tool", blocks: resultBlocks });

    // ─── FAILURE DETECTION ──────────────────────────────────────────────
    let turnHasSuccess = false;
    for (const b of resultBlocks) {
      const out = String(b.output);
      // Only count as failure if it's a structural tool error (starts with emoji)
      const isToolError = out.startsWith("❌") || out.startsWith("🛑") || out.startsWith("🚫");
      if (!isToolError) {
        turnHasSuccess = true;
      }
    }
    consecutiveFailures = turnHasSuccess ? 0 : consecutiveFailures + 1;

    if (consecutiveFailures >= 3) {
      const msg = "\n⚠️ Persistent failures detected — stopping to provide a conclusion.\n";
      onText(msg);
      finalResponse += msg;

      memory.push({
        role: "tool",
        blocks: [{
          type: "tool_result",
          id: "failure_break",
          name: "system",
          output: "PERSISTENT FAILURES: Multiple tools have failed consecutively. STOP all actions now. Provide your final [RESULT] summary explaining the root cause and manual fix instructions.",
        }],
      });
      // One more loop iteration will produce the text summary with no tool calls.
    }

    // Adaptive context window: compress once per turn. saveMemory will NOT
    // compress again — see src/core/memory.js.
    const nextMemory = await compressMemoryIfNeeded(memory, signal);
    if (nextMemory !== memory) {
      memory.length = 0;
      memory.push(...nextMemory);
    }
  }

  if (iterations >= runtime.maxIterations) {
    const msg = "\n⚠️ Max iterations reached. Stopping agent loop.\n";
    onText(msg);
    finalResponse += msg;
  }

  onDone();

  // saveMemory is given the already-compressed memory to persist;
  // it does NOT re-compress.
  await saveMemory(memory, signal).catch((err) => log.error("saveMemory:", err));
  return finalResponse;
}
