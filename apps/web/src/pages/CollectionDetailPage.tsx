// One collection: upload PDFs, see each source's indexing status. The upload
// call is synchronous from the UI's perspective — the Worker returns once
// indexing finishes (success or failure). When indexing moves onto a Queue
// consumer we'll add a poll loop here instead.

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addCollectionUrlSource,
  deleteCollectionSource,
  getCollection,
  refreshCollectionSource,
  uploadCollectionSource,
  type CollectionDetail,
  type CollectionSourceKind,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { relativeTime } from "../time.js";

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(k: CollectionSourceKind): string {
  switch (k) {
    case "pdf": return "PDF";
    case "markdown": return "Markdown";
    case "text": return "Text";
    case "url": return "URL";
  }
}

type Tab = "upload" | "url" | "paste";

export function CollectionDetailPage() {
  const { courseId } = useCourse();
  const { id: collectionId } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("upload");
  const [busy, setBusy] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    if (!collectionId) return;
    setError(null);
    getCollection(courseId, collectionId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [collectionId, courseId]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !collectionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await uploadCollectionSource(courseId, collectionId, file);
      if (res.status === "failed") setError(res.error ?? "Indexing failed");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onAddUrl() {
    if (!collectionId || !urlInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await addCollectionUrlSource(courseId, collectionId, urlInput.trim());
      if (res.status === "failed") setError(res.error ?? "Indexing failed");
      setUrlInput("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPaste() {
    if (!collectionId || !pasteBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Synthetic .txt upload: reuses the same multipart endpoint as a file pick,
      // so the server treats paste-text and uploaded .txt identically.
      const base = (pasteTitle.trim() || "pasted") + ".txt";
      const file = new File([pasteBody], base, { type: "text/plain" });
      const res = await uploadCollectionSource(courseId, collectionId, file);
      if (res.status === "failed") setError(res.error ?? "Indexing failed");
      setPasteTitle("");
      setPasteBody("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paste failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh(sourceId: string) {
    if (!collectionId) return;
    setBusy(true);
    setError(null);
    try {
      await refreshCollectionSource(courseId, collectionId, sourceId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  // v0.7 §3.4 — remove a source from this collection. Past conversations
  // that cited it keep rendering via the message_sources snapshot columns
  // (filename + page text); the live source_id FK is nulled.
  async function onRemoveSource(sourceId: string, filename: string) {
    if (!collectionId) return;
    if (
      !window.confirm(
        `Remove "${filename}" from this collection? Past conversation ` +
          `citations to this source keep working but new chats will no ` +
          `longer retrieve from it.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteCollectionSource(courseId, collectionId, sourceId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <section>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="muted">Loading…</p>
        )}
        <Link to={`/course/${courseId}/collections`} className="link-button subtle">
          ← All libraries
        </Link>
      </section>
    );
  }

  return (
    <section>
      <header className="sub-header">
        <h2>{detail.collection.name}</h2>
        <Link to={`/course/${courseId}/collections`} className="link-button subtle">
          ← All libraries
        </Link>
      </header>
      {detail.collection.description && (
        <p className="muted">{detail.collection.description}</p>
      )}

        {error && <p className="error">{error}</p>}

        <section className="field-group">
          <h2>Add a source</h2>
          <div className="tab-row" role="tablist">
            {(["upload", "url", "paste"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`tab-button${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
                type="button"
              >
                {t === "upload" ? "Upload" : t === "url" ? "From URL" : "Paste text"}
              </button>
            ))}
          </div>

          {tab === "upload" && (
            <div className="tab-panel">
              <p className="muted small">
                .pdf, .md, or .txt. Each file is chunked (~500 tokens, 50
                overlap), embedded, and indexed.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
                disabled={busy}
                onChange={onPick}
              />
            </div>
          )}

          {tab === "url" && (
            <div className="tab-panel">
              <p className="muted small">
                Paste any http(s) URL. The page is fetched, the main content
                extracted (HTML pages run through Readability), and indexed.
                PDFs aren't fetched from URLs — upload them directly.
              </p>
              <div className="inline-form">
                <input
                  type="url"
                  placeholder="https://…"
                  value={urlInput}
                  disabled={busy}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <button onClick={onAddUrl} disabled={busy || !urlInput.trim()}>
                  {busy ? "Fetching…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {tab === "paste" && (
            <div className="tab-panel">
              <p className="muted small">
                Paste markdown or plain text. Stored alongside other sources.
              </p>
              <label className="field">
                <span className="field-label">Title (optional)</span>
                <input
                  type="text"
                  value={pasteTitle}
                  disabled={busy}
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Content</span>
                <textarea
                  rows={8}
                  value={pasteBody}
                  disabled={busy}
                  onChange={(e) => setPasteBody(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button onClick={onPaste} disabled={busy || !pasteBody.trim()}>
                  {busy ? "Indexing…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {busy && <p className="muted small">Indexing… this can take a moment.</p>}
        </section>

        <section className="field-group">
          <h2>Sources</h2>
          {detail.sources.length === 0 ? (
            <p className="muted">No sources yet.</p>
          ) : (
            <ul className="assignment-list">
              {detail.sources.map((s) => (
                <li key={s.id}>
                  <div>
                    <span className={`kind-chip kind-${s.kind}`}>{kindLabel(s.kind)}</span>{" "}
                    <strong>{s.filename}</strong>
                    <span className="muted small">
                      {" "}· {humanBytes(s.byteSize)}
                      {s.status === "indexed" && ` · ${s.chunks} chunks`}
                    </span>
                    {s.sourceUrl && (
                      <div className="muted small">
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {s.sourceUrl}
                        </a>
                        {s.fetchedAt !== null && (
                          <> · fetched {relativeTime(s.fetchedAt)}</>
                        )}
                      </div>
                    )}
                    {s.status === "failed" && s.error && (
                      <div className="error small">{s.error}</div>
                    )}
                  </div>
                  <div className="row-actions">
                    {s.kind === "url" && (
                      <button
                        type="button"
                        className="link-button subtle"
                        disabled={busy}
                        onClick={() => onRefresh(s.id)}
                        title="Re-fetch this URL and re-index"
                      >
                        Refresh
                      </button>
                    )}
                    <span className={`status-badge status-${s.status}`}>
                      {s.status}
                    </span>
                    <button
                      type="button"
                      className="danger-link"
                      disabled={busy}
                      onClick={() => onRemoveSource(s.id, s.filename)}
                      title="Remove source from this collection"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
    </section>
  );
}
