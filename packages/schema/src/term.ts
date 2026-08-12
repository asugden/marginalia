// Course term helpers — the single place the academic-calendar rules live.
//
// A term is a (season, calendar-year) pair: Fall 2026, Spring 2027, Summer
// 2027. The academic year crosses calendar years — it starts in the fall and
// runs through the following spring and summer — so Fall 2026, Spring 2027 and
// Summer 2027 all belong to academic year 2026–2027. That crossing rule is
// encoded once here (academicYearStart) so callers never re-derive it.
//
// Kept brand-neutral and institution-agnostic: seasons and the fall-start
// academic year are the common North-American pattern. An institution on a
// different calendar can adjust these helpers in one place.
//
// NOTE: a trimmed copy of this logic lives at apps/web/src/course/term.ts
// because the web app doesn't depend on @marginalia/schema. Keep the two in
// sync when the rules change.

export type TermSeason = "spring" | "summer" | "fall";

export const TERM_SEASONS: readonly TermSeason[] = ["spring", "summer", "fall"];

export function isTermSeason(v: unknown): v is TermSeason {
  return v === "spring" || v === "summer" || v === "fall";
}

/** The calendar year the academic year STARTS in. Fall keeps its own year;
 *  spring/summer belong to the academic year that began the previous fall. */
export function academicYearStart(season: TermSeason, year: number): number {
  return season === "fall" ? year : year - 1;
}

/** Human label for the academic year a term sits in, e.g. "2026–2027"
 *  (en-dash). */
export function academicYearLabel(season: TermSeason, year: number): string {
  const start = academicYearStart(season, year);
  return `${start}–${start + 1}`;
}

/** Display label for a single term, e.g. "Fall 2026". */
export function termLabel(season: TermSeason, year: number): string {
  const cap = season.charAt(0).toUpperCase() + season.slice(1);
  return `${cap} ${year}`;
}

/** Order within an academic year, fall → spring → summer (teaching order). */
const SEASON_ORDER: Record<TermSeason, number> = {
  fall: 0,
  spring: 1,
  summer: 2,
};

/** Sort key for listing terms newest-first: most recent academic year first,
 *  then fall → spring → summer within the year. Higher sorts earlier when used
 *  with a descending compare. */
export function termSortKey(season: TermSeason, year: number): number {
  // academic-year-start dominates; season is the tiebreaker within a year.
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

/** Generic, editable default date window for a term. Institution-agnostic
 *  approximations (a real calendar is set per course by editing the dates):
 *  spring ~ Jan 8 – May 8, summer ~ May 18 – Aug 15, fall ~ Aug 25 – Dec 18.
 *  Returns Unix ms at UTC day boundaries (start-of-day / end-of-day inclusive). */
export function defaultTermDates(
  season: TermSeason,
  year: number,
): { start: number; end: number } {
  // [startMonth, startDay, endMonth, endDay] — months are 0-based.
  const ranges: Record<TermSeason, [number, number, number, number]> = {
    spring: [0, 8, 4, 8], // Jan 8 – May 8
    summer: [4, 18, 7, 15], // May 18 – Aug 15
    fall: [7, 25, 11, 18], // Aug 25 – Dec 18
  };
  const [sm, sd, em, ed] = ranges[season];
  return {
    start: Date.UTC(year, sm, sd, 0, 0, 0, 0),
    end: Date.UTC(year, em, ed, 23, 59, 59, 999),
  };
}
