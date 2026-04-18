// Command classification for the run_command tool.
// Returns one of: "blocked" | "auto" | "confirm"
//
// - blocked:  refuse execution entirely (dangerous patterns).
// - auto:     run without user confirmation (common safe read-only commands).
// - confirm:  keep current behavior — prompt user before running.

// Patterns that indicate destructive/dangerous intent. Any match → refused.
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\/(?!\w)/,          // rm -rf /   (root)
  /\brm\s+-rf\s+~\s*$/,              // rm -rf ~
  /\brm\s+-rf\s+\*\s*$/,             // rm -rf *
  /:\s*\(\s*\)\s*\{.*:\|:.*\}/,      // fork bomb :(){ :|:& };:
  /\bmkfs(\.\w+)?\b/,                // mkfs.*
  /\bdd\s+if=.*\s+of=\/dev\/(sd|nvme|hd)/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\b(curl|wget)\b.+\|\s*(sudo\s+)?(sh|bash|zsh)\b/, // curl ... | sh
  /\bchown\s+-R\s+.*\s+\/(?!\w)/,    // chown -R ... /
  /\bchmod\s+-R\s+777\s+\/(?!\w)/,
  />\s*\/dev\/(sd|nvme|hd)\w*/,      // > /dev/sdX
];

// Commands (by first token) that are read-only / safe — run without asking.
// NOTE: we also require no obvious redirection/pipe to a shell interpreter.
const AUTO_ALLOWED = new Set([
  "ls", "pwd", "whoami", "which", "type", "echo", "cat", "head", "tail",
  "wc", "file", "stat", "date", "uname", "env", "printenv",
  "tree", "find", "du", "df",
  "git", "npm", "yarn", "pnpm", "node", "python", "python3", "pip", "pip3",
  "jest", "vitest", "pytest", "tsc", "eslint", "prettier", "ruff",
  "rg", "grep", "fgrep", "egrep", "diff", "sort", "uniq",
]);

// Sub-commands that turn an AUTO command into a write operation → force confirm.
const UNSAFE_SUBCMDS = {
  git: new Set(["push", "reset", "rebase", "clean", "checkout", "restore", "rm", "commit", "merge", "revert"]),
  npm: new Set(["publish", "unpublish"]),
  yarn: new Set(["publish", "unpublish"]),
};

export function classifyCommand(cmd) {
  if (typeof cmd !== "string" || !cmd.trim()) {
    return { verdict: "confirm", reason: "empty" };
  }

  // Check blocklist first — this wins over everything.
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(cmd)) {
      return { verdict: "blocked", reason: "Matches a dangerous pattern" };
    }
  }

  // Redirection or piping — play it safe, always confirm.
  if (/[|;&]|&&|\|\|/.test(cmd) || />\s*\/dev\//.test(cmd)) {
    return { verdict: "confirm", reason: "Contains pipe/redirect/chain" };
  }

  const tokens = cmd.trim().split(/\s+/);
  const first = tokens[0];
  const second = tokens[1];

  if (!AUTO_ALLOWED.has(first)) {
    return { verdict: "confirm", reason: "Not in auto-allow list" };
  }

  // Secondary check: AUTO command with unsafe subcommand → confirm.
  if (UNSAFE_SUBCMDS[first]?.has(second)) {
    return { verdict: "confirm", reason: `${first} ${second} may modify state` };
  }

  // install / add / remove / uninstall are also stateful for package managers
  if (["npm", "yarn", "pnpm", "pip", "pip3"].includes(first)) {
    if (["install", "i", "add", "remove", "rm", "uninstall", "update", "upgrade"].includes(second)) {
      return { verdict: "confirm", reason: `${first} ${second} modifies dependencies` };
    }
  }

  return { verdict: "auto", reason: "Safe read-only" };
}
