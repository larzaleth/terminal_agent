/**
 * Agent definitions — declarative configs consumed by `runAgent`.
 *
 * @typedef {Object} AgentDefinition
 * @property {string}    name                  Unique registry key, e.g. "analyzer".
 * @property {string}    description           One-line human-friendly summary.
 * @property {string[]}  [allowedTools]        Whitelist of tool names. Empty/undefined = all built-ins.
 * @property {boolean}   [disableMcp]          Hide MCP tools from this agent (default: false).
 * @property {string}    [systemPromptOverride] Replaces the default system prompt for this agent.
 * @property {string}    [model]               Override LLM model id.
 * @property {string}    [provider]            Override provider ("gemini" | "openai" | "anthropic").
 * @property {number}    [maxIterations]       Cap on agent-loop turns.
 * @property {boolean}   [skipPlanner]         Skip the `createPlan` step (faster, less tokens).
 * @property {boolean}   [skipRag]             Skip RAG context injection.
 * @property {(input: string) => string} [inputTransform]  Optional preprocessor for user input.
 * @property {(output: string) => string} [outputTransform] Optional postprocessor for final response.
 */

// This file is documentation-only. No runtime imports / exports.
export {};
