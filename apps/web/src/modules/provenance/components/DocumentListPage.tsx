// List of the signed-in student's provenance documents in the current course.
// Allows creating a new document and opening / deleting an existing one.

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
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
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
    <main className="page provenance-list">
      <header className="provenance-list-header">
        <h1>Writing</h1>
        <div className="provenance-list-actions">
          <Link to="/write/agents" className="link-button subtle">My Agents</Link>
          <button type="button" onClick={onCreate} disabled={busy}>
            New document
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {docs === null && <p>Loading…</p>}
      {docs !== null && docs.length === 0 && (
        <p className="empty">No documents yet. Start one to begin writing.</p>
      )}
      {docs !== null && docs.length > 0 && (
        <ul className="provenance-doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <Link to={`/write/${d.id}`} className="provenance-doc-link">
                <span className="title">{d.title}</span>
                <span className="meta">
                  {d.wordCount.toLocaleString()} words ·{" "}
                  {relativeTime(d.updatedAt)}
                </span>
              </Link>
              <button
                type="button"
                className="provenance-doc-delete"
                onClick={() => onDelete(d.id)}
                aria-label={`Delete ${d.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
