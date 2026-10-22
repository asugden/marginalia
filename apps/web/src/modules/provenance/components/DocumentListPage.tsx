// The student's writing in this course, at /course/:courseId/writing inside
// StudentLayout — course id / role come from useCourse().
//
// Writing belongs to assignments (migration 0032): each assignment is a row,
// and opening it opens the student's one document for it (created on first
// open). There is no free-standing "New document". Documents written before
// that change have no assignment; they're listed below as earlier writing and
// keep working exactly as before.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import { relativeTime } from "../../../time.js";
import {
  deleteDocument,
  listAssignments,
  listDocuments,
  type AssignmentDTO,
  type DocumentSummary,
} from "../api.js";
import { Button, IconButton, useConfirm } from "../../../components/index.js";
import { DocIcon, TrashIcon } from "../../../icons.js";

export function DocumentListPage() {
  const { courseId, provenanceChatEnabled, writingChatAssignments } = useCourse();
  // Personal agents matter when any writing here offers a chat: a writing
  // assignment with it on, or older documents under the course switch.
  const anyChat = writingChatAssignments > 0 || provenanceChatEnabled;
  const writeBase = `/course/${courseId}/writing`;

  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    setDocs(null);
    const ctrl = new AbortController();
    listDocuments(courseId, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setDocs(d);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  useEffect(() => {
    setAssignments(null);
    const ctrl = new AbortController();
    listAssignments(courseId, undefined, ctrl.signal)
      .then((a) => !ctrl.signal.aborted && setAssignments(a))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  async function onDelete(id: string) {
    if (
      !(await confirm({
        title: "Delete this document?",
        body: "This can't be undone.",
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      await deleteDocument(courseId, id);
      setDocs((cur) => (cur ?? []).filter((d) => d.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="app-home__inner">
      <div className="app-head">
        <span className="eyebrow">Your documents</span>
        <span className="app-rule" />
        <h1>Writing</h1>
        <p className="app-head__sub">
          A writing space that records the origin of every word — typed, pasted,
          or pulled from a chat agent — so you and your instructor can have an
          honest conversation about how a piece came together.
        </p>
      </div>

      <div className="app-agents__bar">
        <span className="mono-label">Your writing assignments</span>
        <span className="app-page__actions">
          {/* No chat, no agents to manage — the whole surface is chat-scoped. */}
          {anyChat && (
            <Button variant="ghost" href={`${writeBase}/agents`}>
              My agents
            </Button>
          )}
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      {docs === null || assignments === null ? (
        <p className="app-empty">Loading…</p>
      ) : assignments.length === 0 ? (
        <p className="app-empty">No writing assignments yet.</p>
      ) : (
        <div className="app-list">
          {assignments.map((a) => {
            const mine = docs.find((d) => d.assignmentId === a.id);
            return (
              <div className="app-list__row" key={a.id}>
                <span className="app-papers__ic" aria-hidden>
                  <DocIcon size={18} />
                </span>
                <div className="app-list__main">
                  <div className="app-list__title">
                    <Link to={`${writeBase}/assignment/${a.id}`}>{a.title}</Link>
                  </div>
                  <div className="app-list__sub">
                    {mine
                      ? `${mine.wordCount.toLocaleString()} word${mine.wordCount === 1 ? "" : "s"} · ${relativeTime(mine.updatedAt)}`
                      : "Not started"}
                  </div>
                </div>
                <div className="app-list__meta">
                  <Button variant="subtle" size="sm" href={`${writeBase}/assignment/${a.id}`}>
                    {mine ? "Open" : "Start"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Writing from before documents belonged to assignments, plus any
          document whose assignment has since been archived. Unchanged:
          open, keep writing, submit as before. */}
      {docs !== null &&
        assignments !== null &&
        docs.some((d) => !assignments.some((a) => a.id === d.assignmentId)) && (
        <>
          <div className="app-agents__bar">
            <span className="mono-label">Earlier writing</span>
          </div>
          <div className="app-list">
          {docs
            .filter((d) => !assignments.some((a) => a.id === d.assignmentId))
            .map((d) => (
            <div className="app-list__row" key={d.id}>
              <span className="app-papers__ic" aria-hidden>
                <DocIcon size={18} />
              </span>
              <div className="app-list__main">
                <div className="app-list__title">
                  <Link to={`${writeBase}/${d.id}`}>{d.title}</Link>
                </div>
                <div className="app-list__sub">
                  {d.wordCount.toLocaleString()} word
                  {d.wordCount === 1 ? "" : "s"} · {relativeTime(d.updatedAt)}
                </div>
              </div>
              <div className="app-list__meta">
                <Button variant="subtle" size="sm" href={`${writeBase}/${d.id}`}>
                  Open
                </Button>
                <IconButton
                  variant="ghost"
                  size="sm"
                  title="Delete document"
                  onClick={() => onDelete(d.id)}
                >
                  <TrashIcon size={16} />
                </IconButton>
              </div>
            </div>
          ))}
          </div>
        </>
      )}
      {confirmDialog}
    </div>
  );
}
