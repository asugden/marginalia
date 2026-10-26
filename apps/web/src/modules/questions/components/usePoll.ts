// Re-run `fn` every `intervalMs` while the tab is visible, and once more the
// moment it becomes visible again. A hidden tab polls nothing, so thirty
// laptops left open on another tab cost the worker nothing.

import { useEffect, useRef } from "react";

export function usePoll(fn: () => void, intervalMs: number, enabled = true): void {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs, enabled]);
}
