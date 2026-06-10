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
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  Tag,
  Textarea,
} from "../components/index.js";
import { TrashIcon, UploadIcon } from "../icons.js";

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

  const statusTone = (st: string) =>
    st === "indexed" ? "success" : st === "failed" ? "danger" : "warning";
  const statusLabel = (st: string) =>
    st === "indexed" ? "Indexed" : st === "failed" ? "Failed" : "Pending";

  if (!detail) {
    return (
      <div className="ds-staff-page">
        {error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}
        <Button variant="ghost" href={`/course/${courseId}/instructor/collections`}>
          ← All libraries
        </Button>
      </div>
    );
  }

  const totalChunks = detail.sources.reduce(
    (a, s) => a + (s.status === "indexed" ? s.chunks : 0),
    0,
  );

  return (
    <div className="ds-staff-page">
      <div className="ds-staff-head">
        <div>
          <span className="eyebrow">Instructor · Sources</span>
          <h1>{detail.collection.name}</h1>
          <div className="ds-staff-head__scope">
            {detail.collection.description ||
              "The agent only argues from these documents, and cites them in line so students can check the source."}
          </div>
        </div>
        <div className="ds-staff-actions">
          <Button variant="ghost" href={`/course/${courseId}/instructor/collections`}>
            ← All libraries
          </Button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Add a source</span>
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "upload", label: "Upload" },
            { value: "url", label: "From URL" },
            { value: "paste", label: "Paste text" },
          ]}
        />

        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {tab === "upload" && (
            <>
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
            </>
          )}

          {tab === "url" && (
            <>
              <p className="muted small">
                Paste any http(s) URL. The page is fetched, the main content
                extracted (HTML pages run through Readability), and indexed.
                PDFs aren&rsquo;t fetched from URLs — upload them directly.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Field label="URL">
                    <Input
                      type="url"
                      placeholder="https://…"
                      value={urlInput}
                      disabled={busy}
                      onChange={(e) => setUrlInput(e.target.value)}
                    />
                  </Field>
                </div>
                <Button
                  variant="primary"
                  onClick={onAddUrl}
                  loading={busy}
                  disabled={busy || !urlInput.trim()}
                >
                  Add
                </Button>
              </div>
            </>
          )}

          {tab === "paste" && (
            <>
              <p className="muted small">
                Paste markdown or plain text. Stored alongside other sources.
              </p>
              <Field label="Title (optional)">
                <Input
                  type="text"
                  value={pasteTitle}
                  disabled={busy}
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
              </Field>
              <Field label="Content">
                <Textarea
                  rows={8}
                  value={pasteBody}
                  disabled={busy}
                  onChange={(e) => setPasteBody(e.target.value)}
                />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="primary"
                  icon={<UploadIcon size={16} />}
                  onClick={onPaste}
                  loading={busy}
                  disabled={busy || !pasteBody.trim()}
                >
                  Add
                </Button>
              </div>
            </>
          )}

          {busy && <p className="muted small">Indexing… this can take a moment.</p>}
        </div>
      </div>

      <div className="ds-staff-section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.7rem",
          }}
        >
          <span className="mono-label">
            Library · {detail.sources.length} document
            {detail.sources.length === 1 ? "" : "s"}
          </span>
          {totalChunks > 0 && (
            <span className="mono-label">{totalChunks} chunks indexed</span>
          )}
        </div>

        {detail.sources.length === 0 ? (
          <p className="muted">No sources yet.</p>
        ) : (
          <div className="ds-src-list">
            {detail.sources.map((s) => (
              <div className="ds-src-row" key={s.id}>
                <Tag kind={s.kind}>{kindLabel(s.kind)}</Tag>
                <span className="ds-src-row__name">
                  {s.filename}
                  {s.sourceUrl && (
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="muted small"
                      style={{ marginLeft: "0.5rem" }}
                    >
                      ↗
                    </a>
                  )}
                  {s.status === "failed" && s.error && (
                    <span className="error small"> · {s.error}</span>
                  )}
                </span>
                <span className="ds-src-row__chunks">
                  {humanBytes(s.byteSize)}
                  {s.status === "indexed" ? ` · ${s.chunks} chunks` : ""}
                  {s.kind === "url" && s.fetchedAt !== null
                    ? ` · fetched ${relativeTime(s.fetchedAt)}`
                    : ""}
                </span>
                <Badge tone={statusTone(s.status)} dot>
                  {statusLabel(s.status)}
                </Badge>
                {s.kind === "url" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onRefresh(s.id)}
                    title="Re-fetch this URL and re-index"
                  >
                    Refresh
                  </Button>
                )}
                <IconButton
                  variant="ghost"
                  size="sm"
                  title="Remove source from this collection"
                  disabled={busy}
                  onClick={() => onRemoveSource(s.id, s.filename)}
                >
                  <TrashIcon size={16} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
