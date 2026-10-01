// Instructor-side writing assignment page —
// /course/:id/instructor/submissions/writing/:assignmentId (formerly
// instructor/assignments/:assignmentId, which redirects here).
//
// Every submission to this assignment, across all its checkpoints, shown
// exactly as submissions look everywhere else (the shared SubmissionCards).
// Review ▸ Submissions links each CHECKPOINT to its own page (CheckpointPage);
// this page is the whole assignment at once — where Assign ▸ Writing's rows
// open, and where old links land. Below, the
// students who haven't submitted anything to it yet.
//
// Every line states a fact and stops there. "LATE" is a timestamp compared
// against a deadline, recomputed on each load from the checkpoint's current
// due date. There is deliberately no count of misses and nothing that turns
// a name red; see the module README's "no false positives" rule.

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
import { formatDue } from "./AssignmentsPage.js";

export function AssignmentRosterPage() {
  const { courseId } = useCourse();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [roster, setRoster] = useState<AssignmentRoster | null>(null);
  const [subs, setSubs] = useState<CourseSubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!assignmentId) return;
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
        setSubs(all.filter((s) => s.assignmentId === assignmentId));
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId, assignmentId]);

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
      (roster?.students ?? []).filter(
        (s) => s.cells.every((c) => !c.token) && matches(s.displayName, s.email),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, q],
  );

  const loading = roster === null || subs === null;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Writing submissions"
        title={roster?.assignment.title ?? "Assignment"}
        scope="Everything students have submitted to this assignment, and who hasn't submitted yet."
      />

      <p className="muted small">
        <Link to={`/course/${courseId}/instructor/submissions`}>← All submissions</Link> ·{" "}
        <Link to={`/course/${courseId}/instructor/assignments`}>Edit in Assign ▸ Writing</Link>
      </p>

      {error && <p className="error">{error}</p>}

      {/* Each checkpoint also has its own page, the way the list shows them.
          Only offered when there is more than one — a single checkpoint is
          just the assignment. */}
      {roster && roster.assignment.checkpoints.length > 1 && (
        <Section kicker="Checkpoints">
          <div className="app-list">
            {roster.assignment.checkpoints.map((c) => (
              <div className="app-list__row" key={c.id}>
                <div className="app-list__main">
                  <div className="app-list__title">
                    <Link
                      to={`/course/${courseId}/instructor/submissions/writing/${roster.assignment.id}/${c.id}`}
                    >
                      {c.name}
                    </Link>
                  </div>
                  <div className="app-list__sub">
                    {c.dueAt === null ? "No deadline" : `Due ${formatDue(c.dueAt)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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
                context: "checkpoint",
                checkpointCounts: new Map([
                  [assignmentId!, roster?.assignment.checkpoints.length ?? 1],
                ]),
                checkpointDue: new Map(
                  (roster?.assignment.checkpoints ?? []).map((c) => [c.id, c.dueAt]),
                ),
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
