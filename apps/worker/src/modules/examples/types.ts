// Shared types for the examples module.
//
// The DTO split mirrors the storage split: `UsageBucketDTO` carries counts and
// no identity; `CompletionDTO` carries identity and no counts. Keeping them in
// separate shapes means no handler can accidentally widen one into the other.

/** Curation row: an example an instructor attached to a course. */
export interface CourseExampleRow {
  course_id: string;
  slug: string;
  ord: number;
  assigned_at: number | null;
  due_at: number | null;
  note: string | null;
}

/** Aggregate usage row. Note the absence of any user column — see the
 *  migration's comment; this is load-bearing, not an omission. */
export interface ExampleUsageRow {
  course_id: string;
  slug: string;
  day: string;
  hour_bucket: number;
  opens: number;
  engaged_opens: number;
}

export interface ExampleCompletionRow {
  course_id: string;
  slug: string;
  user_id: string;
  completed_at: number;
}

/** One curated example, as the instructor's curation editor sees it. */
export interface CourseExampleDTO {
  slug: string;
  ord: number;
  assignedAt: number | null;
  dueAt: number | null;
  note: string | null;
}

/**
 * A usage bucket after the small-cohort floor has been applied.
 *
 * `opens`/`engagedOpens` are null exactly when the true count is non-zero but
 * below MIN_COHORT; `suppressed` says so explicitly so the client renders
 * "fewer than N" rather than guessing what a null means. A genuine zero is
 * reported as zero — "nobody opened this" reveals nothing about anybody.
 */
export interface UsageBucketDTO {
  slug: string;
  day: string;
  hourBucket: number;
  opens: number | null;
  engagedOpens: number | null;
  suppressed: boolean;
}

/** Per-example totals for the course, floored the same way as the buckets. */
export interface UsageTotalDTO {
  slug: string;
  opens: number | null;
  engagedOpens: number | null;
  suppressed: boolean;
}

/** One student's binary state for one example. No counts, by design. */
export interface CompletionRosterEntryDTO {
  userId: string;
  email: string | null;
  displayName: string | null;
  /** Slugs this student has marked complete. Order matches the curated list. */
  completed: string[];
}

export function rowToCourseExample(row: CourseExampleRow): CourseExampleDTO {
  return {
    slug: row.slug,
    ord: row.ord,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    note: row.note,
  };
}
