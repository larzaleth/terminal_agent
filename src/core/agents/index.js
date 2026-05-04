/**
 * Agent registry bootstrap.
 *
 * Import this module once at app startup to populate the registry with
 * all built-in agents. Third-party agents can call `registerAgent()`
 * themselves after importing this module.
 */

import { registerAgent, hasAgent } from "./registry.js";
import { defaultAgent } from "./definitions/default.js";
import { analyzerAgent } from "./definitions/analyzer.js";

// Idempotent — safe to import from multiple entry points (CLI, slash, tests).
if (!hasAgent(defaultAgent.name)) registerAgent(defaultAgent);
if (!hasAgent(analyzerAgent.name)) registerAgent(analyzerAgent);

export * from "./registry.js";
