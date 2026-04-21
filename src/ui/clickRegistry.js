// Registry mapping Y coordinates in the chat pane to tool_call ids AND
// to arbitrary block text for drag-select copy.
//
// MessageList updates this on every render so a mouse click in the chat
// pane can resolve to the tool block under the cursor, and a drag can
// extract the underlying text content without needing a screen buffer.
// Coordinates are stored *relative to the chat pane's top-left*, not the
// terminal. The caller (App.js) is responsible for subtracting the chrome
// offset.

let regions = [];
let blockRegions = [];

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

export function setBlockRegions(arr) {
  blockRegions = Array.isArray(arr) ? arr : [];
}

export function getBlockRegions() {
  return blockRegions;
}

// Return the concatenated text of all block regions whose Y range overlaps
// [startY, endY] (inclusive, pane-relative).
export function extractTextInRange(startY, endY) {
  if (endY < startY) [startY, endY] = [endY, startY];
  const lines = [];
  for (const r of blockRegions) {
    if (r.endY < startY || r.startY > endY) continue;
    if (r.text) lines.push(r.text);
  }
  return lines.join("\n");
}
