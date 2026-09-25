// The cell list: code and text cells, their outputs, and the controls
// between them. Shared by the live notebook and the read-only views
// (submissions, the instructor's review), which pass `readOnly`.

import { useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { OriginRun } from "@marginalia/provenance";
import { Markdown } from "../../../Markdown.js";
import { IconButton } from "../../../components/index.js";
import { ChevronIcon, PlusIcon, TrashIcon } from "../../../icons.js";
import type { Cell, CellType } from "../api.js";
import { CodeEditor } from "./CodeEditor.js";
import { Outputs } from "./Outputs.js";

export type RunState =
  | { state: "queued" }
  | { state: "running"; count: number; status?: string }
  | { state: "done"; count: number; ok: boolean };

let idCounter = 0;
/** A cell id matching the server's `[A-Za-z0-9_-]{1,64}`. */
export function newCellId(): string {
  idCounter += 1;
  return `c${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface CellsProps {
  cells: Cell[];
  readOnly?: boolean;
  runState?: Record<string, RunState>;
  /** Cell to focus on mount (a freshly added one). */
  autoFocusId?: string | null;
  onChangeSource?: (id: string, source: string) => void;
  onRun?: (id: string, advance: boolean) => unknown;
  onInsert?: (index: number, type: CellType) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string, delta: -1 | 1) => void;
  onSetType?: (id: string, type: CellType) => void;
  onFocusCell?: (id: string) => void;
  registerView?: (id: string, view: EditorView | null) => void;
  /** Text cells being edited (rendered as source rather than markdown). */
  editingText?: Set<string>;
  onEditText?: (id: string, editing: boolean) => void;
  /** Origin tracking for a cell's editor (live notebooks in submit mode). */
  trackingFor?: (cell: Cell) => Extension[] | undefined;
  /** Origin runs to paint on a cell (review views). When given, text cells
   *  show their source, so every character's origin is visible. */
  marksFor?: (cellId: string) => OriginRun[] | undefined;
}

export function Cells(props: CellsProps) {
  const { cells, readOnly } = props;
  return (
    <div className={`code-cells${readOnly ? " is-readonly" : ""}`}>
      {!readOnly && <InsertBar index={0} onInsert={props.onInsert} />}
      {cells.map((cell, i) => (
        <div key={cell.id}>
          <CellView cell={cell} index={i} last={i === cells.length - 1} {...props} />
          {!readOnly && <InsertBar index={i + 1} onInsert={props.onInsert} />}
        </div>
      ))}
      {cells.length === 0 && readOnly && <p className="app-empty">This notebook is empty.</p>}
    </div>
  );
}

function InsertBar({
  index,
  onInsert,
}: {
  index: number;
  onInsert?: (index: number, type: CellType) => void;
}) {
  return (
    <div className="code-insert">
      <button type="button" className="code-insert__btn" onClick={() => onInsert?.(index, "code")}>
        <PlusIcon size={12} /> Code
      </button>
      <button type="button" className="code-insert__btn" onClick={() => onInsert?.(index, "markdown")}>
        <PlusIcon size={12} /> Text
      </button>
    </div>
  );
}

function countLabel(rs: RunState | undefined): string {
  if (!rs) return "[ ]";
  if (rs.state === "queued") return "[·]";
  if (rs.state === "running") return "[*]";
  return `[${rs.count}]`;
}

function CellView({
  cell,
  index,
  last,
  readOnly,
  runState,
  autoFocusId,
  onChangeSource,
  onRun,
  onDelete,
  onMove,
  onSetType,
  onFocusCell,
  registerView,
  editingText,
  onEditText,
  trackingFor,
  marksFor,
}: CellsProps & { cell: Cell; index: number; last: boolean }) {
  const rs = runState?.[cell.id];
  const busy = rs?.state === "queued" || rs?.state === "running";
  const [hover, setHover] = useState(false);
  const marks = marksFor?.(cell.id);

  if (cell.type === "markdown" && marks && readOnly) {
    // Review with origins on: show the text cell's source so its marks are
    // visible character by character.
    return (
      <section className="code-cell code-cell--text">
        <div className="code-cell__gutter" aria-hidden />
        <div className="code-cell__main">
          <div className="code-cell__input">
            <CodeEditor initialValue={cell.source} language="markdown" readOnly marks={marks} />
          </div>
        </div>
      </section>
    );
  }

  if (cell.type === "markdown") {
    const editing = !readOnly && (editingText?.has(cell.id) ?? false);
    return (
      <section
        className={`code-cell code-cell--text${editing ? " is-editing" : ""}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="code-cell__gutter" aria-hidden />
        <div className="code-cell__main">
          {editing ? (
            <div className="code-cell__input">
              <CodeEditor
                initialValue={cell.source}
                language="markdown"
                placeholder="Write text in Markdown. Shift+Enter to finish."
                autoFocus
                onChange={(v) => onChangeSource?.(cell.id, v)}
                onRunAdvance={() => onRun?.(cell.id, true)}
                onRunInPlace={() => onRun?.(cell.id, false)}
                onEscape={() => onEditText?.(cell.id, false)}
                onFocus={() => onFocusCell?.(cell.id)}
                onView={(v) => registerView?.(cell.id, v)}
                extensions={trackingFor?.(cell)}
              />
            </div>
          ) : (
            <div
              className="code-cell__text"
              onDoubleClick={() => !readOnly && onEditText?.(cell.id, true)}
              title={readOnly ? undefined : "Double-click to edit"}
            >
              {cell.source.trim() ? (
                <Markdown>{cell.source}</Markdown>
              ) : (
                <p className="code-cell__empty">{readOnly ? "" : "Empty text cell. Double-click to write."}</p>
              )}
            </div>
          )}
        </div>
        {!readOnly && (
          <CellTools
            visible={hover || editing}
            cell={cell}
            index={index}
            last={last}
            onDelete={onDelete}
            onMove={onMove}
            onSetType={onSetType}
            onEdit={editing ? undefined : () => onEditText?.(cell.id, true)}
          />
        )}
      </section>
    );
  }

  return (
    <section
      className={`code-cell code-cell--code${busy ? " is-busy" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="code-cell__gutter">
        {!readOnly && (
          <button
            type="button"
            className={`code-run${busy ? " is-busy" : ""}`}
            onClick={() => onRun?.(cell.id, false)}
            disabled={busy}
            title="Run cell (Shift+Enter)"
            aria-label="Run cell"
          >
            {busy ? <span className="code-run__spin" aria-hidden /> : <RunTriangle />}
          </button>
        )}
        {!readOnly && <span className="code-cell__count">{countLabel(rs)}</span>}
      </div>
      <div className="code-cell__main">
        <div className="code-cell__input">
          <CodeEditor
            initialValue={cell.source}
            readOnly={readOnly}
            autoFocus={autoFocusId === cell.id}
            onChange={(v) => onChangeSource?.(cell.id, v)}
            onRunAdvance={() => onRun?.(cell.id, true)}
            onRunInPlace={() => onRun?.(cell.id, false)}
            onFocus={() => onFocusCell?.(cell.id)}
            onView={(v) => registerView?.(cell.id, v)}
            extensions={trackingFor?.(cell)}
            marks={marks}
          />
        </div>
        {rs?.state === "running" && rs.status && <div className="code-cell__status">{rs.status}</div>}
        <Outputs outputs={cell.outputs ?? []} />
      </div>
      {!readOnly && (
        <CellTools
          visible={hover}
          cell={cell}
          index={index}
          last={last}
          onDelete={onDelete}
          onMove={onMove}
          onSetType={onSetType}
        />
      )}
    </section>
  );
}

function CellTools({
  visible,
  cell,
  index,
  last,
  onDelete,
  onMove,
  onSetType,
  onEdit,
}: {
  visible: boolean;
  cell: Cell;
  index: number;
  last: boolean;
  onDelete?: (id: string) => void;
  onMove?: (id: string, delta: -1 | 1) => void;
  onSetType?: (id: string, type: CellType) => void;
  onEdit?: () => void;
}) {
  return (
    <div className={`code-cell__tools${visible ? " is-visible" : ""}`}>
      {onEdit && (
        <button type="button" className="code-tool-text" onClick={onEdit}>
          Edit
        </button>
      )}
      <button
        type="button"
        className="code-tool-text"
        onClick={() => onSetType?.(cell.id, cell.type === "code" ? "markdown" : "code")}
        title={cell.type === "code" ? "Change to a text cell" : "Change to a code cell"}
      >
        {cell.type === "code" ? "To text" : "To code"}
      </button>
      <IconButton size="sm" variant="ghost" title="Move up" disabled={index === 0} onClick={() => onMove?.(cell.id, -1)}>
        <span className="code-tool-up">
          <ChevronIcon size={14} />
        </span>
      </IconButton>
      <IconButton size="sm" variant="ghost" title="Move down" disabled={last} onClick={() => onMove?.(cell.id, 1)}>
        <ChevronIcon size={14} />
      </IconButton>
      <IconButton size="sm" variant="ghost" title="Delete cell" onClick={() => onDelete?.(cell.id)}>
        <TrashIcon size={14} />
      </IconButton>
    </div>
  );
}

function RunTriangle() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
    </svg>
  );
}
