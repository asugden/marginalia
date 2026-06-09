// Per-document editor page. Loads the document, renders the editor,
// debounces saves of the doc body, and buffers provenance events on a
// separate flush cadence.
//
// Layout (chat-open):
//   ┌────────────────────────────────────────────────────────────────┐
//   │ sticky header: ← Documents · {title} · {saved} · [Hide chat]   │
//   ├──────────────────────────────────┬─┬───────────────────────────┤
//   │                                  │ │                           │
//   │  editor (Tiptap)                 │ │  chat panel               │
//   │                                  │ │                           │
//   ├──────────────────────────────────┴─┴───────────────────────────┤
//
// The divider between editor and chat is draggable. Persist the chosen
// ratio in localStorage so it sticks across reloads.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Editor, JSONContent } from "@tiptap/react";
import { useActiveCourse } from "../../../course/useActiveCourse.js";
import {
  getDocument,
  postEvents,
  setProvenanceHideMarks,
  updateDocument,
  type DocumentDTO,
  type OutboundEvent,
} from "../api.js";
import { ProvenanceEditor, type EditorChange } from "./Editor.js";
import type { TrackedEvent } from "./ProvenanceTracker.js";
import { ChatPanel } from "./ChatPanel.js";
import { SubmissionModal } from "./SubmissionModal.js";

const SAVE_DEBOUNCE_MS = 1_000;
const EVENTS_FLUSH_MS = 3_000;
const EVENTS_FLUSH_AT_COUNT = 50;
const EMPTY_DOC: JSONContent = { type: "doc", content: [] };

// Editor/chat split ratio (editor share of width), bounded so neither
// pane vanishes. Persisted in localStorage under PROV_SPLIT_KEY.
const PROV_SPLIT_KEY = "provenance.editorSplit";
const SPLIT_MIN = 0.32;
const SPLIT_MAX = 0.78;
const SPLIT_DEFAULT = 0.62;

type SaveState = "idle" | "saving" | "saved" | "error";

