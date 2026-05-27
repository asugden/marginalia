// Per-document editor page. Loads the document, renders the editor,
// debounces saves of the doc body, and (slice 2) buffers + flushes
// provenance events to the worker on a separate cadence.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { JSONContent } from "@tiptap/react";
import { DEMO_COURSE } from "../../../course.js";
import {
  getDocument,
  postEvents,
  updateDocument,
  type DocumentDTO,
  type OutboundEvent,
} from "../api.js";
import { ProvenanceEditor, type EditorChange } from "./Editor.js";
import type { TrackedEvent } from "./ProvenanceTracker.js";
import { ChatPanel } from "./ChatPanel.js";

const SAVE_DEBOUNCE_MS = 1_000;
const EVENTS_FLUSH_MS = 3_000;
const EVENTS_FLUSH_AT_COUNT = 50;
const EMPTY_DOC: JSONContent = { type: "doc", content: [] };

type SaveState = "idle" | "saving" | "saved" | "error";

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [chatOpen, setChatOpen] = useState(true);

  // ── Doc-body autosave (slice 1) ───────────────────────────────────────
  const pendingSaveRef = useRef<{
    title?: string;
    bodyJson?: JSONContent;
    wordCount?: number;
    charCount?: number;
  }>({});
  const saveTimerRef = useRef<number | null>(null);

  // ── Event buffer (slice 2) ────────────────────────────────────────────
  // clientSeqRef is a monotonic per-document counter. Initialised to the
  // current wall clock so a freshly-opened doc never collides with the
  // server's existing max — and even a clock-jump on the client just
  // produces a larger seq, which appendEvents already accepts.
  const clientSeqRef = useRef<number>(Date.now());
  const eventBufRef = useRef<OutboundEvent[]>([]);
  const eventTimerRef = useRef<number | null>(null);
  const eventInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    getDocument(DEMO_COURSE, id, ctrl.signal)
      .then((d) => {
        setDoc(d);
        setTitleDraft(d.title);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Load failed"));
    return () => ctrl.abort();
  }, [id]);

  // ── Save body / title ────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!id) return;
    const patch = pendingSaveRef.current;
    pendingSaveRef.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaveState("saving");
    try {
      const updated = await updateDocument(id, {
        courseId: DEMO_COURSE,
        ...patch,
      });
      setDoc(updated);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      console.warn("Save failed:", e);
    }
  }, [id]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  // ── Flush event buffer ────────────────────────────────────────────────
  const flushEvents = useCallback(async () => {
    if (!id) return;
    if (eventBufRef.current.length === 0) return;
    // Serialise flushes — if one is already in flight, await it before
    // sending another so client_seq ordering is preserved on the wire.
    if (eventInFlightRef.current) {
      try {
        await eventInFlightRef.current;
      } catch {
        /* the prior flush logs its own error */
      }
    }
    const batch = eventBufRef.current;
    eventBufRef.current = [];
    const send = (async () => {
      try {
        await postEvents(id, DEMO_COURSE, batch);
      } catch (e) {
        console.warn("Event flush failed:", e);
        // Best-effort retry: prepend back so order is preserved. If we
        // keep failing, eventually the next user keystroke will retry.
        eventBufRef.current = batch.concat(eventBufRef.current);
      }
    })();
    eventInFlightRef.current = send;
    try {
      await send;
    } finally {
      if (eventInFlightRef.current === send) {
        eventInFlightRef.current = null;
      }
    }
  }, [id]);

  const scheduleEventsFlush = useCallback(() => {
    if (eventBufRef.current.length >= EVENTS_FLUSH_AT_COUNT) {
      if (eventTimerRef.current !== null) {
        window.clearTimeout(eventTimerRef.current);
        eventTimerRef.current = null;
      }
      void flushEvents();
      return;
    }
    if (eventTimerRef.current !== null) return;
    eventTimerRef.current = window.setTimeout(() => {
      eventTimerRef.current = null;
      void flushEvents();
    }, EVENTS_FLUSH_MS);
  }, [flushEvents]);

  // Flush on tab hide and on unmount so a quick close doesn't drop edits.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flushSave();
        void flushEvents();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      if (eventTimerRef.current !== null) window.clearTimeout(eventTimerRef.current);
      void flushSave();
      void flushEvents();
    };
  }, [flushSave, flushEvents]);

  function onEditorChange(change: EditorChange) {
    pendingSaveRef.current.bodyJson = change.bodyJson;
    pendingSaveRef.current.wordCount = change.wordCount;
    pendingSaveRef.current.charCount = change.charCount;
    scheduleSave();
  }

  function onEditorEvents(events: TrackedEvent[]) {
    for (const ev of events) {
      const outbound: OutboundEvent = {
        clientSeq: ++clientSeqRef.current,
        kind: ev.kind,
        offset: ev.offset,
        length: ev.length,
      };
      if (ev.text) outbound.text = ev.text;
      if (ev.origin) outbound.origin = ev.origin;
      if (ev.timingGapsMs && ev.timingGapsMs.length > 0) {
        outbound.timingBlob = JSON.stringify({ gapsMs: ev.timingGapsMs });
      }
      eventBufRef.current.push(outbound);
    }
    scheduleEventsFlush();
  }

  function onTitleChange(value: string) {
    setTitleDraft(value);
    pendingSaveRef.current.title = value;
    scheduleSave();
  }

  if (loadError) {
    return (
      <main className="page provenance-editor-page">
        <p className="error">{loadError}</p>
        <p>
          <Link to="/write">← Back to documents</Link>
        </p>
      </main>
    );
  }

  if (!doc) {
    return (
      <main className="page provenance-editor-page">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className={`page provenance-editor-page${chatOpen ? " chat-open" : ""}`}>
      <header className="provenance-editor-header">
        <Link to="/write" className="provenance-back">
          ← Documents
        </Link>
        <input
          className="provenance-title"
          value={titleDraft}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Document title"
        />
        <span className={`provenance-save-state save-${saveState}`}>
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && "Save failed"}
        </span>
        <button
          type="button"
          className="provenance-chat-toggle"
          onClick={() => setChatOpen((v) => !v)}
          aria-label={chatOpen ? "Hide chat" : "Show chat"}
        >
          {chatOpen ? "Hide chat" : "Show chat"}
        </button>
      </header>

      <div className="provenance-editor-layout">
        <ProvenanceEditor
          initialContent={(doc.bodyJson as JSONContent | undefined) ?? EMPTY_DOC}
          onChange={onEditorChange}
          onEvents={onEditorEvents}
        />
        {chatOpen && doc && (
          <ChatPanel
            documentId={doc.id}
            // Slice 4 will wire this to actually insert into the editor with
            // origin="llm" and a source_message_id link. For now we no-op so
            // the button shows up but doesn't pretend to do something.
            onInsertAtCursor={(_text, _sourceMessageId) => {
              // intentional no-op until slice 4
            }}
          />
        )}
      </div>
    </main>
  );
}
