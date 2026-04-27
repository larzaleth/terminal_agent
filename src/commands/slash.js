// Per-command slash handlers.
//
// Each command lives in its own module under `./handlers/*.js`, exporting
// an async function that receives `(args, config)` and returns `true` when
// handled (or `false`/throws for unknown input).
//
// To add a new command: drop a `handlers/<name>.js` with an `execute` fn
// and a `name` export, then register it here.

import { helpCommand } from "./handlers/help.js";
import { clearCommand } from "./handlers/clear.js";
import { indexCommand } from "./handlers/index-cmd.js";
import { configCommand } from "./handlers/config.js";
import { cacheCommand } from "./handlers/cache.js";
import { costCommand } from "./handlers/cost.js";
import { modelCommand } from "./handlers/model.js";
import { providerCommand } from "./handlers/provider.js";
import { saveCommand } from "./handlers/save.js";
import { mcpCommand } from "./handlers/mcp.js";
import { copyCommand } from "./handlers/copy.js";
import { undoCommand } from "./handlers/undo.js";
import { sessionCommand } from "./handlers/session.js";

const HANDLERS = {
  "/help": helpCommand,
  "/clear": clearCommand,
  "/new": clearCommand,
  "/reset": clearCommand,
  "/index": indexCommand,
  "/config": configCommand,
  "/cache": cacheCommand,
  "/cost": costCommand,
  "/model": modelCommand,
  "/switch": modelCommand,
  "/provider": providerCommand,
  "/save": saveCommand,
  "/list": () => sessionCommand(["list"]),
  "/mcp": mcpCommand,
  "/copy": copyCommand,
  "/undo": undoCommand,
  "/session": sessionCommand,
  "/resume": (args) => sessionCommand(["resume", ...args]),
  "/load": (args) => sessionCommand(["resume", ...args]),
};

export const SLASH_COMMANDS = Object.keys(HANDLERS);

export async function handleSlashCommand(input) {
  const [cmd, ...args] = input.trim().split(" ");
  const handler = HANDLERS[cmd];
  if (!handler) return false;
  await handler(args);
  return true;
}
