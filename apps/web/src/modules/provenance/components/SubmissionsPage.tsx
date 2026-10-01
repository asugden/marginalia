// Uncategorized writing submissions — /course/:id/instructor/submissions/uncategorized.
//
// Writing submissions live under their assignments: Review ▸ Submissions
// shows one row per checkpoint, and each row opens that checkpoint's
// submissions. This page holds everything those pages can't show, so nothing
// a student handed in is ever out of reach:
//
//   - submissions never attached to an assignment (made before writing
//     assignments existed, or deliberately left unattached);
//   - submissions to an assignment that has since been deleted;
//   - submissions to a checkpoint that has since been removed.
//
// Review ▸ Submissions only offers the way here when this list is non-empty.
//
// Grouped by DOCUMENT, not by mint: a student can submit the same piece
// repeatedly, so each row is a document with its latest snapshot and earlier
// ones behind an "N earlier" disclosure.
//
// Only staff can reach the endpoint (403 otherwise) or open a snapshot at
// /s/:token. This UI gate is best-effort; the server is authority.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import {
  listAssignments,
  listCourseSubmissions,
  type AssignmentDTO,
  type CourseSubmissionSummary,
} from "../api.js";
import {
  Input,
  PageHeader,
  Section,
  SubmissionCards,
  type SubmissionCardGroup,
} from "../../../components/index.js";
import { uncategorized } from "./AssignmentsPage.js";

/** One document and every snapshot taken of it, newest first. */
export interface DocGroup {
  documentId: string;
  title: string;
  studentEmail: string;
  studentName: string | null;
  /** Newest first; `latest` is subs[0]. */
  subs: CourseSubmissionSummary[];
}

export function SubmissionsPage() {
  const { courseId } = useCourse();
  const [subs, setSubs] = useState<CourseSubmissionSummary[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSubs(null);
    setError(null);
    const ctrl = new AbortController();
    Promise.all([
      listCourseSubmissions(courseId, ctrl.signal),
      listAssignments(courseId, { includeArchived: true }, ctrl.signal),
    ])
      .then(([s, a]) => {
        if (ctrl.signal.aborted) return;
        setAssignments(a);
        setSubs(uncategorized(s, a));
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  // Group by document, preserving the server's newest-first order — so the
  // document with the most recent snapshot leads the page.
  const groups = useMemo<DocGroup[]>(() => (subs ? groupByDocument(subs) : []), [subs]);
  const checkpointCounts = useMemo(
    () => new Map(assignments.map((a) => [a.id, a.checkpoints.length])),
    [assignments],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.studentEmail.toLowerCase().includes(q) ||
        (g.studentName ?? "").toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q),
    );
  }, [groups, query]);

  const students = useMemo(
    () => new Set(groups.map((g) => g.studentEmail)).size,
    [groups],
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Writing submissions"
        title="Uncategorized"
        scope="Writing submissions that don't belong to a current checkpoint: shared before assignments existed, or submitted to an assignment or checkpoint that was later deleted. They're kept here in full."
      />

      <p className="muted small">
        <Link to={`/course/${courseId}/instructor/submissions`}>← All submissions</Link>
      </p>

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Not under an assignment"
        meta={
          subs === null
            ? undefined
            : `${groups.length} document${groups.length === 1 ? "" : "s"} · ${students} student${students === 1 ? "" : "s"}`
        }
        actions={
          <Input
            type="search"
            placeholder="Filter by student or title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "16rem", maxWidth: "40vw" }}
          />
        }
      >
        {subs === null ? (
          <p className="muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="muted">
            Nothing here — every writing submission belongs to a checkpoint.
          </p>
        ) : filtered.length === 0 ? (
          <p className="muted">Nothing matches that filter.</p>
        ) : (
          <SubmissionCards
            groups={filtered.map((g) => toCardGroup(g, { context: "full", checkpointCounts }))}
          />
        )}
      </Section>
    </div>
  );
}

/** One document's snapshots as the shared submission card. Exported for the
 *  writing assignment and checkpoint pages, which show the same cards.
 *
 *  `opts.context` decides what each entry says about where it was submitted:
 *  "full" names the assignment and checkpoint (a mixed list), "checkpoint"
 *  names only the checkpoint (one assignment's page), "none" names neither
 *  (one checkpoint's page, where it's the page title). A checkpoint name is
 *  only ever shown for an assignment that has more than one — see
 *  `checkpointCounts`. */
export function toCardGroup(
  g: DocGroup,
  opts: {
    context?: "full" | "checkpoint" | "none";
    checkpointCounts?: Map<string, number>;
    /** Deadline per checkpoint id, so LATE can say by how much. */
    checkpointDue?: Map<string, number | null>;
  } = {},
): SubmissionCardGroup {
  const context = opts.context ?? "full";
  return {
    key: g.documentId,
    title: g.title,
    who: g.studentName || g.studentEmail,
    entries: g.subs.map((s) => {
      const multi = s.assignmentId !== null && (opts.checkpointCounts?.get(s.assignmentId) ?? 1) > 1;
      return {
        key: s.token,
        href: s.revokedAt === null ? `/s/${s.token}` : null,
        at: s.createdAt,
        assignmentTitle: context === "full" ? s.assignmentTitle : null,
        checkpointName: context !== "none" && multi ? s.checkpointName : null,
        late: s.late,
        lateByMs: (() => {
          const due = s.checkpointId ? opts.checkpointDue?.get(s.checkpointId) : null;
          return s.late && due != null ? s.createdAt - due : null;
        })(),
        revoked: s.revokedAt !== null,
        origins: s.origins,
      };
    }),
  };
}

/** Group snapshots by document, keeping the server's newest-first order. */
export function groupByDocument(subs: CourseSubmissionSummary[]): DocGroup[] {
  const byDoc = new Map<string, DocGroup>();
  for (const s of subs) {
    let g = byDoc.get(s.documentId);
    if (!g) {
      g = {
        documentId: s.documentId,
        title: s.title,
        studentEmail: s.studentEmail,
        studentName: s.studentName,
        subs: [],
      };
      byDoc.set(s.documentId, g);
    }
    g.subs.push(s);
  }
  return [...byDoc.values()];
}
