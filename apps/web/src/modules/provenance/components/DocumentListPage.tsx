// List of the signed-in student's provenance documents in the course. Rendered
// as a body page inside StudentLayout at /course/:courseId/write — course id /
// role come from useCourse() (the shell validated enrollment), so there's no
// separate course resolution or switcher here. The writing list IS the student
// preview of provenance: an open place to start a new piece plus the saved
// essays.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
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
  const { courseId } = useCourse();
  const writeBase = `/course/${courseId}/write`;

  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const doc = await createDocument(courseId);
      navigate(`${writeBase}/${doc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;
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
        <span className="eyebrow">Provenance</span>
        <span className="app-rule" />
        <h1>Writing</h1>
        <p className="app-head__sub">
          A writing space that records the origin of every word — typed, pasted,
          or pulled from a chat agent — so you and your instructor can have an
          honest conversation about how a piece came together.
        </p>
      </div>

      <div className="app-agents__bar">
        <span className="mono-label">Your documents</span>
        <span className="app-page__actions">
          <Button variant="ghost" href={`${writeBase}/agents`}>
            My agents
          </Button>
          <Button
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={onCreate}
            disabled={busy}
          >
            New document
          </Button>
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      {docs === null ? (
        <p className="app-empty">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="app-empty">No documents yet. Start one to begin writing.</p>
      ) : (
        <div className="app-list">
          {docs.map((d) => (
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
      )}
    </div>
  );
}
