// List of the signed-in student's provenance documents in the active course.
// Course resolution comes from useActiveCourse() (the /write surface lives
// outside <CourseLayout>); chrome comes from <StandalonePage>.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useActiveCourse } from "../../../course/useActiveCourse.js";
import { StandalonePage } from "../../../course/StandalonePage.js";
import { relativeTime } from "../../../time.js";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  type DocumentSummary,
} from "../api.js";

export function DocumentListPage() {
  const navigate = useNavigate();
  const { active, enrollments, setCourseId, loading, notEnrolled } = useActiveCourse();
  const courseId = active?.courseId ?? null;

  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!courseId) return;
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

  async function onCreate() {
    if (!courseId) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await createDocument(courseId);
      navigate(`/write/${doc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!courseId) return;
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      await deleteDocument(courseId, id);
      setDocs((cur) => (cur ?? []).filter((d) => d.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const actions = (
    <>
      <Link to="/write/agents" className="link-button subtle">My agents</Link>
      <Link to="/" className="link-button subtle">Home</Link>
      <button
        type="button"
        className="link-button"
        onClick={onCreate}
        disabled={busy || !courseId}
      >
        New document
      </button>
    </>
  );

  return (
    <StandalonePage
      title="Writing"
      actions={actions}
      course={{ active, enrollments, onSwitch: setCourseId }}
      note="A writing space that records the origin of every word — typed, pasted, or pulled from a chat agent — so you and your instructor can have an honest conversation about how a piece came together."
    >
      {error && <p className="error">{error}</p>}

      {loading && <p className="muted">Loading…</p>}

      {notEnrolled && (
        <p className="muted">
          You aren't enrolled in any course yet. Use a join code on the{" "}
          <Link to="/">home page</Link> to get started.
        </p>
      )}

      {courseId && docs === null && <p className="muted">Loading…</p>}
      {courseId && docs !== null && docs.length === 0 && (
        <p className="muted">No documents yet. Start one to begin writing.</p>
      )}
      {courseId && docs !== null && docs.length > 0 && (
        <ul className="assignment-list">
          {docs.map((d) => (
            <li key={d.id}>
              <div>
                <Link to={`/write/${d.id}`} className="prov-doc-row-link">
                  <strong>{d.title}</strong>
                </Link>
                <div className="muted small">
                  {d.wordCount.toLocaleString()} word{d.wordCount === 1 ? "" : "s"}
                  {" · "}
                  {relativeTime(d.updatedAt)}
                </div>
              </div>
              <div className="row-actions">
                <Link to={`/write/${d.id}`} className="link-button subtle">Open</Link>
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => onDelete(d.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </StandalonePage>
  );
}
