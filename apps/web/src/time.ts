// Shared time helpers. Lives here instead of in five page-local copies because
// the formatting choices are user-facing copy and drift between pages reads
// as inconsistency to the student.

/**
 * "2m ago", "3h ago", "yesterday", "May 12" — the standard recency label
 * used across the sidebar, history page, roster, and collections list.
 */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * "May 12, 4:03 PM" — the exact clock time, used wherever a submission time
 * sits next to a deadline (the submit dialogs). Students submit against
 * deadlines, so the precise time matters more than a rounded "2 days ago"
 * alone, and the two must be comparable at a glance.
 */
export function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
