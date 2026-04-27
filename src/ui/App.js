import { useState, useReducer, useEffect, useCallback, useMemo, useRef } from "react";

import { Box, useApp, useInput, Static, Text } from "ink";
import { h } from "./h.js";

import { Header } from "./components/Header.js";
import { MessageList } from "./components/MessageList.js";
import { MessageItem } from "./components/MessageItem.js";
import { InputBox } from "./components/InputBox.js";
import { DiffPrompt } from "./components/DiffPrompt.js";
import { ConfirmPrompt } from "./components/ConfirmPrompt.js";
import { Footer } from "./components/Footer.js";
import { useTerminalSize } from "./useTerminalSize.js";
import { log } from "../utils/logger.js";

import { setPrompter, resetPrompter } from "./prompter.js";
import { setToolStreamCallback, clearToolStreamCallback } from "./toolStream.js";
import { setMouseCallback, clearMouseCallback } from "./mouse.js";
import { findToolAt, extractTextInRange } from "./clickRegistry.js";
import {
  writeClipboard,
  extractLastAssistant,
  extractFocusedTool,
  extractCurrentTurn,
  extractAll,
} from "./clipboard.js";
import { reducer, initialState } from "./reducer.js";
import { runAgent } from "../core/agents.js";
import { handleSlashCommand } from "../commands/slash.js";
import { loadConfig } from "../config/config.js";
import { globalTracker } from "../llm/cost-tracker.js";
import { listMcpStatus, shutdownMcp } from "../mcp/client.js";

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
    }, 150);
  }, [flushTextBuffer]);

  // Truncate logic removed to allow full flow.
  const chromeRows = state.prompt ? (state.prompt.kind === "edit" ? 15 : 8) : 5;
  const chatMaxRows = Math.max(5, rows - chromeRows);

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

  // Coalesce tool stream chunks to prevent TUI flickering on rapid output
  const toolBufferRef = useRef({ name: "", chunk: "" });
  const toolFlushTimerRef = useRef(null);

  const flushToolBuffer = useCallback(() => {
    if (toolFlushTimerRef.current) {
      clearTimeout(toolFlushTimerRef.current);
      toolFlushTimerRef.current = null;
    }
    const { name, chunk } = toolBufferRef.current;
    if (chunk) {
      toolBufferRef.current = { name: "", chunk: "" };
      dispatch({ type: "tool_stream_chunk", name, chunk });
    }
  }, []);

  const scheduleToolFlush = useCallback(() => {
    if (toolFlushTimerRef.current) return;
    toolFlushTimerRef.current = setTimeout(() => {
      toolFlushTimerRef.current = null;
      flushToolBuffer();
    }, 150);
  }, [flushToolBuffer]);

  // ── Tool live-stream wiring: forward stdout/stderr chunks to the reducer ──
  useEffect(() => {
    setToolStreamCallback((name, chunk) => {
      toolBufferRef.current.name = name;
      toolBufferRef.current.chunk += chunk;
      scheduleToolFlush();
    });
    return () => {
      clearToolStreamCallback();
      flushToolBuffer();
    };
  }, [scheduleToolFlush, flushToolBuffer]);

  // ── Keep Process Alive ─────────────────────────────────────────────
  // Ink sometimes exits if the event loop is momentarily empty (e.g., when
  // TextInput unmounts before async agent loops start). This prevents that.
  useEffect(() => {
    const keepAlive = setInterval(() => {}, 100000);
    return () => clearInterval(keepAlive);
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
    }, 2000);
    return () => clearInterval(iv);
  }, [config.model]);

  // ── Elapsed-time counter for long-running turns ────────────────────
  useEffect(() => {
    if (!state.turnStartedAt) {
      setElapsedMs(0);
      return;
    }
    const iv = setInterval(() => setElapsedMs(Date.now() - state.turnStartedAt), 1000);
    return () => clearInterval(iv);
  }, [state.turnStartedAt]);

  // ── Toast auto-dismiss (3s) ────────────────────────────────────────
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "clear_toast" }), 3000);
    return () => clearTimeout(t);
  }, [state.toast]);

  // ── Global keyboard shortcuts ──────────────────────────────────────
  const lastCtrlC = useRef(0);
  useInput((input, key) => {
    // Ctrl+C: Double-tap to force kill, single tap to shutdown gracefully
    if (key.ctrl && input === "c") {
      const now = Date.now();
      if (now - lastCtrlC.current < 500) {
        process.exit(0); // Emergency exit
      }
      lastCtrlC.current = now;
      shutdownMcp().catch(() => {});
      exit();
      return;
    }

    // Ctrl+R: Force Reset UI to Idle (Emergency escape if stuck)
    if (key.ctrl && input === "r") {
      if (abortController) abortController.abort();
      dispatch({ type: "commit_turn" });
      dispatch({ type: "set_toast", text: "🔄 UI Force Reset", color: "yellow" });
      return;
    }

    // When a prompt is active, let the prompt component handle ALL input
    if (state.prompt) return;

    // Esc: cancel the active turn
    if (key.escape) {
      if (abortController) {
        abortController.abort();
        dispatch({ type: "set_status_message", message: "Cancelling..." });
      }
      return;
    }

    if (key.ctrl && input === "l") {
      dispatch({ type: "clear_history" });
      return;
    }

    // Tool focus/expand logic
    // ONLY intercept Enter if we are actually focusing a tool
    const isToolFocused = state.focusedToolIdx >= 0 && state.pending;
    
    if (key.rightArrow) dispatch({ type: "focus_tool", delta: 1 });
    if (key.leftArrow) dispatch({ type: "focus_tool", delta: -1 });
    
    if ((input === " " || key.return) && isToolFocused) {
      const toolBlocks = state.pending.blocks.filter((b) => b.type === "tool_call");
      const target = toolBlocks[state.focusedToolIdx];
      if (target) dispatch({ type: "toggle_tool_expanded", id: target.id });
    }
  });

  // (scroll reset removed — no longer using scrollOffset state)

  // ── Submit handler ─────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (text) => {
      if (text === "exit" || text === "quit") {
        shutdownMcp().catch(() => {});
        exit();
        return;
      }

      if (text.startsWith("/")) {
        // /stats and /copy are UI-only commands — handled inline since their
        // output lives in the TUI state, not stdout (which is muted).
        if (text === "/stats") {
          dispatch({ type: "add_user_message", text });
          dispatch({ type: "toggle_stats" });
          dispatch({ type: "add_system", text: "📊 Per-turn stats view toggled." });
          return;
        }
        if (text.startsWith("/copy")) {
          dispatch({ type: "add_user_message", text });
          const mode = (text.split(" ")[1] || "last").trim();
          let payload = "";
          if (mode === "last") payload = extractLastAssistant(state);
          else if (mode === "tool") payload = extractFocusedTool(state);
          else if (mode === "turn") payload = extractCurrentTurn(state);
          else if (mode === "all") payload = extractAll(state);
          else {
            dispatch({ type: "add_system", text: `Usage: /copy [last|tool|turn|all]` });
            return;
          }
          if (!payload || !payload.trim()) {
            dispatch({ type: "add_system", text: `📋 Nothing to copy (${mode}).` });
            return;
          }
          const ok = writeClipboard(payload);
          dispatch({
            type: "set_toast",
            text: ok
              ? `📋 Copied ${payload.length} chars (${mode})`
              : "⚠️ Clipboard unsupported",
            color: ok ? "green" : "yellow",
          });
          return;
        }
        dispatch({ type: "add_user_message", text });
        // Capture slash-command stdout so ink's muted console doesn't swallow
        // it. We temporarily replace console.log with a buffer collector,
        // strip ANSI colour codes (ink can't render them inline via Text),
        // then inject the full output into the chat as a system message.
        const buffer = [];
        const prevLog = console.log;
        console.log = (...args) => {
          buffer.push(
            args
              .map((a) => (typeof a === "string" ? a : String(a)))
              .join(" ")
          );
        };
        try {
          const handled = await handleSlashCommand(text);
          // eslint-disable-next-line no-control-regex
          const ansiRe = /\x1b\[[0-9;]*m/g;
          const output = buffer.join("\n").replace(ansiRe, "").trim();
          if (output) {
            dispatch({ type: "add_system", text: output });
          } else if (handled) {
            dispatch({ type: "add_system", text: `✓ ${text}` });
          } else {
            dispatch({ type: "add_system", text: `Unknown command: ${text}` });
          }
          setConfig(loadConfig());
          setMcpServers(listMcpStatus());
        } catch (err) {
          dispatch({ type: "add_system", text: `Error: ${err.message}` });
        } finally {
          console.log = prevLog;
        }
        return;
      }

      dispatch({ type: "add_user_message", text });
      const currentConfig = loadConfig(true);
      setConfig(currentConfig);
      dispatch({ type: "start_turn" });

      // Snapshot metrics so we can compute deltas at turn end.
      const turnStartStats = globalTracker.getStats(config.model);
      const turnStartTokens =
        turnStartStats.usage.generation.inputTokens + turnStartStats.usage.generation.outputTokens;
      const turnStartCost = turnStartStats.cost.total;
      const turnStartMs = Date.now();

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
            log.error(err);
            flushTextBuffer();
            dispatch({ type: "append_text", text: `\n❌ ${err.message}\n` });
          },
        });
      } catch (err) {
        log.error(err);
        flushTextBuffer();
        dispatch({ type: "append_text", text: `\n❌ ${err.message}\n` });
      } finally {
        flushTextBuffer();
        setAbortController(null);
        // Record per-turn delta for the sidebar sparkline.
        const endStats = globalTracker.getStats(config.model);
        const endTokens =
          endStats.usage.generation.inputTokens + endStats.usage.generation.outputTokens;
        const turnEntry = {
          tokens: Math.max(0, endTokens - turnStartTokens),
          cost: Math.max(0, endStats.cost.total - turnStartCost),
          durationMs: Date.now() - turnStartMs,
        };
        dispatch({ type: "commit_turn", turnEntry });
        globalTracker.saveTurn(config.model, turnEntry);
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
    { flexDirection: "column", width: columns, height: rows },

    // 1. Static History — Permanently printed to terminal scrollback.
    // This prevents lag and allows natural terminal scrolling.
    h(
      Static,
      { items: state.finalized },
      (msg) => h(MessageItem, { key: msg.id, msg: msg, focusedToolId: null })
    ),

    // 2. Interactive Area — Current turn + Prompt + Footer
    h(
      Box,
      { flexDirection: "column" },
      state.pending && h(MessageItem, { msg: state.pending, focusedToolId, isInteractive: true }),

      // End-of-response marker — only when idle
      state.status === "idle" && !state.pending && state.finalized.length > 0 &&
      state.finalized[state.finalized.length - 1].role === "assistant"
        ? h(
            Box,
            { paddingX: 1, marginBottom: 1 },
            h(Text, { color: "gray", dimColor: true },
              `--- end of response${state.finalized[state.finalized.length - 1].durationMs ? ` (${(state.finalized[state.finalized.length - 1].durationMs / 1000).toFixed(1)}s)` : ""} ---`
            )
          )
        : null,

      // Input or Prompt
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

      // Bottom bar — model info + status
      h(Footer, {
        status: state.status,
        message: state.statusMessage,
        elapsedMs,
        canCancel: !!abortController,
        toast: state.toast,
        model: config.model,
        cost: state.cost,
      })
    )
  );
}
