// Staff review as a grid: assignments one way, students the other. Moving
// left and right steps through the students of one assignment, in the order
// that assignment's submissions page lists them. Moving up and down steps
// through the DATED assignments in date order, staying with the same student.
//
// An "assignment" is what Review ▸ Submissions lists as a row: a writing
// checkpoint (a one-checkpoint assignment is just the assignment) or a coding
// assignment that takes submissions.
//
// Pure: no React, no fetching. useReviewGrid loads the inputs.

import type { AssignmentDTO, CourseSubmissionSummary } from "../modules/provenance/api.js";
import type { CodeAssignmentDTO, LatestSubmissionDTO } from "../modules/code/api.js";

export type ReviewKind = "writing" | "code";

/** One student's work in one assignment: the submission it opens. */
export interface GridEntry {
  userId: string;
  /** The student as a person reads it: name, else email. */
  who: string;
  /** The submission this entry opens (a code submission id, a writing token). */
  submissionId: string;
  href: string;
}

export interface GridAssignment {
  /** "w:<checkpointId>" or "c:<assignmentId>". */
  key: string;
  kind: ReviewKind;
  title: string;
  dueAt: number | null;
  /** What was assigned, as the instructor wrote it (Markdown). */
  instructions: string;
  /** The assignment's submissions page. */
  listHref: string;
  /** In the order the submissions page lists them. */
  entries: GridEntry[];
}

export interface ReviewGrid {
  /** Every assignment, keyed as above. */
  byKey: Map<string, GridAssignment>;
  /** Dated assignments only, earliest deadline first: the up/down axis. */
  dated: GridAssignment[];
}

export interface ReviewGridInput {
  courseId: string;
  writing: AssignmentDTO[];
  writingSubs: CourseSubmissionSummary[];
  code: CodeAssignmentDTO[];
  codeSubs: LatestSubmissionDTO[];
}

export const writingKey = (checkpointId: string) => `w:${checkpointId}`;
export const codeKey = (assignmentId: string) => `c:${assignmentId}`;

export function buildReviewGrid(input: ReviewGridInput): ReviewGrid {
  const base = `/course/${input.courseId}/instructor`;
  const all: GridAssignment[] = [];

  for (const a of input.writing) {
    for (const cp of a.checkpoints) {
      // Newest submission first, one entry per document — the checkpoint
      // page's order (groupByDocument over the server's newest-first list).
      const seen = new Set<string>();
      const entries: GridEntry[] = [];
      for (const s of input.writingSubs) {
        if (s.assignmentId !== a.id || s.checkpointId !== cp.id) continue;
        if (seen.has(s.documentId)) continue;
        seen.add(s.documentId);
        // A revoked latest snapshot can't be opened; the page shows it unlinked.
        if (s.revokedAt !== null) continue;
        entries.push({
          userId: s.studentUserId,
          who: s.studentName || s.studentEmail,
          submissionId: s.token,
          href: `/s/${s.token}`,
        });
      }
      if (a.archivedAt !== null && entries.length === 0) continue;
      all.push({
        key: writingKey(cp.id),
        kind: "writing",
        title: a.checkpoints.length > 1 ? `${a.title} — ${cp.name}` : a.title,
        dueAt: cp.dueAt,
        instructions: a.instructions,
        listHref: `${base}/submissions/writing/${a.id}/${cp.id}`,
        entries,
      });
    }
  }

  for (const a of input.code) {
    // Practice assignments take no submissions.
    if (a.mode === "practice") continue;
    const entries = input.codeSubs
      .filter((s) => s.assignmentId === a.id)
      .map((s) => ({
        userId: s.userId,
        who: s.displayName || s.email,
        submissionId: s.id,
        href: `${base}/code/submissions/${s.id}`,
      }))
      // The roster's order: by name, case-insensitively.
      .sort((x, y) => x.who.localeCompare(y.who, undefined, { sensitivity: "base" }));
    if (a.archivedAt !== null && entries.length === 0) continue;
    all.push({
      key: codeKey(a.id),
      kind: "code",
      title: a.title,
      dueAt: a.dueAt,
      instructions: a.instructions,
      listHref: `${base}/submissions/code/${a.id}`,
      entries,
    });
  }

  const dated = all
    .filter((a) => a.dueAt !== null)
    .sort((x, y) => x.dueAt! - y.dueAt! || x.title.localeCompare(y.title));
  return { byKey: new Map(all.map((a) => [a.key, a])), dated };
}

/** Where a move goes: a page, and what to call it in a tooltip. */
export interface NavTarget {
  href: string;
  label: string;
}

export interface SubmissionNav {
  assignment: GridAssignment;
  /** 1-based position among the assignment's entries, and how many there are. */
  position: { index: number; of: number } | null;
  prev: NavTarget | null;
  next: NavTarget | null;
  /** The previous / next dated assignment: the same student's submission
   *  there, or that assignment's page when they have none. */
  up: NavTarget | null;
  down: NavTarget | null;
}

/** Moves available from one submission. Null when the assignment isn't in
 *  the grid (an uncategorized snapshot, a deleted assignment). */
export function navFromSubmission(
  grid: ReviewGrid,
  at: { key: string; userId: string; submissionId: string },
): SubmissionNav | null {
  const assignment = grid.byKey.get(at.key);
  if (!assignment) return null;
  const { entries } = assignment;
  // An earlier snapshot isn't an entry itself; it stands in its student's place.
  let i = entries.findIndex((e) => e.submissionId === at.submissionId);
  if (i < 0) i = entries.findIndex((e) => e.userId === at.userId);
  const step = (j: number): NavTarget | null => {
    const e = i >= 0 ? entries[j] : undefined;
    return e ? { href: e.href, label: e.who } : null;
  };
  const across = (d: -1 | 1): NavTarget | null => {
    const other = adjacentDated(grid, at.key, d);
    if (!other) return null;
    const theirs = other.entries.find((e) => e.userId === at.userId);
    return theirs
      ? { href: theirs.href, label: other.title }
      : { href: other.listHref, label: `${other.title} (nothing submitted)` };
  };
  return {
    assignment,
    position: i >= 0 ? { index: i + 1, of: entries.length } : null,
    prev: step(i - 1),
    next: step(i + 1),
    up: across(-1),
    down: across(1),
  };
}

/** Moves available from an assignment's submissions page: up and down only. */
export function navFromAssignment(
  grid: ReviewGrid,
  key: string,
): { assignment: GridAssignment; up: NavTarget | null; down: NavTarget | null } | null {
  const assignment = grid.byKey.get(key);
  if (!assignment) return null;
  const to = (a: GridAssignment | null): NavTarget | null =>
    a ? { href: a.listHref, label: a.title } : null;
  return {
    assignment,
    up: to(adjacentDated(grid, key, -1)),
    down: to(adjacentDated(grid, key, 1)),
  };
}

function adjacentDated(grid: ReviewGrid, key: string, d: -1 | 1): GridAssignment | null {
  const i = grid.dated.findIndex((a) => a.key === key);
  if (i < 0) return null;
  return grid.dated[i + d] ?? null;
}
