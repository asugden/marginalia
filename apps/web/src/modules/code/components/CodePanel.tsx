// The Code module's dashboard panel — the course's coding assignments, shown
// stacked with the Agents and Writing panels on the student dashboard.
//
// It exists because the dashboard was built before the code module and listed
// only two panels (Agents, Writing) hardcoded, so a course with Code turned on
// got a "Code" nav item and a working /code route but NOTHING on the course
// home — writing assignments appeared there and coding assignments silently
// did not.
//
// Scope is deliberately narrower than CodeHomePage: this shows ASSIGNMENTS
// only, not the student's scratch notebooks. The dashboard is the at-a-glance
// view of what the course has set; scratch notebooks are personal workspace
// and belong on the dedicated /code page, which the panel's header links to.
// Same reasoning the Writing panel follows in listing documents rather than
// every provenance surface.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../../components/index.js";
import { relativeTime } from "../../../time.js";
import {
  isAuthError,
  listAssignments,
  listNotebooks,
  type CodeAssignmentDTO,
  type NotebookSummaryDTO,
} from "../api.js";

/** Absolute due date, matching CodeHomePage's format so the same assignment
 *  reads identically in both places. */
function formatDue(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CodeGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
    </svg>
  );
}

export function CodePanel({ courseId }: { courseId: string }) {
  const base = `/course/${courseId}/code`;
  const [assignments, setAssignments] = useState<CodeAssignmentDTO[] | null>(
    null,
  );
  const [notebooks, setNotebooks] = useState<NotebookSummaryDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      listAssignments(courseId, { signal: ctrl.signal }),
      listNotebooks(courseId, ctrl.signal),
    ])
      .then(([a, n]) => {
        if (ctrl.signal.aborted) return;
        setAssignments(a);
        setNotebooks(n);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        // An auth failure is the shell's problem, not a panel's — the dashboard
        // hosts three panels and one of them hijacking the page to a login
        // redirect would be wrong. Stay quiet and let the shell handle it.
        if (isAuthError(e)) return;
        setError(e instanceof Error ? e.message : "Couldn't load coding work.");
      });
    return () => ctrl.abort();
  }, [courseId]);

  // Which assignments this student has already opened a notebook for — drives
  // "Continue" vs "Start" and the edited-time line.
  const started = new Map(
    notebooks.filter((n) => n.assignmentId).map((n) => [n.assignmentId!, n]),
  );

  // Live assignments only; an archived one is no longer set.
  const live = (assignments ?? []).filter((a) => a.archivedAt == null);

  return (
    <section className="app-modpanel app-modpanel--open" data-module="code">
      <div className="app-modpanel__head">
        <div className="app-modpanel__heading">
          <span className="eyebrow">Python notebooks</span>
          <h2>Code</h2>
        </div>
        {live.length > 0 && (
          <span className="app-modpanel__meta">
            {live.length} assignment{live.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="app-modpanel__body">
        {error && <p className="error">{error}</p>}
        {assignments === null ? (
          <p className="app-empty">Loading…</p>
        ) : live.length === 0 ? (
          <p className="app-papers__empty">
            No coding assignments yet.{" "}
            <Link to={base}>Open a scratch notebook</Link> to experiment.
          </p>
        ) : (
          <div className="app-list">
            {live.map((a) => {
              const nb = started.get(a.id);
              return (
                <div className="app-list__row" key={a.id}>
                  <span className="app-papers__ic" aria-hidden>
                    <CodeGlyph />
                  </span>
                  <div className="app-list__main">
                    <div className="app-list__title">
                      <Link to={`${base}/assignment/${a.id}`}>{a.title}</Link>
                    </div>
                    <div className="app-list__sub">
                      {[
                        a.dueAt ? `Due ${formatDue(a.dueAt)}` : "No deadline",
                        a.mode === "practice" ? "Practice" : null,
                        a.aiEnabled ? "Chat available" : null,
                        nb
                          ? `Edited ${relativeTime(nb.updatedAt)}`
                          : "Not started",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="app-list__meta">
                    <Button
                      variant={nb ? "subtle" : "primary"}
                      size="sm"
                      href={`${base}/assignment/${a.id}`}
                    >
                      {nb ? "Continue" : "Start"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
