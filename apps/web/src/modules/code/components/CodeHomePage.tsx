// Student Code home: the course's coding assignments, then the student's own
// scratch notebooks. Mounted under StudentLayout at /course/:id/code, and
// only reachable from the nav when the course has the module turned on.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, IconButton, useConfirm } from "../../../components/index.js";
import { useCourse } from "../../../course/useCourse.js";
import { DocIcon, PlusIcon, TrashIcon } from "../../../icons.js";
import { relativeTime } from "../../../time.js";
import {
  ApiError,
  deleteNotebook,
  isAuthError,
  listAssignments,
  listNotebooks,
  openNotebook,
  redirectToLogin,
  type CodeAssignmentDTO,
  type NotebookSummaryDTO,
} from "../api.js";

export function formatDue(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CodeHomePage() {
  const { courseId } = useCourse();
  const navigate = useNavigate();
  const base = `/course/${courseId}/code`;
  const [assignments, setAssignments] = useState<CodeAssignmentDTO[] | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      listAssignments(courseId, { signal: ctrl.signal }),
      listNotebooks(courseId, ctrl.signal),
    ])
      .then(([a, n]) => {
        setAssignments(a);
        setNotebooks(n);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        if (isAuthError(e)) return redirectToLogin();
        setError(
          e instanceof ApiError && e.code === "code_disabled"
            ? "Code isn't turned on for this course."
            : e instanceof Error
              ? e.message
              : "Load failed",
        );
      });
    return () => ctrl.abort();
  }, [courseId]);

  const started = new Map((notebooks ?? []).filter((n) => n.assignmentId).map((n) => [n.assignmentId!, n]));
  const scratch = (notebooks ?? []).filter((n) => !n.assignmentId);

  async function onNew() {
    setBusy(true);
    try {
      const nb = await openNotebook(courseId, {});
      navigate(`${base}/${nb.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a notebook");
      setBusy(false);
    }
  }

  async function onDelete(nb: NotebookSummaryDTO) {
    const ok = await confirm({
      title: "Delete this notebook?",
      body: "Its code, outputs and files in this browser go with it. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteNotebook(courseId, nb.id);
      setNotebooks((cur) => (cur ?? []).filter((n) => n.id !== nb.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="app-home__inner">
      <div className="app-head">
        <span className="eyebrow">Python notebooks</span>
        <span className="app-rule" />
        <h1>Code</h1>
        <p className="app-head__sub">
          Python notebooks that run right here in your browser, with numpy,
          pandas, matplotlib and scikit-learn ready to import. Nothing to
          install, and your own data files never leave your computer.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="app-agents__bar">
        <span className="mono-label">Assignments</span>
      </div>
      {assignments === null ? (
        <p className="app-empty">Loading…</p>
      ) : assignments.length === 0 ? (
        <p className="app-empty">No coding assignments yet.</p>
      ) : (
        <div className="app-list">
          {assignments.map((a) => {
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
                      a.aiEnabled ? "Tutor available" : null,
                      nb ? `Edited ${relativeTime(nb.updatedAt)}` : "Not started",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="app-list__meta">
                  <Button variant={nb ? "subtle" : "primary"} size="sm" href={`${base}/assignment/${a.id}`}>
                    {nb ? "Continue" : "Start"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="app-agents__bar code-home__scratch">
        <span className="mono-label">Your notebooks</span>
        <span className="app-page__actions">
          <Button variant="subtle" icon={<PlusIcon size={16} />} onClick={() => void onNew()} disabled={busy}>
            New notebook
          </Button>
        </span>
      </div>
      {notebooks === null ? null : scratch.length === 0 ? (
        <p className="app-empty">
          A scratch notebook is yours to experiment in. It isn't submitted
          anywhere, and it has no tutor.
        </p>
      ) : (
        <div className="app-list">
          {scratch.map((n) => (
            <div className="app-list__row" key={n.id}>
              <span className="app-papers__ic" aria-hidden>
                <DocIcon size={18} />
              </span>
              <div className="app-list__main">
                <div className="app-list__title">
                  <Link to={`${base}/${n.id}`}>{n.title}</Link>
                </div>
                <div className="app-list__sub">Edited {relativeTime(n.updatedAt)}</div>
              </div>
              <div className="app-list__meta">
                <Button variant="subtle" size="sm" href={`${base}/${n.id}`}>
                  Open
                </Button>
                <IconButton variant="ghost" size="sm" title="Delete notebook" onClick={() => void onDelete(n)}>
                  <TrashIcon size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}

function CodeGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
    </svg>
  );
}
