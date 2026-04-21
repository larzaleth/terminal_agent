import { useState, useReducer, useEffect, useCallback } from "react";
import { Box, useApp, useInput } from "ink";
import { h } from "./h.js";

import { Header } from "./components/Header.js";
import { Sidebar } from "./components/Sidebar.js";
import { MessageList } from "./components/MessageList.js";
import { InputBox } from "./components/InputBox.js";
import { DiffPrompt } from "./components/DiffPrompt.js";
import { ConfirmPrompt } from "./components/ConfirmPrompt.js";
import { Footer } from "./components/Footer.js";

import { setPrompter, resetPrompter } from "./prompter.js";
import { runAgent } from "../core/agents.js";
import { handleSlashCommand } from "../commands/slash.js";
import { loadConfig } from "../config/config.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { listMcpStatus, shutdownMcp } from "../mcp/client.js";

// ─── State reducer ──────────────────────────────────────────────────
const initialState = {
  finalized: [],                // finished messages (scrollback-friendly via <Static>)
  pending: null,                // in-progress assistant message
  status: "idle",               // idle | thinking | tool_running | awaiting_edit | awaiting_confirm
  statusMessage: "",
  currentTool: null,
  recentTools: [],              // last ~5 tools {name, status}
  focusedToolIdx: -1,           // which tool in pending message has keyboard focus
  prompt: null,                 // { kind: "edit"|"confirm", ...props, resolve }
  cost: 0,
  tokens: 0,
  cacheHitRate: 0,
  iteration: 0,
  maxIterations: 25,
};

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function reducer(state, action) {
  switch (action.type) {
    case "add_user_message":
      return { ...state, finalized: [...state.finalized, { id: genId(), role: "user", blocks: [{ type: "text", text: action.text }] }] };

    case "start_turn":
      return { ...state, pending: { id: genId(), role: "assistant", blocks: [] }, status: "thinking", iteration: 0 };

    case "add_plan":
      if (!state.pending) return state;
      return {
        ...state,
        pending: {
          ...state.pending,
          blocks: [...state.pending.blocks, { type: "plan", steps: action.steps }],
        },
      };

    case "append_text": {
      if (!state.pending) return state;
      const blocks = [...state.pending.blocks];
      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") {
        blocks[blocks.length - 1] = { ...last, text: last.text + action.text };
      } else {
        blocks.push({ type: "text", text: action.text });
      }
      return { ...state, pending: { ...state.pending, blocks }, status: "thinking" };
    }

    case "tool_start": {
      if (!state.pending) return state;
      const block = {
        type: "tool_call",
        id: action.id,
        tool: action.name,
        args: action.args,
        status: "running",
        result: null,
        expanded: false,
      };
      return {
        ...state,
        pending: { ...state.pending, blocks: [...state.pending.blocks, block] },
        status: "tool_running",
        currentTool: action.name,
      };
    }

    case "tool_end": {
      if (!state.pending) return state;
      const blocks = state.pending.blocks.map((b) =>
        b.type === "tool_call" && b.id === action.id
          ? { ...b, status: action.error ? "error" : "done", result: action.result }
          : b
      );
      const recent = [...state.recentTools, { name: action.name, status: action.error ? "error" : "done" }].slice(-5);
      return { ...state, pending: { ...state.pending, blocks }, currentTool: null, recentTools: recent };
    }

    case "toggle_tool_expanded": {
      if (!state.pending) return state;
      const blocks = state.pending.blocks.map((b) =>
        b.type === "tool_call" && b.id === action.id ? { ...b, expanded: !b.expanded } : b
      );
      return { ...state, pending: { ...state.pending, blocks } };
    }

    case "focus_tool": {
      if (!state.pending) return state;
      const toolBlocks = state.pending.blocks.filter((b) => b.type === "tool_call");
      if (toolBlocks.length === 0) return state;
      let next = state.focusedToolIdx + action.delta;
      if (next < 0) next = toolBlocks.length - 1;
      if (next >= toolBlocks.length) next = 0;
      return { ...state, focusedToolIdx: next };
    }

    case "commit_turn":
      return state.pending
        ? { ...state, finalized: [...state.finalized, state.pending], pending: null, status: "idle", focusedToolIdx: -1, currentTool: null }
        : { ...state, status: "idle" };

    case "set_prompt":
      return { ...state, prompt: action.prompt, status: action.prompt.kind === "edit" ? "awaiting_edit" : "awaiting_confirm" };

    case "clear_prompt":
      return { ...state, prompt: null, status: state.pending ? "thinking" : "idle" };

    case "set_cost":
      return { ...state, cost: action.cost, tokens: action.tokens, cacheHitRate: action.cacheHitRate };

    case "set_iteration":
      return { ...state, iteration: action.iteration, maxIterations: action.maxIterations };

    case "add_system":
      return {
        ...state,
        finalized: [
          ...state.finalized,
          { id: genId(), role: "system", blocks: [{ type: "text", text: action.text }] },
        ],
      };

    case "clear_history":
      return { ...initialState, cost: state.cost, tokens: state.tokens, cacheHitRate: state.cacheHitRate };

    default:
      return state;
  }
}

