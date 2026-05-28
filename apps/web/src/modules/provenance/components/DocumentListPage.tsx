// List of the signed-in student's provenance documents in the current course.
// Visual shell matches the AuthorListPage staff-register style so the writing
// tool reads as part of the same app, not a bolt-on.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEMO_COURSE } from "../../../course.js";
import { relativeTime } from "../../../time.js";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  type DocumentSummary,
} from "../api.js";

export function DocumentListPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    listDocuments(DEMO_COURSE, ctrl.signal)
      .then(setDocs)
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, []);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const doc = await createDocument(DEMO_COURSE);
      navigate(`/write/${doc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      await deleteDocument(DEMO_COURSE, id);
      setDocs((cur) => (cur ?? []).filter((d) => d.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>Writing</h1>
          <div className="header-actions">
            <Link to="/write/agents" className="link-button subtle">My agents</Link>
            <Link to="/" className="link-button subtle">Home</Link>
            <button
              type="button"
              className="link-button"
              onClick={onCreate}
              disabled={busy}
            >
              New document
            </button>
          </div>
        </header>

        <p className="scope-note">
          A writing space that records the origin of every word — typed,
          pasted, or pulled from a chat agent — so you and your instructor
          can have an honest conversation about how a piece came together.
        </p>

        {error && <p className="error">{error}</p>}

        {docs === null && <p className="muted">Loading…</p>}
        {docs !== null && docs.length === 0 && (
          <p className="muted">No documents yet. Start one to begin writing.</p>
        )}
        {docs !== null && docs.length > 0 && (
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
      </div>
    </div>
  );
}
