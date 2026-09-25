// Per-assignment roster: every enrolled student, with their latest
// submission. Students who haven't submitted are listed too — that is the
// student an instructor is looking for. Late is a recorded fact against the
// deadline, never a flag: no red, no fill.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Input, PageHeader, Section } from "../../../components/index.js";
import { useCourse } from "../../../course/useCourse.js";
import { getRoster, type CodeAssignmentDTO, type RosterStudentDTO } from "../api.js";
import { formatDue } from "./CodeHomePage.js";

function formatSubmitted(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

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

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Code"
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
        <Link to={base}>← All coding assignments</Link>
      </p>
      {error && <p className="error">{error}</p>}

      <Section
        kicker="Students"
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
        ) : (
          <div className="prov-roster__scroll">
            <table className="prov-roster">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Latest submission</th>
                  <th scope="col">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.userId}>
                    <th scope="row">
                      <span className="prov-roster__who">{s.displayName ?? s.email}</span>
                      {s.displayName && <span className="prov-roster__email muted small">{s.email}</span>}
                    </th>
                    {s.latest ? (
                      <td>
                        <Link className="prov-roster__hit" to={`${base}/submissions/${s.latest.id}`}>
                          {formatSubmitted(s.latest.submittedAt)}
                        </Link>
                        {s.latest.late && <span className="prov-roster__late"> LATE</span>}
                      </td>
                    ) : (
                      <td className="is-empty">
                        <span className="prov-roster__miss">Not submitted</span>
                      </td>
                    )}
                    <td className={s.submissionCount ? "" : "is-empty"}>{s.submissionCount}</td>
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
