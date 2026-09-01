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

import type { Editor, JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  PreviewBanner,
  StudentModuleNav,
  Wordmark,
} from "../../../components/index.js";
import { useActiveCourse } from "../../../course/useActiveCourse.js";
import { GearIcon, KeyIcon, ShareIcon } from "../../../icons.js";
import {
  getDocument,
  isAuthError,
  postEvents,
  redirectToLogin,
  setProvenanceHideMarks,
  updateDocument,
  type DocumentDTO,
  type OutboundEvent,
} from "../api.js";
import { ChatPanel } from "./ChatPanel.js";
import { ProvenanceEditor, type EditorChange } from "./Editor.js";
import type { TrackedEvent } from "./ProvenanceTracker.js";
import { SubmissionModal } from "./SubmissionModal.js";
import { maskKey, useByoKey } from "./useByoKey.js";

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
  const { id, courseId: courseParam } = useParams<{ id: string; courseId: string }>();
  // The editor is a standalone full-screen surface (its own prov-shell chrome,
  // not nested under StudentLayout), so it resolves its own course from the
  // /course/:courseId/writing/:id URL rather than useCourse().
  const { active, actingAsStudent } = useActiveCourse(courseParam ?? null);
  const courseId = active?.courseId ?? null;
  const writeBase = `/course/${courseParam}/writing`;
  // "Preview as student" — the instructor wants to see this course exactly as a
  // student does, hidden marks and all. There are two ways it turns on:
  //   1. The session-scoped act-as-student downgrade (RoleSwitch / "Preview as
  //      student"). This is the intuitive path and the source of truth: while
  //      it's set, /api/me already reports the caller's role as `student`.
  //   2. Legacy `?preview=1` on the URL, kept working for older links.
  // Either makes `previewing` true. We do NOT depend on the role alone, so the
  // editor behaves identically however the instructor arrived.
  const [searchParams] = useSearchParams();
  const previewing = actingAsStudent || searchParams.get("preview") === "1";
  // "Working as an instructor" = an instructor who is NOT previewing. Because
  // the act-as-student downgrade reports role as `student`, an instructor in
  // preview reads role !== "instructor" — which is exactly right: they should
  // get the student experience. So this is only true when genuinely authoring.
  const isInstructor = active?.role === "instructor" && !previewing;
  const provenanceEnabled = active?.provenanceEnabled ?? true;
  const agentsEnabled = active?.agentsEnabled ?? true;

  // "Hide marks from students" — the persisted course setting (display-only;
  // recording is unaffected). Seeded from /api/me; an instructor flips it with
  // the header toggle.
  const [hideMarksSetting, setHideMarksSetting] = useState<boolean>(
    active?.hideProvenanceMarks ?? false,
  );
  useEffect(() => {
    setHideMarksSetting(active?.hideProvenanceMarks ?? false);
  }, [active?.hideProvenanceMarks]);
  const [savingHideMarks, setSavingHideMarks] = useState(false);
  // Coloring is **never** shown to a student while they write. Watching your own
  // prose get color-coded in real time is a surveillance experience, and it
  // pushes students to write for the marks rather than for the assignment — so
  // the student surface has no coloring and no control over it. Recording is
  // untouched, and the submission render (slice 6) is computed server-side from
  // the event log, so instructor review and the public viewer still show origins.
  //   • Instructor, "Marks shown"  → coloring on (authoring/review view).
  //   • Instructor, "Marks hidden" → coloring off — a way to read the draft plain.
  //   • Student / acting-as-student → never colored, whatever the setting says.
  const hideMarksForEditor = hideMarksSetting || !isInstructor;
  const [doc, setDoc] = useState<DocumentDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [chatOpen, setChatOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [split, setSplit] = useState<number>(() => loadSplit());

  // Bring-your-own LLM key. Managed here (in the document top bar's Settings
  // popup) rather than inside the chat panel, but consumed by the chat: the
  // key value rides down to ChatPanel and is attached per chat request.
  const byo = useByoKey();

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
        // This route is standalone (not a StudentLayout child), so there is no
        // sibling request to bounce a lapsed session for us — do it here or
        // the student stares at the word "Unauthorized".
        if (isAuthError(e)) {
          redirectToLogin();
          return;
        }
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
      // A 401 means every subsequent save fails too. Silently leaving the
      // student typing into a document that can no longer be saved loses
      // their work; send them to sign in so the session is restored.
      if (isAuthError(e)) redirectToLogin();
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
        // Re-queueing against a lapsed session retries forever and never
        // succeeds; sign in again instead of growing the buffer unboundedly.
        if (isAuthError(e)) {
          redirectToLogin();
          return;
        }
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
      if (ev.removedOrigins) outbound.removedOrigins = ev.removedOrigins;
      if (ev.restoredOrigins) outbound.restoredOrigins = ev.restoredOrigins;
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
      <div className="ds-staff">
        <header className="ds-staff-top">
          <Link to={writeBase} aria-label="Back to documents">
            <Wordmark size="sm" />
          </Link>
          <span className="ds-staff-top__role">Provenance</span>
        </header>
        <div className="ds-staff-page">
          <p className="error">{loadError}</p>
          <Button variant="subtle" href={writeBase}>
            Go to documents
          </Button>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="ds-staff">
        <header className="ds-staff-top">
          <Link to={writeBase} aria-label="Back to documents">
            <Wordmark size="sm" />
          </Link>
          <span className="ds-staff-top__role">Provenance</span>
        </header>
        <div className="ds-staff-page">
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
      {/* App module-nav strip — the same lockup + Agents/Writing nav the rest
          of the student surface carries, so a writer can jump back to the course
          home / Agents. The editor's own title/toggle bar sits below it. */}
      {courseParam && (
        <header className="app-topbar app-topbar--student prov-appbar">
          <div className="app-topbar__inner">
            <StudentModuleNav
              courseId={courseParam}
              provenanceEnabled={provenanceEnabled}
              agentsEnabled={agentsEnabled}
              activeModule="writing"
            />
            <div className="app-topbar__spacer" />
          </div>
        </header>
      )}
      {/* When an instructor is previewing as a student, the editor is otherwise
          a full-screen surface with no role switch — so mirror StudentLayout's
          banner here to (a) make the preview state obvious and (b) give a
          one-click way out that clears the act-as-student downgrade. */}
      {previewing && courseId && (
        <PreviewBanner courseId={courseId} courseName={active?.courseName ?? ""} />
      )}
      <header className="prov-shell-header">
        <Link to={writeBase} aria-label="Back to documents">
          <span className="prov-shell-role">Provenance</span>
        </Link>
        {/* No explicit back button — the lockup above and this Provenance link
            both return toward the course / documents list. */}
        <input
          className="prov-shell-title"
          value={titleDraft}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Document title"
          placeholder="Untitled"
        />
        <SaveStatus state={saveState} />
        {/* The marks toggle is an instructor-only view control — it changes what
            THIS reader sees, not what students see (students are never shown
            coloring). `isInstructor` is already false while previewing as a
            student, so it's hidden there, which is the point of preview. */}
        {isInstructor && (
          <button
            type="button"
            className={"prov-toggle" + (hideMarksSetting ? "" : " is-on")}
            onClick={onToggleHideMarks}
            disabled={savingHideMarks}
            aria-pressed={!hideMarksSetting}
            title="Show or hide origin coloring in your own view. Students never see coloring while writing, and recording is unaffected either way."
          >
            <span className="prov-toggle__sw" />
            {hideMarksSetting ? "Marks hidden" : "Marks shown"}
          </button>
        )}
        {/* "Submit", not "Share": the snapshot goes to the course's instructors
            and to nobody else, so share framing sent students looking for a link
            to hand out that they can't use. */}
        <Button variant="subtle" size="sm" icon={<ShareIcon size={16} />} onClick={() => setShareOpen(true)}>
          Submit
        </Button>
        {/* Chat settings (currently the bring-your-own-key control). Only shown
            while the chat pane is open, since that's the only thing it affects.
            A dot on the gear signals a personal key is in effect. */}
        {chatOpen && (
          <IconButton
            title={byo.active ? "Chat settings — using your own key" : "Chat settings"}
            className={"prov-settings-gear" + (byo.active ? " is-active" : "")}
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon size={18} />
          </IconButton>
        )}
        <button
          type="button"
          className={"prov-toggle" + (chatOpen ? " is-on" : "")}
          onClick={() => setChatOpen((v) => !v)}
          aria-pressed={chatOpen}
          title="Show or hide the LLM chat pane"
        >
          <span className="prov-toggle__sw" />
          {chatOpen ? "Chat on" : "Chat off"}
        </button>
      </header>

      {shareOpen && courseId && (
        <SubmissionModal
          documentId={doc.id}
          courseId={courseId}
          canRevoke={isInstructor}
          onClose={() => setShareOpen(false)}
        />
      )}

      {settingsOpen && (
        <ChatSettingsModal byo={byo} onClose={() => setSettingsOpen(false)} />
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
                byoKey={byo.key}
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

// Chat settings popup, launched from the gear in the document top bar.
// Currently houses only the bring-your-own-key control; kept as its own
// modal so more chat-scoped settings can join it later.
function ChatSettingsModal({
  byo,
  onClose,
}: {
  byo: ReturnType<typeof useByoKey>;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  function save() {
    if (!value.trim()) return;
    byo.setKey(value);
    setValue("");
    onClose();
  }

  return (
    <Modal title="Chat settings" onClose={onClose} maxWidth="30rem">
      <h2 className="ds-modal-title">Chat Settings</h2>

      <section className="prov-settings-section">
        <h3 className="prov-settings-section-title">
          <KeyIcon size={16} />
          Use your own LLM key
        </h3>
        <p className="ds-modal-body byo-key-body">
          Paste your own provider API key and the chat will use it instead of
          your institution's. Your key is stored only in this browser and is
          sent only with each chat request — it is never saved on the server.
        </p>

        {byo.active ? (
          <div className="prov-settings-current">
            <span className="muted small">Current key</span>
            <code>{maskKey(byo.key!)}</code>
          </div>
        ) : null}

        <Field label={byo.active ? "Replace with a new key" : "API key"}>
          <Input
            mono
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-…"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); save(); }
            }}
          />
        </Field>

        <div className="ds-modal-actions">
          {byo.active && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => { byo.clear(); onClose(); }}
            >
              Stop using my key
            </Button>
          )}
          <span className="ds-modal-actions-spacer" />
          <Button variant="subtle" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!value.trim()}>
            Save key
          </Button>
        </div>
      </section>
    </Modal>
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
