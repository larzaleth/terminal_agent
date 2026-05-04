/**
 * Default agent — preserves the classic full-capability behavior.
 *
 * When no `--agent` flag is passed, CLI uses this definition, which is
 * semantically equivalent to calling `runAgent(input)` without any
 * `definition` (the runtime falls back to built-in tools + default
 * system prompt). We still register it so `/agent list` shows it.
 */

export const defaultAgent = {
  name: "default",
  description: "Full-capability coding agent — all built-in tools + MCP, default senior prompt.",
  // No overrides — runAgent behaves exactly as before.
};