function loadSplit(): number {
  if (typeof window === "undefined") return SPLIT_DEFAULT;
  const raw = window.localStorage.getItem(PROV_SPLIT_KEY);
  if (!raw) return SPLIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n));
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { active } = useActiveCourse();
  const courseId = active?.courseId ?? null;
  const isInstructor = active?.role === "instructor";

  // "Hide marks from students" (display-only; recording is unaffected).
  // Seeded from /api/me; instructors can flip it live. Students never see
  // coloring while it's on; instructors always see coloring so they can
  // review, and get a toggle to control the student view.
  const [hideMarksSetting, setHideMarksSetting] = useState<boolean>(
    active?.hideProvenanceMarks ?? false,
  );
  useEffect(() => {
    setHideMarksSetting(active?.hideProvenanceMarks ?? false);
  }, [active?.hideProvenanceMarks]);
  const [savingHideMarks, setSavingHideMarks] = useState(false);
  const hideMarksForEditor = hideMarksSetting && !isInstructor;
  const [doc, setDoc] = useState<DocumentDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [chatOpen, setChatOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [split, setSplit] = useState<number>(() => loadSplit());

  // ── Doc-body autosave (slice 1) ───────────────────────────────────────
  const pendingSaveRef = useRef<{
    title?: string;
    bodyJson?: JSONContent;
    wordCount?: number;
    charCount?: number;
  }>({});
  const saveTimerRef = useRef<number | null>(null);

  // ── Event buffer (slice 2) ────────────────────────────────────────────
  const clientSeqRef = useRef<number>(Date.now());
  const eventBufRef = useRef<OutboundEvent[]>([]);
  const eventTimerRef = useRef<number | null>(null);
  const eventInFlightRef = useRef<Promise<void> | null>(null);

  // Slice 4: held so the ChatPanel can call insertLlmText imperatively.
  const editorRef = useRef<Editor | null>(null);
  // Held so the editor's "Reference" action can push a quoted passage into
  // the chat composer imperatively.
  const chatRef = useRef<{ addReference: (text: string) => void } | null>(null);
  const onReference = useCallback((text: string) => {
    chatRef.current?.addReference(text);
  }, []);

  // Split-bar drag state.
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ rect: DOMRect } | null>(null);

  useEffect(() => {
    if (!id || !courseId) return;
    const ctrl = new AbortController();
    getDocument(courseId, id, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setDoc(d);
        setTitleDraft(d.title);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setLoadError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [id, courseId]);

  // ── Save body / title ────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!id || !courseId) return;
    const patch = pendingSaveRef.current;
    pendingSaveRef.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaveState("saving");
    try {
      const updated = await updateDocument(id, {
        courseId,
        ...patch,
      });
      setDoc(updated);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      console.warn("Save failed:", e);
    }
  }, [id, courseId]);

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
    if (!id || !courseId) return;
    if (eventBufRef.current.length === 0) return;
    if (eventInFlightRef.current) {
      try { await eventInFlightRef.current; } catch { /* prior flush logs */ }
    }
    const batch = eventBufRef.current;
    eventBufRef.current = [];
    const send = (async () => {
      try {
        await postEvents(id, courseId, batch);
      } catch (e) {
        console.warn("Event flush failed:", e);
        eventBufRef.current = batch.concat(eventBufRef.current);
      }
    })();
    eventInFlightRef.current = send;
    try { await send; } finally {
      if (eventInFlightRef.current === send) eventInFlightRef.current = null;
    }
  }, [id, courseId]);

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

  // ── Drag-to-resize the editor/chat split ─────────────────────────────
  const onDividerPointerDown = useCallback((ev: React.PointerEvent) => {
    const container = splitContainerRef.current;
    if (!container) return;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    dragRef.current = { rect: container.getBoundingClientRect() };
    document.body.classList.add("prov-dragging");
  }, []);

  const onDividerPointerMove = useCallback((ev: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { rect } = dragRef.current;
    if (rect.width === 0) return;
    const fraction = (ev.clientX - rect.left) / rect.width;
    const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, fraction));
    setSplit(clamped);
  }, []);

  const onDividerPointerUp = useCallback((ev: React.PointerEvent) => {
    if (!dragRef.current) return;
    (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
    dragRef.current = null;
    document.body.classList.remove("prov-dragging");
    window.localStorage.setItem(PROV_SPLIT_KEY, String(split));
  }, [split]);

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

  async function onToggleHideMarks() {
    if (!courseId || savingHideMarks) return;
    const next = !hideMarksSetting;
    setSavingHideMarks(true);
    // Optimistic; revert on failure.
    setHideMarksSetting(next);
    try {
      await setProvenanceHideMarks(courseId, next);
    } catch {
      setHideMarksSetting(!next);
    } finally {
      setSavingHideMarks(false);
    }
  }

  function onTitleChange(value: string) {
    setTitleDraft(value);
    pendingSaveRef.current.title = value;
    scheduleSave();
  }

  if (loadError) {
    return (
      <div className="page staff">
        <div className="staff-frame">
          <p className="error">{loadError}</p>
          <p><Link to="/write" className="link-button subtle">← Back to documents</Link></p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="page staff">
        <div className="staff-frame">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const gridTemplate = chatOpen
    ? `${split}fr 6px ${1 - split}fr`
    : "minmax(0, 1fr)";

  return (
    <div className="prov-shell no-watermark">
      <header className="prov-shell-header">
        <Link to="/write" className="icon-button" title="Back to documents" aria-label="Back to documents">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <input
          className="prov-shell-title"
          value={titleDraft}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Document title"
          placeholder="Untitled"
        />
        <SaveStatus state={saveState} />
        {isInstructor && (
          <button
            type="button"
            className="link-button subtle prov-shell-chat-toggle"
            onClick={onToggleHideMarks}
            disabled={savingHideMarks}
            aria-pressed={hideMarksSetting}
            title="Controls whether students see origin coloring while they write. Recording is unaffected."
          >
            {hideMarksSetting ? "Marks hidden for students" : "Marks shown to students"}
          </button>
        )}
        <button
          type="button"
          className="link-button subtle prov-shell-chat-toggle"
          onClick={() => setShareOpen(true)}
        >
          Share
        </button>
        <button
          type="button"
          className="link-button subtle prov-shell-chat-toggle"
          onClick={() => setChatOpen((v) => !v)}
        >
          {chatOpen ? "Hide chat" : "Open chat"}
        </button>
      </header>

      {shareOpen && courseId && (
        <SubmissionModal
          documentId={doc.id}
          courseId={courseId}
          onClose={() => setShareOpen(false)}
        />
      )}

      <div
        ref={splitContainerRef}
        className={`prov-shell-body${chatOpen ? " chat-open" : ""}`}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <section className="prov-editor-pane">
          <div className="prov-editor-inner">
            <ProvenanceEditor
              initialContent={(doc.bodyJson as JSONContent | undefined) ?? EMPTY_DOC}
              onChange={onEditorChange}
              onEvents={onEditorEvents}
              onEditorReady={(ed) => { editorRef.current = ed; }}
              hideMarks={hideMarksForEditor}
              chatOpen={chatOpen}
              onReference={onReference}
            />
          </div>
        </section>

        {chatOpen && (
          <>
            <div
              className="prov-divider"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor and chat panels"
              onPointerDown={onDividerPointerDown}
              onPointerMove={onDividerPointerMove}
              onPointerUp={onDividerPointerUp}
              onDoubleClick={() => {
                setSplit(SPLIT_DEFAULT);
                window.localStorage.setItem(PROV_SPLIT_KEY, String(SPLIT_DEFAULT));
              }}
            >
              <span className="prov-divider-grip" aria-hidden />
            </div>
            <section className="prov-chat-pane">
              <ChatPanel
                documentId={doc.id}
                courseId={doc.courseId}
                onReady={(api) => { chatRef.current = api; }}
                onInsertAtCursor={(text, sourceMessageId) => {
                  const ed = editorRef.current;
                  if (!ed) return;
                  ed.commands.insertLlmText({ text, sourceMessageId });
                }}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "idle") return <span className="prov-save-state" />;
  const label =
    state === "saving" ? "Saving…" :
    state === "saved" ? "Saved" :
    "Save failed";
  return (
    <span className={`prov-save-state state-${state}`}>
      <span className="prov-save-dot" aria-hidden />
      {label}
    </span>
  );
}
