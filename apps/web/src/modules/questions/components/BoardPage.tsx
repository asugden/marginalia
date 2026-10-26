// One board: its questions, live, and (while it's open) a box to ask one.
// Mounted twice — under the student shell and under the staff shell. The
// server says whether the caller is staff; staff additionally get Open/Close
// and per-question Hide and Delete.
//
// Questions carry no names, for anyone. A person's own questions are marked
// "Yours" (to them alone) and stay editable until the board closes.

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, PageHeader, Section, Textarea, useConfirm } from "../../../components/index.js";
import { relativeTime } from "../../../time.js";
import {
  ApiError,
  askQuestion,
  deleteQuestion,
  getBoard,
  listBoards,
  updateBoard,
  updateQuestion,
  type BoardDTO,
  type EntryDTO,
} from "../api.js";
import { usePoll } from "./usePoll.js";

const OPEN_POLL_MS = 4_000;
const IDLE_POLL_MS = 20_000;
const MAX_CHARS = 1_000;

export function BoardPage({ staffShell = false }: { staffShell?: boolean }) {
  const { courseId, boardId } = useParams<{ courseId: string; boardId: string }>();
  const base = staffShell
    ? `/course/${courseId}/instructor/questions`
    : `/course/${courseId}/questions`;

  const [board, setBoard] = useState<BoardDTO | null>(null);
  const [entries, setEntries] = useState<EntryDTO[]>([]);
  const [staff, setStaff] = useState(false);
  const [siblings, setSiblings] = useState<BoardDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(() => {
    if (!boardId) return;
    getBoard(boardId)
      .then((r) => {
        setBoard(r.board);
        setEntries(r.entries);
        setStaff(r.staff);
        setMissing(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError((e as Error).message);
      });
  }, [boardId]);

  useEffect(() => {
    setBoard(null);
    setEntries([]);
    setError(null);
    refresh();
  }, [refresh]);

  // The other boards, for previous / next. Refetched when this board's
  // status changes, since opening a draft adds it to a student's list.
  useEffect(() => {
    if (!courseId) return;
    listBoards(courseId)
      .then((r) => setSiblings(r.boards))
      .catch(() => {});
  }, [courseId, board?.status]);

  usePoll(refresh, board?.status === "open" ? OPEN_POLL_MS : IDLE_POLL_MS, !!board);

  if (missing) {
    return (
      <div className="app-page">
        <PageHeader eyebrow="Questions" title="Board not found" />
        <p className="muted">
          It may have been deleted. <Link to={base}>See all boards</Link>.
        </p>
      </div>
    );
  }
  if (!board) {
    return (
      <div className="app-page">
        {error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}
      </div>
    );
  }

  const open = board.status === "open";
  // Boards list newest first; "previous" is the one before this in class.
  const idx = siblings.findIndex((b) => b.id === board.id);
  const newer = idx > 0 ? siblings[idx - 1] : undefined;
  const older = idx >= 0 ? siblings[idx + 1] : undefined;

  const setStatus = async (status: "open" | "closed") => {
    try {
      setBoard(await updateBoard(board.id, { status }));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const scope = open
    ? "Open. Ask as many questions as you like — they appear here for everyone, without names."
    : board.status === "closed"
      ? "Closed to new questions."
      : "Draft — only course staff can see this board until it's opened.";

  return (
    <div className="app-page q-board">
      <PageHeader
        eyebrow="Questions"
        title={board.title}
        scope={scope}
        actions={
          staff ? (
            open ? (
              <Button variant="subtle" onClick={() => setStatus("closed")}>
                Close
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStatus("open")}>
                {board.status === "draft" ? "Open" : "Reopen"}
              </Button>
            )
          ) : undefined
        }
      />

      <nav className="q-board__nav" aria-label="Boards">
        {older ? (
          <Link to={`${base}/${older.id}`}>← {older.title}</Link>
        ) : (
          <span />
        )}
        <Link to={base}>All boards</Link>
        {newer ? <Link to={`${base}/${newer.id}`}>{newer.title} →</Link> : <span />}
      </nav>

      {error && <p className="error">{error}</p>}

      {open && <Composer boardId={board.id} onAsked={refresh} />}

      <Section
        kicker="Questions"
        meta={`${entries.length}${open ? " · updates live" : ""}`}
      >
        {entries.length === 0 ? (
          <p className="muted">{open ? "No questions yet. Be the first." : "No questions were asked."}</p>
        ) : (
          <ol className="q-list">
            {entries.map((e) => (
              <QuestionRow
                key={e.id}
                entry={e}
                open={open}
                staff={staff}
                onChanged={refresh}
                onError={setError}
                confirm={confirm}
              />
            ))}
          </ol>
        )}
      </Section>
      {dialog}
    </div>
  );
}

function Composer({ boardId, onAsked }: { boardId: string; onAsked: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await askQuestion(boardId, body);
      setText("");
      onAsked();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "board_closed"
          ? "This board just closed, so your question wasn't added."
          : (e as Error).message,
      );
      if (e instanceof ApiError && e.code === "board_closed") onAsked();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="q-compose">
      <Textarea
        aria-label="Your question"
        placeholder="Ask a question…"
        rows={3}
        maxLength={MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="q-compose__foot">
        <span className="q-compose__note">Your name isn't shown to anyone.</span>
        <Button variant="primary" onClick={submit} loading={busy} disabled={busy || !text.trim()}>
          Ask
        </Button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function QuestionRow({
  entry,
  open,
  staff,
  onChanged,
  onError,
  confirm,
}: {
  entry: EntryDTO;
  open: boolean;
  staff: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canEdit = entry.mine && open;
  const canDelete = (entry.mine && open) || staff;

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this question?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await run(() => deleteQuestion(entry.id));
  };

  return (
    <li className={"q-item" + (entry.hidden ? " q-item--hidden" : "")}>
      {editing ? (
        <div className="q-item__edit">
          <Textarea
            aria-label="Edit your question"
            rows={3}
            maxLength={MAX_CHARS}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="q-item__actions">
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={busy || !draft.trim()}
              onClick={() =>
                run(async () => {
                  await updateQuestion(entry.id, { body: draft });
                  setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setDraft(entry.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="q-item__body">{entry.body}</p>
      )}
      <div className="q-item__meta">
        <span className="q-item__when">{relativeTime(entry.createdAt)}</span>
        {entry.mine && <Badge tone="info">Yours</Badge>}
        {entry.hidden && <Badge tone="warning">Hidden from class</Badge>}
        {!editing && (
          <span className="q-item__actions">
            {canEdit && (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setDraft(entry.body);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
            {staff && (
              <Button
                variant="subtle"
                size="sm"
                disabled={busy}
                onClick={() => run(() => updateQuestion(entry.id, { hidden: !entry.hidden }))}
              >
                {entry.hidden ? "Show" : "Hide"}
              </Button>
            )}
            {canDelete && (
              <Button variant="danger" size="sm" disabled={busy} onClick={remove}>
                Delete
              </Button>
            )}
          </span>
        )}
      </div>
    </li>
  );
}
