// A submitted notebook, read-only: the cells and outputs exactly as frozen,
// and — when the assignment had the tutor on — the conversation as it stood
// at submission time. Nothing here runs; outputs render from stored data.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader, Section } from "../../../components/index.js";
import { useCourse } from "../../../course/useCourse.js";
import { Markdown } from "../../../Markdown.js";
import { getSubmission, type SubmissionDTO } from "../api.js";
import { Cells } from "./Cells.js";

export function SubmissionPage() {
  const { courseId } = useCourse();
  const { submissionId } = useParams<{ submissionId: string }>();
  const [sub, setSub] = useState<SubmissionDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submissionId) return;
    let live = true;
    getSubmission(courseId, submissionId)
      .then((s) => live && setSub(s))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Load failed"));
    return () => {
      live = false;
    };
  }, [courseId, submissionId]);

  const who = sub ? (sub.student.displayName ?? sub.student.email) : "";
  return (
    <div className="app-page code-submission">
      <PageHeader
        eyebrow="Instructor · Code submission"
        title={sub ? `${who} — ${sub.assignmentTitle ?? sub.title}` : "Submission"}
        scope={
          sub
            ? `Submitted ${new Date(sub.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}${sub.late ? " · after the deadline" : ""}. Outputs are as the student last ran them; nothing here has been re-run.`
            : undefined
        }
      />
      {sub && (
        <p className="muted small">
          <Link to={`/course/${courseId}/instructor/code/${sub.assignmentId}`}>← Back to the roster</Link>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {sub && (
        <>
          <Section kicker="Notebook">
            <div className="code-readonly">
              <Cells cells={sub.content.cells} readOnly />
            </div>
          </Section>
          {sub.messages.length > 0 && (
            <Section kicker="Tutor conversation" meta={`${sub.messages.length} messages`}>
              <div className="code-transcript">
                {sub.messages.map((m) => (
                  <div key={m.id} className={`prov-bubble prov-bubble-${m.role}`}>
                    <div className="prov-bubble-body code-tutor__body">
                      {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
