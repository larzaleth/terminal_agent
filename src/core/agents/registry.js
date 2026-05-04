/**
 * In-memory registry of named agent definitions.
 *
 * Call `registerAgent(def)` at module-load time (see `./index.js`), then
 * look agents up by name with `getAgent("analyzer")` before passing the
 * definition to `runAgent(userInput, { definition })`.
 */

const registry = new Map();

/**
 * @param {import("./types.js").AgentDefinition} def
 */
export function registerAgent(def) {
  if (!def || typeof def !== "object") {
    throw new TypeError("registerAgent: definition must be an object");
  }
  if (!def.name || typeof def.name !== "string") {
    throw new TypeError("registerAgent: definition.name is required");
  }
  if (registry.has(def.name)) {
    throw new Error(`registerAgent: duplicate agent name '${def.name}'`);
  }
  registry.set(def.name, Object.freeze({ ...def }));
}

/**
 * @param {string} name
 * @returns {import("./types.js").AgentDefinition}
 */
export function getAgent(name) {
  const def = registry.get(name);
  if (!def) {
    const available = [...registry.keys()].join(", ") || "(none)";
    throw new Error(`Unknown agent: '${name}'. Available: ${available}`);
  }
  return def;
}

export function hasAgent(name) {
  return registry.has(name);
}

export function listAgents() {
  return [...registry.values()];
}

/**
 * Test helper — do NOT use in application code.
 * @internal
 */
export function _resetRegistryForTests() {
  registry.clear();
}
