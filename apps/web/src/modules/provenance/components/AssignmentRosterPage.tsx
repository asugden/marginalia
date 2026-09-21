// Instructor-side assignment roster —
// /course/:id/instructor/assignments/:assignmentId.
//
// One row per enrolled student, one column per checkpoint. The point of the
// page is the students who AREN'T in the submissions list: that page can only
// show what exists, so someone who submitted nothing simply doesn't appear on
// it. Here they have a row with empty cells, which is the state an instructor
// actually needs to see.
//
// Every cell states a fact and stops there: a date, or nothing yet. "LATE" is a
// timestamp compared against a deadline — computed on each load from the
// checkpoint's current due date, never stored — so moving a deadline moves the
// label with it. There is deliberately no summary column, no count of misses,
// and nothing that turns a row red. The instructor reads the grid and draws
// their own conclusions; see the module README's "no false positives" rule.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import { getAssignmentRoster, type AssignmentRoster } from "../api.js";
import { PageHeader, Section, Input } from "../../../components/index.js";
import { formatDue } from "./AssignmentsPage.js";

/** Submission time, in the same face the student sees in the submit modal. */
function formatSubmitted(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AssignmentRosterPage() {
  const { courseId } = useCourse();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [roster, setRoster] = useState<AssignmentRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!assignmentId) return;
    setRoster(null);
    setError(null);
    const ctrl = new AbortController();
    getAssignmentRoster(courseId, assignmentId, ctrl.signal)
      .then((r) => { if (!ctrl.signal.aborted) setRoster(r); })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId, assignmentId]);

  const filtered = useMemo(() => {
    if (!roster) return [];
    const q = query.trim().toLowerCase();
    if (!q) return roster.students;
    return roster.students.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        (s.displayName ?? "").toLowerCase().includes(q),
    );
  }, [roster, query]);

  const checkpoints = roster?.assignment.checkpoints ?? [];

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Provenance"
        title={roster?.assignment.title ?? "Assignment"}
        scope="Everyone enrolled, and what they've submitted to each checkpoint. Students who haven't submitted are listed too — that's the whole point of this view."
      />

      <p className="muted small">
        <Link to={`/course/${courseId}/instructor/assignments`}>← All writing assignments</Link>
      </p>

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Roster"
        meta={
          roster === null
            ? undefined
            : `${roster.students.length} student${roster.students.length === 1 ? "" : "s"} · ${checkpoints.length} checkpoint${checkpoints.length === 1 ? "" : "s"}`
        }
        actions={
          <Input
            type="search"
            placeholder="Filter by student…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "16rem", maxWidth: "40vw" }}
          />
        }
      >
        {roster === null ? (
          <p className="muted">Loading…</p>
        ) : roster.students.length === 0 ? (
          <p className="muted">
            No students enrolled in this course yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="muted">Nothing matches that filter.</p>
        ) : (
          <div className="prov-roster__scroll">
            <table className="prov-roster">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {checkpoints.map((c) => (
                    <th scope="col" key={c.id}>
                      <span className="prov-roster__cp-name">{c.name}</span>
                      <span className="prov-roster__cp-due muted small">
                        {formatDue(c.dueAt)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.userId}>
                    <th scope="row">
                      <span className="prov-roster__who">
                        {s.displayName || s.email}
                      </span>
                      {s.displayName && (
                        <span className="prov-roster__email muted small">{s.email}</span>
                      )}
                    </th>
                    {s.cells.map((cell) => (
                      <td
                        key={cell.checkpointId}
                        className={cell.token ? undefined : "is-empty"}
                      >
                        {cell.token && cell.submittedAt !== null ? (
                          <Link to={`/s/${cell.token}`} className="prov-roster__hit">
                            <span aria-hidden>✓</span>{" "}
                            {formatSubmitted(cell.submittedAt)}
                            {cell.late && (
                              <span className="prov-roster__late"> LATE</span>
                            )}
                          </Link>
                        ) : (
                          <span className="prov-roster__miss">— not yet</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
