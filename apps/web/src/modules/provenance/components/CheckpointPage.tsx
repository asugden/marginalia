// Instructor-side page for ONE checkpoint of a writing assignment —
// /course/:id/instructor/submissions/writing/:assignmentId/:checkpointId.
//
// Staff view each checkpoint as its own assignment: Review ▸ Submissions
// lists one row per checkpoint, and this is where a row opens. Per student it shows every
// submission made TO THIS CHECKPOINT, newest first, through the shared
// SubmissionCards: the latest is the row, earlier ones sit behind "N earlier".
// A late submission is marked LATE with how late it was, and opens like any
// other — late work is never hidden or refused.
//
// Below, the students with nothing submitted to this checkpoint. As on every
// roster: facts only, no counts of misses, nothing turns a name red.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import {
  getAssignmentRoster,
  listCourseSubmissions,
  type AssignmentRoster,
  type CourseSubmissionSummary,
} from "../api.js";
import { Input, PageHeader, Section, SubmissionCards } from "../../../components/index.js";
import { groupByDocument, toCardGroup } from "./SubmissionsPage.js";
import { checkpointTitle, formatDue } from "./AssignmentsPage.js";

export function CheckpointPage() {
  const { courseId } = useCourse();
  const { assignmentId, checkpointId } = useParams<{
    assignmentId: string;
    checkpointId: string;
  }>();
  const [roster, setRoster] = useState<AssignmentRoster | null>(null);
  const [subs, setSubs] = useState<CourseSubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!assignmentId || !checkpointId) return;
    setRoster(null);
    setSubs(null);
    setError(null);
    const ctrl = new AbortController();
    Promise.all([
      getAssignmentRoster(courseId, assignmentId, ctrl.signal),
      listCourseSubmissions(courseId, ctrl.signal),
    ])
      .then(([r, all]) => {
        if (ctrl.signal.aborted) return;
        setRoster(r);
        setSubs(
          all.filter((s) => s.assignmentId === assignmentId && s.checkpointId === checkpointId),
        );
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId, assignmentId, checkpointId]);

  const assignment = roster?.assignment ?? null;
  const checkpoint = assignment?.checkpoints.find((c) => c.id === checkpointId) ?? null;
  const index = assignment?.checkpoints.findIndex((c) => c.id === checkpointId) ?? -1;

  const q = query.trim().toLowerCase();
  const matches = (name: string | null, email: string, title = "") =>
    !q ||
    email.toLowerCase().includes(q) ||
    (name ?? "").toLowerCase().includes(q) ||
    title.toLowerCase().includes(q);

  const groups = useMemo(
    () =>
      groupByDocument(subs ?? []).filter((g) =>
        matches(g.studentName, g.studentEmail, g.title),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subs, q],
  );
  const notYet = useMemo(
    () =>
      index < 0
        ? []
        : (roster?.students ?? []).filter(
            (s) => !s.cells[index]?.token && matches(s.displayName, s.email),
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, index, q],
  );

  const loading = roster === null || subs === null;
  const listHref = `/course/${courseId}/instructor/submissions`;
  const assignHref = `/course/${courseId}/instructor/assignments`;

  if (!loading && !checkpoint) {
    return (
      <div className="app-page">
        <PageHeader eyebrow="Instructor · Writing submissions" title="Checkpoint not found" />
        <p className="muted">
          This checkpoint was removed from its assignment. Anything submitted to
          it is listed under Uncategorized on{" "}
          <Link to={listHref}>Submissions</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Writing submissions"
        title={assignment ? checkpointTitle(assignment, checkpoint) : "Checkpoint"}
        scope={
          checkpoint
            ? `${checkpoint.dueAt === null ? "No deadline" : `Due ${formatDue(checkpoint.dueAt)}`}. Each student's latest submission to this checkpoint, with earlier ones behind it. Late work is marked, never hidden.`
            : undefined
        }
      />

      <p className="muted small">
        <Link to={listHref}>← All submissions</Link> ·{" "}
        <Link to={assignHref}>Edit in Assign ▸ Writing</Link>
      </p>

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Submitted"
        meta={loading ? undefined : `${groups.length} document${groups.length === 1 ? "" : "s"}`}
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
        {loading ? (
          <p className="muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="muted">{q ? "Nothing matches that filter." : "Nothing submitted yet."}</p>
        ) : (
          <SubmissionCards
            groups={groups.map((g) =>
              toCardGroup(g, {
                context: "none",
                checkpointDue: new Map([[checkpointId!, checkpoint?.dueAt ?? null]]),
              }),
            )}
          />
        )}
      </Section>

      {!loading && notYet.length > 0 && (
        <Section kicker="Not submitted yet" meta={`${notYet.length}`}>
          <div className="app-list">
            {notYet.map((s) => (
              <div className="app-list__row prov-subs__row" key={s.userId}>
                <div className="app-list__main">
                  <div className="app-list__sub">{s.displayName || s.email}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
