import { useState, useReducer, useEffect, useCallback, useMemo, useRef } from "react";

import { Box, useApp, useInput } from "ink";
import { h } from "./h.js";

import { Header } from "./components/Header.js";
import { Sidebar } from "./components/Sidebar.js";
import { MessageList } from "./components/MessageList.js";
import { InputBox } from "./components/InputBox.js";
import { DiffPrompt } from "./components/DiffPrompt.js";
import { ConfirmPrompt } from "./components/ConfirmPrompt.js";
import { Footer } from "./components/Footer.js";
import { useTerminalSize } from "./useTerminalSize.js";

import { setPrompter, resetPrompter } from "./prompter.js";
import { setToolStreamCallback, clearToolStreamCallback } from "./toolStream.js";
import { runAgent } from "../core/agents.js";
import { handleSlashCommand } from "../commands/slash.js";
import { loadConfig } from "../config/config.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { listMcpStatus, shutdownMcp } from "../mcp/client.js";

// ─── State ───────────────────────────────────────────────────────────
const initialState = {
  finalized: [],
  pending: null,
  status: "idle",
  statusMessage: "",
  currentTool: null,
  recentTools: [],
  focusedToolIdx: -1,
  prompt: null,
  cost: 0,
  tokens: 0,
  cacheHitRate: 0,
  iteration: 0,
  maxIterations: 25,
  turnStartedAt: null,    // ms timestamp — drives elapsed counter
  scrollOffset: 0,        // 0 = newest visible; increments to show older
};

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function reducer(state, action) {
  switch (action.type) {
    case "add_user_message":
      return {
        ...state,
        finalized: [
          ...state.finalized,
          { id: genId(), role: "user", blocks: [{ type: "text", text: action.text }] },
        ],
      };
    case "start_turn":
      return {
        ...state,
        pending: { id: genId(), role: "assistant", blocks: [] },
        status: "thinking",
        statusMessage: "",
        iteration: 0,
        turnStartedAt: Date.now(),
        scrollOffset: 0, // snap to bottom on new turn
      };
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
    case "tool_stream_chunk": {
      // Append live stdout/stderr chunk to the most recent running tool of that name.
      if (!state.pending) return state;
      let found = false;
      const blocks = [...state.pending.blocks];
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.type === "tool_call" && b.tool === action.name && b.status === "running") {
          const prevLive = b.liveOutput || "";
          // Keep only last ~2000 chars of live output; older still visible when tool finishes
          const combined = prevLive + action.chunk;
          const trimmed = combined.length > 2000 ? combined.slice(-2000) : combined;
          blocks[i] = { ...b, liveOutput: trimmed, expanded: true };
          found = true;
          break;
        }
      }
      if (!found) return state;
      return { ...state, pending: { ...state.pending, blocks } };
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
        ? {
            ...state,
            finalized: [...state.finalized, state.pending],
            pending: null,
            status: "idle",
            statusMessage: "",
            focusedToolIdx: -1,
            currentTool: null,
            turnStartedAt: null,
          }
        : { ...state, status: "idle", statusMessage: "", turnStartedAt: null };
    case "set_status_message":
      return { ...state, statusMessage: action.message };
    case "scroll": {
      const total = state.finalized.length + (state.pending ? 1 : 0);
      let next = state.scrollOffset + action.delta;
      if (next < 0) next = 0;
      if (next > Math.max(0, total - 1)) next = Math.max(0, total - 1);
      return { ...state, scrollOffset: next };
    }
    case "scroll_reset":
      return { ...state, scrollOffset: 0 };
    case "set_prompt":
      return {
        ...state,
        prompt: action.prompt,
        status: action.prompt.kind === "edit" ? "awaiting_edit" : "awaiting_confirm",
      };
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

// ─── Main App ────────────────────────────────────────────────────────
export function App() {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [config, setConfig] = useState(() => loadConfig());
  const [mcpServers, setMcpServers] = useState([]);
  const [abortController, setAbortController] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const { rows, columns } = useTerminalSize();

  // Ref-backed text buffer: coalesce streaming tokens so React only re-renders
  // every ~60ms instead of on every chunk (fixes TUI freeze on long turns).
  const textBufferRef = useRef("");
  const textFlushTimerRef = useRef(null);
  const flushTextBuffer = useCallback(() => {
    if (textFlushTimerRef.current) {
      clearTimeout(textFlushTimerRef.current);
      textFlushTimerRef.current = null;
    }
    const buf = textBufferRef.current;
    if (buf) {
      textBufferRef.current = "";
      dispatch({ type: "append_text", text: buf });
    }
  }, []);
  const scheduleTextFlush = useCallback(() => {
    if (textFlushTimerRef.current) return;
    textFlushTimerRef.current = setTimeout(() => {
      textFlushTimerRef.current = null;
      flushTextBuffer();
    }, 60);
  }, [flushTextBuffer]);

  // ── Layout math ────────────────────────────────────────────────────
  const sidebarWidth = columns >= 110 ? 32 : columns >= 90 ? 28 : 0;
  const showSidebar = sidebarWidth > 0;
  const chromeRows = state.prompt?.kind === "edit" ? 20 : 7;
  const chatMaxRows = Math.max(6, rows - chromeRows);

  // ── Prompter registration ──────────────────────────────────────────
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

  // ── Tool live-stream wiring: forward stdout/stderr chunks to the reducer ──
  useEffect(() => {
    setToolStreamCallback((name, chunk) => {
      dispatch({ type: "tool_stream_chunk", name, chunk });
    });
    return () => clearToolStreamCallback();
  }, []);

  // ── Live cost polling ──────────────────────────────────────────────
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

  // ── Elapsed-time counter for long-running turns ────────────────────
  useEffect(() => {
    if (!state.turnStartedAt) {
      setElapsedMs(0);
      return;
    }
    const iv = setInterval(() => setElapsedMs(Date.now() - state.turnStartedAt), 200);
    return () => clearInterval(iv);
  }, [state.turnStartedAt]);

  // ── Global keyboard shortcuts ──────────────────────────────────────
  useInput(async (input, key) => {
    // Ctrl+C always exits
    if (key.ctrl && input === "c") {
      await shutdownMcp().catch(() => {});
      exit();
      return;
    }

    // Esc: cancel the active turn (or dismiss prompt which handles itself)
    if (key.escape && !state.prompt) {
      if (abortController) {
        abortController.abort();
        dispatch({ type: "set_status_message", message: "Cancelling — finishing current step…" });
      }
      return;
    }

    if (state.prompt) return;

    // Scrolling through chat history — always available
    if (key.pageUp) {
      dispatch({ type: "scroll", delta: 3 });
      return;
    }
    if (key.pageDown) {
      dispatch({ type: "scroll", delta: -3 });
      return;
    }
    if (input === "G" && !key.ctrl) {
      // vim-ish: G jumps to bottom
      dispatch({ type: "scroll_reset" });
      return;
    }

    if (key.ctrl && input === "l") dispatch({ type: "clear_history" });

    // Tool focus/expand — only when not scrolled up (avoids overloading arrows)
    if (state.scrollOffset === 0) {
      if (key.upArrow) dispatch({ type: "focus_tool", delta: -1 });
      if (key.downArrow) dispatch({ type: "focus_tool", delta: 1 });
      if ((input === " " || key.return) && state.focusedToolIdx >= 0 && state.pending) {
        const toolBlocks = state.pending.blocks.filter((b) => b.type === "tool_call");
        const target = toolBlocks[state.focusedToolIdx];
        if (target) dispatch({ type: "toggle_tool_expanded", id: target.id });
      }
    } else {
      // While scrolled up, arrows also scroll
      if (key.upArrow) dispatch({ type: "scroll", delta: 1 });
      if (key.downArrow) dispatch({ type: "scroll", delta: -1 });
    }
  });

  // ── Submit handler ─────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (text) => {
      if (text === "exit" || text === "quit") {
        await shutdownMcp().catch(() => {});
        exit();
        return;
      }

      if (text.startsWith("/")) {
        dispatch({ type: "add_user_message", text });
        try {
          const handled = await handleSlashCommand(text);
          dispatch({ type: "add_system", text: handled ? `✓ handled: ${text}` : `Unknown command: ${text}` });
          setConfig(loadConfig());
          setMcpServers(listMcpStatus());
        } catch (err) {
          dispatch({ type: "add_system", text: `Error: ${err.message}` });
        }
        return;
      }

      dispatch({ type: "add_user_message", text });
      dispatch({ type: "start_turn" });

      const controller = new AbortController();
      setAbortController(controller);

      const toolIdMap = new Map();
      let iter = 0;

      try {
        await runAgent(text, {
          signal: controller.signal,
          onPlan: (plan) => dispatch({ type: "add_plan", steps: plan }),
          onThinking: () => {
            iter += 1;
            dispatch({ type: "set_iteration", iteration: iter, maxIterations: config.maxIterations || 25 });
            dispatch({ type: "set_status_message", message: "" });
          },
          onText: (t) => {
            textBufferRef.current += t;
            scheduleTextFlush();
          },
          onToolCall: (name, args) => {
            const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            toolIdMap.set(name + JSON.stringify(args), id);
            dispatch({ type: "tool_start", id, name, args });
          },
          onToolResult: (name, preview) => {
            const entry = [...toolIdMap.entries()].reverse().find(([k]) => k.startsWith(name));
            if (!entry) return;
            dispatch({ type: "tool_end", id: entry[1], name, result: preview, error: false });
          },
          onRetry: ({ attempt, maxRetries, delayMs, reason }) => {
            dispatch({
              type: "set_status_message",
              message: `Retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s — ${reason}`,
            });
          },
          onDone: () => {},
          onError: (err) => {
            flushTextBuffer();
            dispatch({ type: "append_text", text: `\n❌ ${err.message}\n` });
          },
        });
      } catch (err) {
        flushTextBuffer();
        dispatch({ type: "append_text", text: `\n❌ ${err.message}\n` });
      } finally {
        flushTextBuffer();
        setAbortController(null);
        dispatch({ type: "commit_turn" });
      }
    },
    [config, exit, abortController, scheduleTextFlush, flushTextBuffer]
  );

  const handlePromptResolve = useCallback(
    (result) => {
      const { prompt } = state;
      if (!prompt) return;
      prompt.resolve(result);
      dispatch({ type: "clear_prompt" });
    },
    [state]
  );

  const focusedToolId = useMemo(() => {
    if (state.focusedToolIdx < 0 || !state.pending) return null;
    const toolBlocks = state.pending.blocks.filter((b) => b.type === "tool_call");
    return toolBlocks[state.focusedToolIdx]?.id ?? null;
  }, [state.focusedToolIdx, state.pending]);

  // ── Render ─────────────────────────────────────────────────────────
  return h(
    Box,
    { flexDirection: "column", height: rows, width: columns },

    // Header
    h(Header, {
      provider: config.provider || "gemini",
      model: config.model,
      cost: state.cost,
      iteration: state.iteration,
      maxIterations: state.maxIterations,
    }),

    // Body — chat pane + optional sidebar
    h(
      Box,
      { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
      h(
        Box,
        {
          flexDirection: "column",
          flexGrow: 1,
          paddingX: 1,
          borderStyle: "round",
          borderColor: "gray",
          overflow: "hidden",
        },
        h(MessageList, {
          finalized: state.finalized,
          pending: state.pending,
          focusedToolId,
          maxRows: chatMaxRows,
          scrollOffset: state.scrollOffset,
        })
      ),
      showSidebar
        ? h(
            Box,
            { width: sidebarWidth, flexShrink: 0 },
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
          )
        : null
    ),

    // Input / prompt region
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

    h(Footer, {
      status: state.status,
      message: state.statusMessage,
      elapsedMs,
      scrollOffset: state.scrollOffset,
      canCancel: !!abortController,
    })
  );
}
