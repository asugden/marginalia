// Per-assignment roster: every enrolled student, with their latest
// submission. Students who haven't submitted are listed too — that is the
// student an instructor is looking for. Late is a recorded fact against the
// deadline, never a flag: no red, no fill.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Input, PageHeader, Section, SubmissionCards } from "../../../components/index.js";
import { useCourse } from "../../../course/useCourse.js";
import { getRoster, type CodeAssignmentDTO, type RosterStudentDTO } from "../api.js";
import { formatDue } from "./CodeHomePage.js";

export function RosterPage() {
  const { courseId } = useCourse();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [data, setData] = useState<{ assignment: CodeAssignmentDTO; students: RosterStudentDTO[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const base = `/course/${courseId}/instructor/code`;

  useEffect(() => {
    if (!assignmentId) return;
    let live = true;
    getRoster(courseId, assignmentId)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Load failed"));
    return () => {
      live = false;
    };
  }, [courseId, assignmentId]);

  const students = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.students ?? [];
    return q
      ? all.filter((s) => s.email.toLowerCase().includes(q) || (s.displayName ?? "").toLowerCase().includes(q))
      : all;
  }, [data, query]);
  const submitted = (data?.students ?? []).filter((s) => s.latest).length;
  // Submissions look the same everywhere: the shared cards, as in Writing.
  const submittedRows = students.filter((s) => s.latest);
  const notYet = students.filter((s) => !s.latest);

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Code submissions"
        title={data?.assignment.title ?? "Assignment"}
        scope={
          data
            ? data.assignment.mode === "practice"
              ? `Practice · chat ${data.assignment.aiEnabled ? "on" : "off"}. Students have nothing to submit for a practice assignment, so this list stays empty. Switch it to Submitted in the assignment's settings to collect work.`
              : `${data.assignment.dueAt ? `Due ${formatDue(data.assignment.dueAt)}` : "No deadline"} · chat ${data.assignment.aiEnabled ? "on" : "off"}. Everyone enrolled is listed, whether or not they've submitted.`
            : undefined
        }
      />
      <p className="muted small">
        <Link to={`/course/${courseId}/instructor/submissions`}>← All submissions</Link> ·{" "}
        <Link to={base}>Edit in Assign ▸ Code</Link>
      </p>
      {error && <p className="error">{error}</p>}

      <Section
        kicker="Submitted"
        meta={data ? `${submitted} of ${data.students.length} submitted` : undefined}
        actions={
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or email"
            aria-label="Filter students"
          />
        }
      >
        {data === null ? (
          <p className="muted">Loading…</p>
        ) : data.students.length === 0 ? (
          <p className="muted">No students are enrolled yet.</p>
        ) : submittedRows.length === 0 ? (
          <p className="muted">{query.trim() ? "Nothing matches that filter." : "Nothing submitted yet."}</p>
        ) : (
          <SubmissionCards
            groups={submittedRows.map((s) => ({
              key: s.userId,
              title: s.latest!.title,
              who: s.displayName || s.email,
              entries: [
                {
                  key: s.latest!.id,
                  href: `${base}/submissions/${s.latest!.id}`,
                  at: s.latest!.submittedAt,
                  late: s.latest!.late,
                  lateByMs:
                    s.latest!.late && data.assignment.dueAt !== null
                      ? s.latest!.submittedAt - data.assignment.dueAt
                      : null,
                  origins: s.latest!.origins,
                },
              ],
            }))}
          />
        )}
      </Section>

      {data !== null && notYet.length > 0 && (
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
