// Time logic for the instructor dashboard — the one surface that is ABOUT
// TIME rather than about a kind.
//
// Assign answers "what have I set?"; Submissions answers "what came back?".
// Neither answers "what is happening this week", which is the question an
// instructor actually opens the course with. That question is purely a
// function of `course_items`' dates, so the sorting/bucketing lives here in
// plain functions rather than inside the page.
//
// TWO CLASSES OF ITEM, and the distinction is already named upstream:
//
//   * SCHEDULED — has a due date. Writing, code, and assigned agents. These
//     are "due", they can be overdue, and they sort by deadline.
//   * SUPPLEMENTS — `isSupplement()`: no assignedAt AND no dueAt. Optional
//     agents and tracked examples. They are never due and must never be
//     rendered as late; they are interesting only as "is anyone using this",
//     so they sort by recency of use, not by date.
//
// Conflating the two would put a red "overdue" on something the instructor
// deliberately made optional. That is the bug this split exists to prevent.
//
// NO COMPLETION COUNTS LIVE HERE. `GET /course-items` returns the CALLER'S own
// completion by design (see the module README's "No verdicts"), so a
// class-wide "18 of 31" is not derivable from this data and must not be faked
// from it. This module reports dates only.

import {
  isSupplement,
  type CourseItemDTO,
} from "../modules/course-items/api.js";

const DAY = 86_400_000;

/** Which time bucket a scheduled item falls into, relative to `now`. */
export type DueBucket = "overdue" | "today" | "soon" | "later";

export interface DatedItem {
  item: CourseItemDTO;
  /** Non-null for everything in a scheduled bucket. */
  dueAt: number;
  bucket: DueBucket;
  /** Whole days from now to the deadline; negative when overdue. */
  daysOut: number;
}

/** Start of the UTC day containing `ms`. Dates are stored and read as UTC
 *  throughout the course module (see formatDateRange), so day arithmetic has
 *  to agree with that or an item flips buckets at the wrong local midnight. */
function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days between two instants, by calendar day rather than by elapsed
 *  hours — so something due "tomorrow at 9am" reads as 1 day out at any hour
 *  of today, not 0 or 1 depending on the clock. */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((startOfUtcDay(toMs) - startOfUtcDay(fromMs)) / DAY);
}

/** Bucket a deadline. `soon` is the next week — the horizon an instructor can
 *  actually act on; anything further is `later` and stays off the dashboard. */
export function bucketFor(dueAt: number, now: number): DueBucket {
  const d = daysBetween(now, dueAt);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "later";
}

/**
 * The scheduled items worth showing, nearest deadline first.
 *
 * Archived and dangling items are excluded: archived is the instructor saying
 * "not live", and a dangling wrapper (deleted agent, dropped example slug) has
 * no payload to open — it belongs on Assign where it can be cleaned up, not on
 * a page that says what is due.
 */
export function scheduledItems(
  items: CourseItemDTO[],
  now: number,
  opts: { limit?: number } = {},
): DatedItem[] {
  const out: DatedItem[] = [];
  for (const item of items) {
    if (item.archivedAt != null || item.dangling) continue;
    if (item.dueAt == null) continue;
    const bucket = bucketFor(item.dueAt, now);
    if (bucket === "later") continue;
    out.push({
      item,
      dueAt: item.dueAt,
      bucket,
      daysOut: daysBetween(now, item.dueAt),
    });
  }
  out.sort((a, b) => a.dueAt - b.dueAt);
  return opts.limit != null ? out.slice(0, opts.limit) : out;
}

/** Everything overdue, oldest first — the instructor's action list. Separate
 *  from `scheduledItems` because overdue work is a different question from
 *  what's coming up, and burying it in a sorted list hides it. */
export function overdueItems(
  items: CourseItemDTO[],
  now: number,
): DatedItem[] {
  return scheduledItems(items, now).filter((d) => d.bucket === "overdue");
}

/** Upcoming = due today or within the week. */
export function upcomingItems(
  items: CourseItemDTO[],
  now: number,
  opts: { limit?: number } = {},
): DatedItem[] {
  const up = scheduledItems(items, now).filter((d) => d.bucket !== "overdue");
  return opts.limit != null ? up.slice(0, opts.limit) : up;
}

/**
 * Supplements — offered but never due. Optional agents and tracked examples.
 *
 * These carry no deadline, so "recency" is the only ordering that means
 * anything. `ord` is the instructor's own hand-set order on the Assign page,
 * which is the best proxy the wrapper actually has; usage figures live in the
 * examples module and are fetched separately by the page that wants them.
 */
export function supplements(
  items: CourseItemDTO[],
  opts: { limit?: number } = {},
): CourseItemDTO[] {
  const out = items.filter(
    (i) => i.archivedAt == null && !i.dangling && isSupplement(i),
  );
  out.sort((a, b) => a.ord - b.ord);
  return opts.limit != null ? out.slice(0, opts.limit) : out;
}

/** Count of scheduled items due within the next 7 days (today included). */
export function dueThisWeek(items: CourseItemDTO[], now: number): number {
  return upcomingItems(items, now).length;
}

/**
 * A short, human deadline phrase: "Overdue by 3 days", "Due today",
 * "Due tomorrow", "Due in 4 days".
 *
 * Deliberately a plain statement of the date arithmetic and nothing more — no
 * risk language, no "at risk"/"concern" framing. The no-false-positives rule
 * that governs Assign governs this surface too: lateness is
 * `now > due_at`, computed at read time, and moving the deadline is the whole
 * of the remedy.
 */
export function dueLabel(d: DatedItem): string {
  const n = d.daysOut;
  if (n < 0) {
    const late = Math.abs(n);
    return late === 1 ? "Overdue by 1 day" : `Overdue by ${late} days`;
  }
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${n} days`;
}

/** Absolute date for the row, e.g. "Thu, Oct 2". Read in UTC to match the
 *  rest of the course date handling. */
export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
