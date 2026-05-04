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
  "ls", "dir", "pwd", "whoami", "which", "type", "echo", "cat", "head", "tail",
  "wc", "file", "stat", "date", "uname", "env", "printenv", "cls",
  "tree", "find", "du", "df",
  "git", "npm", "yarn", "pnpm", "pip", "pip3",
  "jest", "vitest", "pytest", "tsc", "eslint", "prettier", "ruff",
  "rg", "grep", "fgrep", "egrep", "diff", "sort", "uniq",
  "powershell", "pwsh", "Get-Content", "Select-String", "Get-ChildItem", "Get-Item", "Test-Path", "mkdir", "New-Item"
]);

const FORCE_CONFIRM_COMMANDS = new Set([
  "node", "python", "python3", "ruby", "perl", "php", "deno", "bun",
  "npx", "flutter", "react-native", "expo", "nodemon", "pm2", "serve"
]);

// Sub-commands that turn an AUTO command into a write operation → force confirm.
const UNSAFE_SUBCMDS = {
  git: new Set(["push", "reset", "rebase", "clean", "checkout", "restore", "rm", "commit", "merge", "revert"]),
  npm: new Set(["publish", "unpublish", "run", "start", "build", "dev"]),
  yarn: new Set(["publish", "unpublish", "run", "start", "build", "dev"]),
  pnpm: new Set(["publish", "unpublish", "run", "start", "build", "dev"]),
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

  // Any pipe, redirect, or chain operator → require user confirmation.
  // Even seemingly-safe filters (`ls | grep`) can mask intent or be combined
  // with destructive ops downstream — being strict here is the right tradeoff.
  const hasPipeOrChain = /[|;&]/.test(cmd);
  if (hasPipeOrChain || />\s*\/dev\//.test(cmd)) {
    return { verdict: "confirm", reason: "Contains potentially unsafe pipe/redirect/chain" };
  }

  const tokens = cmd.trim().split(/\s+/);
  const first = tokens[0];
  const second = tokens[1];

  if (FORCE_CONFIRM_COMMANDS.has(first)) {
    return { verdict: "confirm", reason: `${first} can execute arbitrary code` };
  }

  if (!AUTO_ALLOWED.has(first)) {
    return { verdict: "confirm", reason: "Not in auto-allow list" };
  }

  // Secondary check: AUTO command with unsafe subcommand → confirm.
  if (UNSAFE_SUBCMDS[first]?.has(second)) {
    // Special case: allow "run test" and "run lint" even though "run" is usually unsafe
    if (["npm", "yarn", "pnpm"].includes(first) && second === "run") {
      const third = tokens[2];
      if (["test", "lint", "format:check"].includes(third)) {
        return { verdict: "auto", reason: `${first} run ${third} is safe` };
      }
    }
    return { verdict: "confirm", reason: `${first} ${second} may modify state or start a process` };
  }

  // install / add / remove / uninstall are also stateful for package managers
  if (["npm", "yarn", "pnpm", "pip", "pip3"].includes(first)) {
    if (["install", "i", "add", "remove", "rm", "uninstall", "update", "upgrade"].includes(second)) {
      return { verdict: "confirm", reason: `${first} ${second} modifies dependencies` };
    }
  }

  return { verdict: "auto", reason: "Safe read-only" };
}
