// Mouse support disabled to ensure terminal stability and native focus behavior.
// Some terminal emulators struggle with mouse reporting when switching windows.

export function setMouseCallback(fn) {}
export function clearMouseCallback() {}
export function enableMouse(stdin = process.stdin, stdout = process.stdout) {}
export function disableMouse(stdin = process.stdin, stdout = process.stdout) {}
export function _parseForTest(chunk) { return { events: [], remaining: chunk }; }
