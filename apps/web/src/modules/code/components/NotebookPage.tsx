// The notebook: a full-screen working surface like the writing editor.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ student module nav                                               │
//   │ Code · {title} · {saved} · {python status} · Run all · … · Submit │
//   ├───────────────────────────────────────┬─┬────────────────────────┤
//   │ assignment instructions (collapsible) │ │  Tutor | Files          │
//   │ cells                                 │ │                        │
//   └───────────────────────────────────────┴─┴────────────────────────┘
//
// Two modes share this page:
//   student — the caller's own notebook (an assignment's, or scratch).
//   starter — an instructor editing an assignment's starter notebook; saves
//             to the assignment, no tutor, no submit.
//
// Python runs in a worker in this tab (see ../kernel). The page saves the
// notebook — cells and outputs — to the server on a debounce, and never
// sends uploaded files anywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { EditorView } from "@codemirror/view";
import {
  Button,
  PreviewBanner,
  StudentModuleNav,
  useConfirm,
  Wordmark,
} from "../../../components/index.js";
import { useActiveCourse } from "../../../course/useActiveCourse.js";
import { Markdown } from "../../../Markdown.js";
import { relativeTime } from "../../../time.js";
import {
  ApiError,
  getAssignment,
  isAuthError,
  listMySubmissions,
  openNotebook,
  getNotebook,
  redirectToLogin,
  saveNotebook,
  submitNotebook,
  updateAssignment,
  type Cell,
  type CellOutput,
  type CellType,
  type NotebookContent,
} from "../api.js";
import { listStoredFiles } from "../kernel/files.js";
import { Kernel, type KernelStatus } from "../kernel/kernel.js";
import { Cells, newCellId, type RunState } from "./Cells.js";
import { FilesPanel } from "./FilesPanel.js";
import { appendOutput } from "./Outputs.js";
import { TutorPanel } from "./TutorPanel.js";

const SAVE_DEBOUNCE_MS = 1_200;
/** Keep a save comfortably under the server's cap (which sits under D1's). */
const SAVE_BUDGET_BYTES = 1_600_000;
const SPLIT_KEY = "code.notebookSplit";
const SPLIT_MIN = 0.4;
const SPLIT_MAX = 0.8;
const SPLIT_DEFAULT = 0.66;

type SaveState = "idle" | "saving" | "saved" | "error";
type SidePane = "tutor" | "files" | null;

interface Loaded {
  mode: "student" | "starter";
  /** Notebook id (student) or assignment id (starter). */
  id: string;
  courseId: string;
  title: string;
  content: NotebookContent;
  aiEnabled: boolean;
  assignment: { title: string; instructions: string; dueAt: number | null } | null;
  isAssignment: boolean;
}

function loadSplit(): number {
  try {
    const n = Number(window.localStorage.getItem(SPLIT_KEY));
    return Number.isFinite(n) && n > 0 ? Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n)) : SPLIT_DEFAULT;
  } catch {
    return SPLIT_DEFAULT;
  }
}

/**
 * Shrink a notebook to fit one save. Figures dominate size, so they go first
 * — oldest cells' figures before newer ones — each replaced by a one-line
 * note. Code and text are never dropped.
 */
export function fitForSave(content: NotebookContent): { content: NotebookContent; trimmed: boolean } {
  const size = (c: NotebookContent) => new TextEncoder().encode(JSON.stringify(c)).length;
  if (size(content) <= SAVE_BUDGET_BYTES) return { content, trimmed: false };
  const cells = content.cells.map((c) => ({ ...c, outputs: c.outputs ? [...c.outputs] : undefined }));
  for (const cell of cells) {
    if (!cell.outputs) continue;
    cell.outputs = cell.outputs.map((o): CellOutput =>
      o.type === "image"
        ? { type: "stream", name: "stdout", text: "[figure not saved: the notebook was too large. Re-run the cell to see it.]\n" }
        : o,
    );
    if (size({ cells }) <= SAVE_BUDGET_BYTES) break;
  }
  return { content: { cells }, trimmed: true };
}

