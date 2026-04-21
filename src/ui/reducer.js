// UI state reducer — extracted from App.js so state logic can be tested
// and iterated on without touching the (growing) component tree.

export const initialState = {
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
  turnHistory: [],        // [{tokens, cost, durationMs, ts}, ...] last ~20 turns
  statsExpanded: false,   // /stats toggles verbose sidebar
  selection: null,        // {startY, endY} chat-pane-relative (drag-to-select)
  toast: null,            // {text, color, ts} ephemeral notification
};

export function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function reducer(state, action) {
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
      const recent = [
        ...state.recentTools,
        { name: action.name, status: action.error ? "error" : "done" },
      ].slice(-5);
      return {
        ...state,
        pending: { ...state.pending, blocks },
        currentTool: null,
        recentTools: recent,
      };
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
    case "commit_turn": {
      if (!state.pending) {
        return { ...state, status: "idle", statusMessage: "", turnStartedAt: null };
      }
      // Snapshot per-turn metrics for the sidebar sparkline.
      const turnEntry = action.turnEntry
        ? { ...action.turnEntry, ts: Date.now() }
        : null;
      const turnHistory = turnEntry
        ? [...state.turnHistory, turnEntry].slice(-20)
        : state.turnHistory;
      return {
        ...state,
        finalized: [...state.finalized, state.pending],
        pending: null,
        status: "idle",
        statusMessage: "",
        focusedToolIdx: -1,
        currentTool: null,
        turnStartedAt: null,
        turnHistory,
      };
    }
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
      return {
        ...state,
        cost: action.cost,
        tokens: action.tokens,
        cacheHitRate: action.cacheHitRate,
      };
    case "set_iteration":
      return {
        ...state,
        iteration: action.iteration,
        maxIterations: action.maxIterations,
      };
    case "add_system":
      return {
        ...state,
        finalized: [
          ...state.finalized,
          { id: genId(), role: "system", blocks: [{ type: "text", text: action.text }] },
        ],
      };
    case "toggle_stats":
      return { ...state, statsExpanded: !state.statsExpanded };
    case "set_selection":
      return { ...state, selection: action.selection };
    case "clear_selection":
      return { ...state, selection: null };
    case "set_toast":
      return { ...state, toast: { text: action.text, color: action.color || "cyan", ts: Date.now() } };
    case "clear_toast":
      return { ...state, toast: null };
    case "clear_history":
      return {
        ...initialState,
        cost: state.cost,
        tokens: state.tokens,
        cacheHitRate: state.cacheHitRate,
        turnHistory: state.turnHistory,
        statsExpanded: state.statsExpanded,
      };
    default:
      return state;
  }
}
