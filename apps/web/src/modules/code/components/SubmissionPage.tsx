// A submitted notebook, read-only: the cells and outputs exactly as frozen,
// where each character came from (typed / pasted / from the tutor /
// provided), and — when the assignment had the tutor on — the conversation as
// it stood at submission time. Nothing here runs; outputs render from stored
// data. "Open a scratch copy" gives the instructor an unsaved, runnable copy.
//
// The origin view follows the writing tool's rules: facts, never a verdict.
// Absolute counts rather than percentages, the same colours as the writing
// tool's marks, and every import listed so a reader can see what came in and
// how much of it survived.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, PageHeader, Section } from "../../../components/index.js";
import { useCourse } from "../../../course/useCourse.js";
import { Markdown } from "../../../Markdown.js";
import { getSubmission, type Origin, type SubmissionDTO } from "../api.js";
import { Cells } from "./Cells.js";

const ORIGIN_LABEL: Record<Origin, string> = {
  human: "typed",
  pasted: "pasted",
  llm: "from the tutor",
  provided: "provided in the starter",
  edited: "autocorrect",
};
const LEGEND: Origin[] = ["human", "pasted", "llm", "provided"];

export function SubmissionPage() {
  const { courseId } = useCourse();
  const { submissionId } = useParams<{ submissionId: string }>();
  const [sub, setSub] = useState<SubmissionDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOrigins, setShowOrigins] = useState(true);

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
  const render = sub?.render ?? null;
  const cellNumber = new Map((sub?.content.cells ?? []).map((c, i) => [c.id, i + 1]));
  const imports = render
    ? Object.entries(render.cells)
        .flatMap(([cellId, r]) => r.pastes.map((p) => ({ ...p, cell: cellNumber.get(cellId) ?? 0 })))
        .sort((a, b) => a.at - b.at)
    : [];

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
        actions={
          sub && (
            <Button
              variant="subtle"
              size="sm"
              href={`/course/${courseId}/instructor/code/submissions/${sub.id}/scratch`}
            >
              Open a scratch copy
            </Button>
          )
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
          <Section
            kicker="Notebook"
            actions={
              render && (
                <button
                  type="button"
                  className={"prov-toggle" + (showOrigins ? " is-on" : "")}
                  onClick={() => setShowOrigins((v) => !v)}
                  aria-pressed={showOrigins}
                >
                  <span className="prov-toggle__sw" />
                  {showOrigins ? "Origins shown" : "Origins hidden"}
                </button>
              )
            }
          >
            {render ? (
              showOrigins && (
                <div className="code-legend" aria-label="Where the text came from">
                  {LEGEND.map((o) => (
                    <span key={o} className="code-legend__item">
                      <span className={`code-legend__swatch code-origin--${o}`} aria-hidden />
                      {ORIGIN_LABEL[o]}
                      <span className="code-legend__count">{render.totals[o].toLocaleString()} characters</span>
                    </span>
                  ))}
                </div>
              )
            ) : (
              <p className="muted small">
                Origins weren't recorded for this copy: the assignment was set to practice, or
                this was submitted before recording began.
              </p>
            )}
            <div className="code-readonly">
              <Cells
                key={showOrigins ? "marked" : "plain"}
                cells={sub.content.cells}
                readOnly
                marksFor={render && showOrigins ? (id) => render.cells[id]?.runs : undefined}
              />
            </div>
          </Section>

          {render && (
            <Section kicker="Imports" meta={`${imports.length} ${imports.length === 1 ? "import" : "imports"}`}>
              {imports.length === 0 ? (
                <p className="muted">Nothing was pasted into this notebook.</p>
              ) : (
                <ul className="code-imports">
                  {imports.map((p) => (
                    <li key={`${p.cell}-${p.seq}`} className="code-imports__row">
                      <div className="code-imports__meta">
                        <span className={`code-legend__swatch code-origin--${p.origin ?? "pasted"}`} aria-hidden />
                        Cell {p.cell} · {p.origin === "llm" ? "pasted from the tutor" : "pasted"} ·{" "}
                        {p.length.toLocaleString()} characters · {Math.round(p.verbatim * 100)}% still there
                        verbatim · {new Date(p.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                      <pre className="code-imports__sample">{p.sample}</pre>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small code-imports__note">
                An import records that text arrived through the clipboard, not where it was
                copied from. Moving code between this notebook's own cells isn't listed.
              </p>
            </Section>
          )}

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
