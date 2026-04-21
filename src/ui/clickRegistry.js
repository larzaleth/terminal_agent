// Registry mapping Y coordinates in the chat pane to tool_call ids.
//
// MessageList updates this on every render so a mouse click in the chat
// pane can resolve to the tool block under the cursor. Coordinates are
// stored *relative to the chat pane's top-left*, not the terminal. The
// caller (App.js) is responsible for subtracting the chrome offset.

let regions = [];

export function setToolRegions(arr) {
  regions = Array.isArray(arr) ? arr : [];
}

export function clearToolRegions() {
  regions = [];
}

export function findToolAt(relY) {
  for (const r of regions) {
    if (relY >= r.startY && relY <= r.endY) return r.toolId;
  }
  return null;
}

export function getToolRegions() {
  return regions;
}
