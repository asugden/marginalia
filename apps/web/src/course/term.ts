// Course term helpers for the web app — the academic-calendar rules for
// grouping and labelling courses by semester.
//
// A term is a (season, calendar-year) pair: Fall 2026, Spring 2027, Summer
// 2027. The academic year crosses calendar years — it starts in the fall and
// runs through the following spring and summer — so Fall 2026, Spring 2027 and
// Summer 2027 all belong to academic year 2026–2027 (academicYearStart encodes
// that crossing once).
//
// This is a trimmed mirror of packages/schema/src/term.ts (the worker's copy).
// The web app doesn't depend on @marginalia/schema, so the logic is duplicated
// here — keep the two in sync when the rules change.

export type TermSeason = "spring" | "summer" | "fall";

export const TERM_SEASONS: readonly TermSeason[] = ["spring", "summer", "fall"];

/** The calendar year the academic year STARTS in. Fall keeps its own year;
 *  spring/summer belong to the academic year that began the previous fall. */
export function academicYearStart(season: TermSeason, year: number): number {
  return season === "fall" ? year : year - 1;
}

/** Human label for the academic year a term sits in, e.g. "2026–2027". */
export function academicYearLabel(season: TermSeason, year: number): string {
  const start = academicYearStart(season, year);
  return `${start}–${start + 1}`;
}

/** Display label for a single term, e.g. "Fall 2026". */
export function termLabel(season: TermSeason, year: number): string {
  const cap = season.charAt(0).toUpperCase() + season.slice(1);
  return `${cap} ${year}`;
}

const SEASON_ORDER: Record<TermSeason, number> = {
  fall: 0,
  spring: 1,
  summer: 2,
};

/** Sort key for listing terms newest-first: most recent academic year first,
 *  then fall → spring → summer within the year. Higher sorts earlier under a
 *  descending compare. */
export function termSortKey(season: TermSeason, year: number): number {
  return academicYearStart(season, year) * 10 - SEASON_ORDER[season];
}

/** The current term from a wall-clock timestamp, used as the default for a new
 *  course. Jan–May = spring, Jun–Jul = summer, Aug–Dec = fall. */
export function currentTerm(nowMs: number): { season: TermSeason; year: number } {
  const d = new Date(nowMs);
  const month = d.getMonth(); // 0 = Jan
  const year = d.getFullYear();
  if (month <= 4) return { season: "spring", year };
  if (month <= 6) return { season: "summer", year };
  return { season: "fall", year };
}

// ── Active window (start/end dates) ─────────────────────────────────────────
// Dates are stored as Unix ms at UTC day boundaries (start = 00:00:00.000 of
// the first day, end = 23:59:59.999 of the last day, inclusive). A course is
// "current" when now falls within the window; a NULL bound is open-ended.

/** Whether a course is currently active. A null lower/upper bound means "no
 *  limit" — a course with no dates at all is open-ended and always current. */
export function isCourseCurrent(
  startMs: number | null,
  endMs: number | null,
  nowMs: number,
): boolean {
  if (startMs != null && nowMs < startMs) return false;
  if (endMs != null && nowMs > endMs) return false;
  return true;
}

/** Generic, editable default date window for a term (see the schema mirror).
 *  spring ~ Jan 8 – May 8, summer ~ May 18 – Aug 15, fall ~ Aug 25 – Dec 18.
 *  Returns Unix ms at UTC day boundaries (start-of-day / end-of-day inclusive). */
export function defaultTermDates(
  season: TermSeason,
  year: number,
): { start: number; end: number } {
  const ranges: Record<TermSeason, [number, number, number, number]> = {
    spring: [0, 8, 4, 8],
    summer: [4, 18, 7, 15],
    fall: [7, 25, 11, 18],
  };
  const [sm, sd, em, ed] = ranges[season];
  return {
    start: Date.UTC(year, sm, sd, 0, 0, 0, 0),
    end: Date.UTC(year, em, ed, 23, 59, 59, 999),
  };
}

// ── Date-input helpers (UI only) ────────────────────────────────────────────

/** Format a stored ms timestamp as a `<input type="date">` value ("YYYY-MM-DD",
 *  read in UTC to match how the values are stored). Empty string for null. */
export function msToDateInput(ms: number | null): string {
  if (ms == null) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parse a `<input type="date">` value ("YYYY-MM-DD") to a stored ms timestamp
 *  at the UTC start-of-day, or (endOfDay) the inclusive UTC end-of-day. Empty
 *  input → null (clears the bound). */
export function dateInputToMs(
  value: string,
  opts: { endOfDay?: boolean } = {},
): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return opts.endOfDay
    ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
    : Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

/** Human-readable date range for a course card, e.g. "Jan 8 – May 8, 2026".
 *  Falls back gracefully when only one bound is set. Read in UTC. */
export function formatDateRange(
  startMs: number | null,
  endMs: number | null,
): string {
  const fmt = (ms: number, withYear: boolean) =>
    new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    });
  if (startMs != null && endMs != null) {
    const sameYear =
      new Date(startMs).getUTCFullYear() === new Date(endMs).getUTCFullYear();
    return `${fmt(startMs, !sameYear)} – ${fmt(endMs, true)}`;
  }
  if (startMs != null) return `from ${fmt(startMs, true)}`;
  if (endMs != null) return `until ${fmt(endMs, true)}`;
  return "";
}
