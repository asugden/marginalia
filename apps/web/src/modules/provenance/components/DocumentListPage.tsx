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
import { Button, IconButton } from "../../../components/index.js";
import { DocIcon, PlusIcon, TrashIcon } from "../../../icons.js";

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
      <Button variant="ghost" href="/write/agents">
        My agents
      </Button>
      <Button variant="ghost" href="/">
        Home
      </Button>
      <Button
        variant="primary"
        icon={<PlusIcon size={16} />}
        onClick={onCreate}
        disabled={busy || !courseId}
      >
        New document
      </Button>
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
        <div className="ds-staff-list">
          {docs.map((d) => (
            <div className="ds-staff-list__row" key={d.id}>
              <span
                className="ds-id__icon"
                style={{ width: 36, height: 36, color: "var(--text-muted)" }}
                aria-hidden
              >
                <DocIcon size={18} />
              </span>
              <div className="ds-staff-list__main">
                <div className="ds-staff-list__title">
                  <Link to={`/write/${d.id}`}>{d.title}</Link>
                </div>
                <div className="ds-staff-list__sub">
                  {d.wordCount.toLocaleString()} word
                  {d.wordCount === 1 ? "" : "s"} · {relativeTime(d.updatedAt)}
                </div>
              </div>
              <div className="ds-staff-list__actions">
                <Button variant="subtle" size="sm" href={`/write/${d.id}`}>
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
      )}
    </StandalonePage>
  );
}