// ─── Main App ───────────────────────────────────────────────────────
export function App() {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [config, setConfig] = useState(() => loadConfig());
  const [mcpServers, setMcpServers] = useState([]);

  // Register prompter overrides so tools route through our UI.
  useEffect(() => {
    setPrompter({
      confirm: ({ message, reason }) =>
        new Promise((resolve) => {
          dispatch({ type: "set_prompt", prompt: { kind: "confirm", message, reason, resolve } });
        }),
      editApproval: ({ filePath, oldContent, newContent }) =>
        new Promise((resolve) => {
          dispatch({
            type: "set_prompt",
            prompt: { kind: "edit", filePath, oldContent, newContent, resolve },
          });
        }),
    });
    return () => resetPrompter();
  }, []);

  // Periodically pull latest cost snapshot (runAgent updates globalTracker).
  useEffect(() => {
    const iv = setInterval(() => {
      const stats = globalTracker.getStats(config.model);
      dispatch({
        type: "set_cost",
        cost: stats.cost.total,
        tokens: stats.usage.generation.inputTokens + stats.usage.generation.outputTokens,
        cacheHitRate: stats.cacheHitRate,
      });
    }, 700);
    return () => clearInterval(iv);
  }, [config.model]);

  // Global keyboard shortcuts — only active when not prompting or typing.
  useInput((input, key) => {
    if (state.prompt) return;
    if (key.ctrl && input === "l") dispatch({ type: "clear_history" });
    if (key.upArrow) dispatch({ type: "focus_tool", delta: -1 });
    if (key.downArrow) dispatch({ type: "focus_tool", delta: 1 });
    if (input === " " || key.return) {
      if (state.focusedToolIdx >= 0 && state.pending) {
        const toolBlocks = state.pending.blocks.filter((b) => b.type === "tool_call");
        const target = toolBlocks[state.focusedToolIdx];
        if (target) dispatch({ type: "toggle_tool_expanded", id: target.id });
      }
    }
  });

  // ─── Submit handler ───────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (text) => {
      // Exit commands
      if (text === "exit" || text === "quit") {
        await shutdownMcp().catch(() => {});
        exit();
        return;
      }

      // Slash commands — reuse existing handler; output already logs to console
      // which Ink preserves via its static region. We still add the user line
      // to history for clarity.
      if (text.startsWith("/")) {
        dispatch({ type: "add_user_message", text });
        try {
          const handled = await handleSlashCommand(text);
          if (!handled) {
            dispatch({ type: "add_system", text: `Unknown command: ${text}` });
          } else {
            dispatch({ type: "add_system", text: `✓ ${text}` });
          }
          // Refresh config + MCP after any slash command that might change them
          setConfig(loadConfig());
          setMcpServers(listMcpStatus());
        } catch (err) {
          dispatch({ type: "add_system", text: `Error: ${err.message}` });
        }
        return;
      }

      // Normal agent run
      dispatch({ type: "add_user_message", text });
      dispatch({ type: "start_turn" });

      const toolIdMap = new Map();
      let iter = 0;

      try {
        await runAgent(text, {
          onPlan: (plan) => dispatch({ type: "add_plan", steps: plan }),
          onThinking: () => {
            iter += 1;
            dispatch({ type: "set_iteration", iteration: iter, maxIterations: config.maxIterations || 25 });
          },
          onText: (t) => dispatch({ type: "append_text", text: t }),
          onToolCall: (name, args) => {
            const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            toolIdMap.set(name + JSON.stringify(args), id);
            dispatch({ type: "tool_start", id, name, args });
          },
          onToolResult: (name, preview) => {
            // Match back to the tool id (naive by name — sufficient in practice)
            const key = [...toolIdMap.entries()].reverse().find(([k]) => k.startsWith(name + "{") || k.startsWith(name));
            if (!key) return;
            const id = key[1];
            dispatch({ type: "tool_end", id, name, result: preview, error: false });
          },
          onDone: () => {},
          onError: (err) => dispatch({ type: "append_text", text: `\n❌ ${err.message}\n` }),
        });
      } catch (err) {
        dispatch({ type: "append_text", text: `\n❌ ${err.message}\n` });
      } finally {
        dispatch({ type: "commit_turn" });
      }
    },
    [config, exit]
  );

  // ─── Prompt resolution ────────────────────────────────────────────
  const handlePromptResolve = useCallback(
    (result) => {
      const { prompt } = state;
      if (!prompt) return;
      prompt.resolve(prompt.kind === "edit" ? result : result);
      dispatch({ type: "clear_prompt" });
    },
    [state]
  );

  // ─── Render ───────────────────────────────────────────────────────
  return h(
    Box,
    { flexDirection: "column" },
    h(Header, {
      provider: config.provider || "gemini",
      model: config.model,
      cost: state.cost,
      iteration: state.iteration,
      maxIterations: state.maxIterations,
    }),

    // Body: messages on the left, sidebar on the right.
    h(
      Box,
      { flexDirection: "row" },
      h(
        Box,
        { flexDirection: "column", flexGrow: 1, paddingRight: 1 },
        h(MessageList, {
          finalized: state.finalized,
          pending: state.pending,
          focusedToolId:
            state.focusedToolIdx >= 0 && state.pending
              ? state.pending.blocks.filter((b) => b.type === "tool_call")[state.focusedToolIdx]?.id
              : null,
        })
      ),
      h(Sidebar, {
        provider: config.provider || "gemini",
        model: config.model,
        status: state.status,
        currentTool: state.currentTool,
        recentTools: state.recentTools,
        cost: state.cost,
        tokens: state.tokens,
        cacheHitRate: state.cacheHitRate,
        mcpServers,
      })
    ),

    // Prompt area — replaces input box while active
    state.prompt
      ? state.prompt.kind === "edit"
        ? h(DiffPrompt, {
            filePath: state.prompt.filePath,
            oldContent: state.prompt.oldContent,
            newContent: state.prompt.newContent,
            onResolve: handlePromptResolve,
          })
        : h(ConfirmPrompt, {
            message: state.prompt.message,
            reason: state.prompt.reason,
            onResolve: handlePromptResolve,
          })
      : h(InputBox, { disabled: state.status !== "idle", onSubmit: handleSubmit }),

    h(Footer, { status: state.status, message: state.statusMessage })
  );
}
