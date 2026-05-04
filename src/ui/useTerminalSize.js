import { useState, useEffect } from "react";

/**
 * Track terminal size, update on resize. Falls back to sensible defaults
 * when dimensions aren't reported (e.g. inside some IDE-integrated terminals).
 */
export function useTerminalSize() {
  const read = () => ({
    rows: process.stdout.rows || 30,
    columns: process.stdout.columns || 100,
  });

  const [size, setSize] = useState(read);

  useEffect(() => {
    const onResize = () => setSize(read());
    process.stdout.on("resize", onResize);
    return () => process.stdout.off("resize", onResize);
  }, []);

  return size;
}