export function NotebookPage({ mode = "student" }: { mode?: "student" | "starter" }) {
  const params = useParams<{ courseId: string; notebookId?: string; assignmentId?: string }>();
  const courseParam = params.courseId ?? null;
  const { active, actingAsStudent } = useActiveCourse(courseParam);
  const [searchParams] = useSearchParams();
  const previewing = actingAsStudent || searchParams.get("preview") === "1";
  const home = `/course/${courseParam}`;
  const backHref = mode === "starter" ? `${home}/instructor/code` : `${home}/code`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [runState, setRunState] = useState<Record<string, RunState>>({});
  const [editingText, setEditingText] = useState<Set<string>>(new Set());
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [focusCellId, setFocusCellId] = useState<string | null>(null);
  const [side, setSide] = useState<SidePane>(null);
  const [split, setSplit] = useState(loadSplit);
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("starting");
  const [kernelDetail, setKernelDetail] = useState<string | undefined>("Starting Python…");
  const [filesTick, setFilesTick] = useState(0);
  const [showBrief, setShowBrief] = useState(true);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { confirm, notify, dialog } = useConfirm();

  const kernelRef = useRef<Kernel | null>(null);
  const views = useRef(new Map<string, EditorView>());
  const cellsRef = useRef<Cell[]>([]);
  cellsRef.current = cells;
  const titleRef = useRef("");
  titleRef.current = title;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef({ content: false, title: false });
  const inflight = useRef<Promise<void> | null>(null);
  const splitBox = useRef<HTMLDivElement>(null);
  const storageKey = loaded ? (mode === "starter" ? `starter:${loaded.id}` : loaded.id) : "";

  // ── load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseParam) return;
    let live = true;
    (async () => {
      try {
        let l: Loaded;
        if (mode === "starter") {
          const a = await getAssignment(courseParam, params.assignmentId!);
          l = {
            mode,
            id: a.id,
            courseId: courseParam,
            title: a.title,
            content: a.starter ?? { cells: [] },
            aiEnabled: false,
            assignment: { title: a.title, instructions: a.instructions, dueAt: a.dueAt },
            isAssignment: false,
          };
        } else {
          const nb = await getNotebook(courseParam, params.notebookId!);
          l = {
            mode,
            id: nb.id,
            courseId: nb.courseId,
            title: nb.title,
            content: nb.content,
            aiEnabled: nb.aiEnabled,
            assignment: nb.assignment,
            isAssignment: nb.assignmentId !== null,
          };
          if (nb.assignmentId) {
            listMySubmissions(courseParam, nb.id)
              .then((s) => live && setLastSubmittedAt(s[0]?.submittedAt ?? null))
              .catch(() => {});
          }
        }
        if (!live) return;
        const initial = l.content.cells.length
          ? l.content.cells
          : [{ id: newCellId(), type: "code" as const, source: "" }];
        setLoaded(l);
        setCells(initial);
        setTitle(l.title);
        setSide(l.aiEnabled ? "tutor" : null);
      } catch (e) {
        if (isAuthError(e)) return redirectToLogin();
        if (!live) return;
        setLoadError(
          e instanceof ApiError && e.code === "code_disabled"
            ? "Code isn't turned on for this course."
            : e instanceof Error
              ? e.message
              : "Couldn't open this notebook",
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [courseParam, mode, params.assignmentId, params.notebookId]);

  // ── kernel ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    const key = storageKey;
    const k = new Kernel(async (kernel) => {
      for (const f of await listStoredFiles(key)) {
        try {
          await kernel.writeFile(f.name, f.data);
        } catch {
          /* a file that won't mount is skipped; the panel shows what did */
        }
      }
      setFilesTick((n) => n + 1);
    });
    kernelRef.current = k;
    const unsub = k.subscribe((s, d) => {
      setKernelStatus(s);
      setKernelDetail(d);
    });
    return () => {
      unsub();
      k.dispose();
      kernelRef.current = null;
    };
  }, [loaded, storageKey]);

  // ── saving ────────────────────────────────────────────────────────────
  const flush = useCallback(async (): Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (inflight.current) await inflight.current;
    if (!loaded || (!dirty.current.content && !dirty.current.title)) return;
    const wantContent = dirty.current.content;
    const wantTitle = dirty.current.title;
    dirty.current = { content: false, title: false };
    const { content, trimmed } = fitForSave({ cells: cellsRef.current });
    setSaveState("saving");
    const p = (async () => {
      try {
        if (loaded.mode === "starter") {
          await updateAssignment(loaded.courseId, loaded.id, { starter: content });
        } else {
          await saveNotebook(loaded.courseId, loaded.id, {
            ...(wantContent ? { content } : {}),
            ...(wantTitle ? { title: titleRef.current.trim() || "Untitled notebook" } : {}),
          });
        }
        setSaveState("saved");
        setSaveNote(trimmed ? "Some figures weren't saved: the notebook is large." : null);
      } catch (e) {
        if (isAuthError(e)) return redirectToLogin();
        dirty.current = { content: dirty.current.content || wantContent, title: dirty.current.title || wantTitle };
        setSaveState("error");
        setSaveNote(e instanceof Error ? e.message : "Save failed");
      }
    })();
    inflight.current = p;
    await p;
    inflight.current = null;
  }, [loaded]);

  const scheduleSave = useCallback(
    (what: "content" | "title" = "content") => {
      dirty.current[what] = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.content || dirty.current.title || inflight.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Save on the way out of the page (in-app navigation).
  useEffect(() => () => void flush(), [flush]);

  // ── cell operations ───────────────────────────────────────────────────
  const updateCells = useCallback(
    (fn: (cs: Cell[]) => Cell[]) => {
      setCells((cs) => fn(cs));
      scheduleSave();
    },
    [scheduleSave],
  );

  const onChangeSource = useCallback(
    (id: string, source: string) => updateCells((cs) => cs.map((c) => (c.id === id ? { ...c, source } : c))),
    [updateCells],
  );

  const insertCell = useCallback(
    (index: number, type: CellType) => {
      const cell: Cell = { id: newCellId(), type, source: "" };
      updateCells((cs) => [...cs.slice(0, index), cell, ...cs.slice(index)]);
      if (type === "markdown") setEditingText((s) => new Set(s).add(cell.id));
      setAutoFocusId(cell.id);
      return cell.id;
    },
    [updateCells],
  );

  const focusCell = useCallback((id: string) => {
    const view = views.current.get(id);
    if (view) view.focus();
    else setAutoFocusId(id);
  }, []);

  const advanceFrom = useCallback(
    (id: string) => {
      const cs = cellsRef.current;
      const i = cs.findIndex((c) => c.id === id);
      const next = cs[i + 1];
      if (next) {
        if (next.type === "markdown") {
          (document.activeElement as HTMLElement | null)?.blur();
        } else focusCell(next.id);
      } else insertCell(cs.length, "code");
    },
    [focusCell, insertCell],
  );

  /** Run one cell. Resolves true when it ran without error. */
  const runCell = useCallback(
    (id: string, advance: boolean): Promise<boolean> => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!cell) return Promise.resolve(false);
      if (cell.type === "markdown") {
        setEditingText((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        if (advance) advanceFrom(id);
        return Promise.resolve(true);
      }
      const k = kernelRef.current;
      if (!k) return Promise.resolve(false);
      setCells((cs) => cs.map((c) => (c.id === id ? { ...c, outputs: [] } : c)));
      setRunState((r) => ({ ...r, [id]: { state: "queued" } }));
      if (advance) advanceFrom(id);
      return k
        .run(cell.source, {
          onStart: (count) => setRunState((r) => ({ ...r, [id]: { state: "running", count } })),
          onStatus: (m) =>
            setRunState((r) => {
              const cur = r[id];
              return cur?.state === "running" ? { ...r, [id]: { ...cur, status: m } } : r;
            }),
          onOutput: (o) =>
            setCells((cs) => cs.map((c) => (c.id === id ? { ...c, outputs: appendOutput(c.outputs ?? [], o) } : c))),
        })
        .then(({ ok, stopped }) => {
          setRunState((r) => {
            const cur = r[id];
            if (stopped) {
              const n = { ...r };
              delete n[id];
              return n;
            }
            return { ...r, [id]: { state: "done", count: cur && "count" in cur ? cur.count : 0, ok } };
          });
          setFilesTick((n) => n + 1);
          scheduleSave();
          return ok && !stopped;
        });
    },
    [advanceFrom, scheduleSave],
  );

  const runningAll = useRef(false);
  /** Run every non-empty code cell top to bottom, stopping at the first
   *  error — later cells usually depend on the one that failed. */
  async function runAll() {
    if (runningAll.current) return;
    runningAll.current = true;
    try {
      const ids = cellsRef.current.filter((c) => c.type === "code" && c.source.trim()).map((c) => c.id);
      for (const id of ids) {
        if (!(await runCell(id, false))) break;
      }
    } finally {
      runningAll.current = false;
    }
  }

  async function restart() {
    const ok = await confirm({
      title: "Restart Python?",
      body: "This stops anything running and clears every variable. Your code, outputs and files are kept.",
      confirmLabel: "Restart",
    });
    if (!ok) return;
    setRunState({});
    kernelRef.current?.restart();
  }

  function clearOutputs() {
    updateCells((cs) => cs.map((c) => (c.type === "code" ? { ...c, outputs: [] } : c)));
    setRunState({});
  }

  const deleteCell = useCallback(
    (id: string) => updateCells((cs) => (cs.length <= 1 ? [{ id: newCellId(), type: "code", source: "" }] : cs.filter((c) => c.id !== id))),
    [updateCells],
  );

  const moveCell = useCallback(
    (id: string, delta: -1 | 1) =>
      updateCells((cs) => {
        const i = cs.findIndex((c) => c.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= cs.length) return cs;
        const out = [...cs];
        [out[i], out[j]] = [out[j]!, out[i]!];
        return out;
      }),
    [updateCells],
  );

  const setType = useCallback(
    (id: string, type: CellType) => {
      // Remount the cell's editor so its language changes with it.
      const fresh = newCellId();
      updateCells((cs) =>
        cs.map((c) => (c.id === id ? { id: fresh, type, source: c.source, ...(type === "code" ? { outputs: [] } : {}) } : c)),
      );
      if (type === "markdown") setEditingText((s) => new Set(s).add(fresh));
    },
    [updateCells],
  );

  const onEditText = useCallback((id: string, editing: boolean) => {
    setEditingText((s) => {
      const n = new Set(s);
      if (editing) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const registerView = useCallback((id: string, view: EditorView | null) => {
    if (view) views.current.set(id, view);
    else views.current.delete(id);
  }, []);

  // ── submit ────────────────────────────────────────────────────────────
  async function submit() {
    if (!loaded) return;
    const ok = await confirm({
      title: "Submit this notebook?",
      body:
        "Your instructor gets a copy of the notebook as it is now, with its outputs" +
        (loaded.aiEnabled ? " and your tutor conversation" : "") +
        ". You can keep working and submit again. Your instructor sees every submission, newest first. Uploaded files are not included.",
      confirmLabel: "Submit",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await flush();
      const s = await submitNotebook(loaded.courseId, loaded.id);
      setLastSubmittedAt(s.submittedAt);
      await notify({
        title: "Submitted",
        body: s.late ? "Submitted after the deadline. It has been recorded with its time." : "Your instructor has a copy.",
      });
    } catch (e) {
      await notify({ title: "Couldn't submit", body: e instanceof Error ? e.message : "Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── divider ───────────────────────────────────────────────────────────
  function onDividerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("prov-dragging");
  }
  function onDividerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !splitBox.current) return;
    const r = splitBox.current.getBoundingClientRect();
    setSplit(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, (e.clientX - r.left) / r.width)));
  }
  function onDividerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove("prov-dragging");
    try {
      window.localStorage.setItem(SPLIT_KEY, String(split));
    } catch {
      /* per-viewer convenience only */
    }
  }

  const focusLabel = useMemo(() => {
    if (!focusCellId) return null;
    const i = cells.findIndex((c) => c.id === focusCellId);
    return i >= 0 ? `cell ${i + 1}` : null;
  }, [cells, focusCellId]);

  // ── render ────────────────────────────────────────────────────────────
  if (loadError || !loaded) {
    return (
      <div className="ds-staff">
        <header className="ds-staff-top">
          <Link to={backHref} aria-label="Back to Code">
            <Wordmark size="sm" />
          </Link>
          <span className="ds-staff-top__role">Code</span>
        </header>
        <div className="ds-staff-page">
          {loadError ? (
            <>
              <p className="error">{loadError}</p>
              <Button variant="subtle" href={backHref}>
                Back
              </Button>
            </>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
      </div>
    );
  }

  const busy = kernelStatus === "busy";
  const sideOpen = side !== null;
  const grid = sideOpen ? `${split}fr 6px ${1 - split}fr` : "minmax(0, 1fr)";

  return (
    <div className="prov-shell code-shell no-watermark">
      {courseParam && mode === "student" && (
        <header className="app-topbar app-topbar--student prov-appbar">
          <div className="app-topbar__inner">
            <StudentModuleNav
              courseId={courseParam}
              provenanceEnabled={active?.provenanceEnabled ?? true}
              agentsEnabled={active?.agentsEnabled ?? true}
              codeEnabled={active?.codeEnabled ?? true}
              activeModule="code"
            />
            <div className="app-topbar__spacer" />
          </div>
        </header>
      )}
      {previewing && courseParam && <PreviewBanner courseId={courseParam} courseName={active?.courseName ?? ""} />}

      <header className="prov-shell-header code-header">
        <Link to={backHref} aria-label="Back to Code">
          <span className="prov-shell-role">{mode === "starter" ? "Starter notebook" : "Code"}</span>
        </Link>
        {mode === "starter" || loaded.isAssignment ? (
          <span className="prov-shell-title code-header__title">{title}</span>
        ) : (
          <input
            className="prov-shell-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave("title");
            }}
            aria-label="Notebook title"
            placeholder="Untitled notebook"
          />
        )}
        <SaveStatus state={saveState} note={saveNote} />
        <span className={`code-kernel code-kernel--${kernelStatus}`} title={kernelDetail}>
          <span className="code-kernel__dot" aria-hidden />
          {kernelStatus === "starting" ? "Starting" : kernelStatus === "busy" ? "Running" : kernelStatus === "error" ? "Stopped" : "Ready"}
        </span>
        <span className="code-header__group">
          <Button variant="subtle" size="sm" onClick={() => void runAll()} disabled={kernelStatus === "error"}>
            Run all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void restart()}>
            {busy ? "Stop" : "Restart"}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearOutputs}>
            Clear outputs
          </Button>
        </span>
        {loaded.isAssignment && mode === "student" && (
          <Button variant="primary" size="sm" onClick={() => void submit()} loading={submitting}>
            Submit
          </Button>
        )}
        <button
          type="button"
          className={"prov-toggle" + (side === "files" ? " is-on" : "")}
          onClick={() => setSide((s) => (s === "files" ? null : "files"))}
          aria-pressed={side === "files"}
        >
          <span className="prov-toggle__sw" />
          Files
        </button>
        {loaded.aiEnabled && (
          <button
            type="button"
            className={"prov-toggle" + (side === "tutor" ? " is-on" : "")}
            onClick={() => setSide((s) => (s === "tutor" ? null : "tutor"))}
            aria-pressed={side === "tutor"}
          >
            <span className="prov-toggle__sw" />
            Tutor
          </button>
        )}
      </header>

      {kernelStatus === "error" && (
        <div className="code-banner" role="alert">
          {kernelDetail}{" "}
          <button type="button" className="code-banner__action" onClick={() => kernelRef.current?.restart()}>
            Try again
          </button>
        </div>
      )}

      <div
        ref={splitBox}
        className={`prov-shell-body${sideOpen ? " chat-open" : ""}`}
        style={{ gridTemplateColumns: grid }}
      >
        <section className="prov-editor-pane code-pane">
          <div className="code-pane__scroll">
            <div className="code-pane__inner">
              {loaded.assignment && (loaded.assignment.instructions.trim() || loaded.assignment.dueAt) && (
                <div className={`code-brief${showBrief ? "" : " is-collapsed"}`}>
                  <button type="button" className="code-brief__toggle" onClick={() => setShowBrief((v) => !v)}>
                    <span className="mono-label">Assignment</span>
                    {loaded.assignment.dueAt && (
                      <span className="code-brief__due">
                        Due {new Date(loaded.assignment.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    )}
                    {lastSubmittedAt && (
                      <span className="code-brief__due">Last submitted {relativeTime(lastSubmittedAt)}</span>
                    )}
                    <span className="code-brief__chev" aria-hidden>
                      {showBrief ? "Hide" : "Show"}
                    </span>
                  </button>
                  {showBrief && loaded.assignment.instructions.trim() && (
                    <div className="code-brief__body">
                      <Markdown>{loaded.assignment.instructions}</Markdown>
                    </div>
                  )}
                </div>
              )}
              {mode === "starter" && (
                <p className="code-starter-note">
                  Students each get their own copy of this notebook the first time
                  they open the assignment. Changes here reach students who haven't
                  opened it yet, not notebooks already started.
                </p>
              )}
              <Cells
                cells={cells}
                runState={runState}
                autoFocusId={autoFocusId}
                onChangeSource={onChangeSource}
                onRun={runCell}
                onInsert={insertCell}
                onDelete={deleteCell}
                onMove={moveCell}
                onSetType={setType}
                onFocusCell={setFocusCellId}
                registerView={registerView}
                editingText={editingText}
                onEditText={onEditText}
              />
            </div>
          </div>
        </section>

        {sideOpen && (
          <>
            <div
              className="prov-divider"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize notebook and side panel"
              onPointerDown={onDividerDown}
              onPointerMove={onDividerMove}
              onPointerUp={onDividerUp}
              onDoubleClick={() => setSplit(SPLIT_DEFAULT)}
            >
              <span className="prov-divider-grip" aria-hidden />
            </div>
            <section className="prov-chat-pane code-side">
              {side === "tutor" && loaded.aiEnabled && (
                <TutorPanel
                  courseId={loaded.courseId}
                  notebookId={loaded.id}
                  focusCellId={focusCellId}
                  focusLabel={focusLabel}
                  onClearFocus={() => setFocusCellId(null)}
                  beforeSend={flush}
                />
              )}
              {side === "files" && (
                <FilesPanel
                  kernel={kernelRef.current}
                  kernelStatus={kernelStatus}
                  storageKey={storageKey}
                  refreshSignal={filesTick}
                />
              )}
            </section>
          </>
        )}
      </div>
      {dialog}
    </div>
  );
}

function SaveStatus({ state, note }: { state: SaveState; note: string | null }) {
  if (state === "idle") return <span className="prov-save-state" />;
  const label = state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Not saved";
  return (
    <span className={`prov-save-state state-${state}`} title={note ?? undefined}>
      <span className="prov-save-dot" aria-hidden />
      {label}
    </span>
  );
}

/** Route wrapper for the instructor's starter-notebook editor. */
export function StarterNotebookPage() {
  return <NotebookPage mode="starter" />;
}

/**
 * /course/:id/code/assignment/:assignmentId — open (creating on first visit)
 * the student's notebook for an assignment, then land on it. Lets any list
 * link to an assignment without knowing whether a notebook exists yet.
 */
export function OpenAssignmentNotebook() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!courseId || !assignmentId) return;
    openNotebook(courseId, { assignmentId })
      .then((nb) => navigate(`/course/${courseId}/code/${nb.id}`, { replace: true }))
      .catch((e) => {
        if (isAuthError(e)) redirectToLogin();
        else setError(e instanceof Error ? e.message : "Couldn't open this assignment");
      });
  }, [courseId, assignmentId, navigate]);
  return (
    <div className="ds-staff-page">
      {error ? <p className="error">{error}</p> : <p className="muted">Opening…</p>}
    </div>
  );
}
