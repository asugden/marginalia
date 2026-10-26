// One presenter's board: its questions, live, and (while the session is
// open) a box to ask one. Mounted in both shells; the server says whether the
// caller is staff, and staff additionally get the session's Open/Close and
// per-question Hide and Delete.
//
// Questions carry no names, for anyone. A person's own questions are marked
// "Yours" (to them alone) and stay editable until the session closes.

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, PageHeader, Section, Textarea, useConfirm } from "../../../components/index.js";
import { relativeTime } from "../../../time.js";
import {
  ApiError,
  askQuestion,
  deleteQuestion,
  getBoard,
  updateQuestion,
  updateSession,
  type BoardDTO,
  type EntryDTO,
  type SessionDTO,
} from "../api.js";
import { boardPath, questionsBase, sessionPath } from "./paths.js";
import { StatusBadge } from "./StatusBadge.js";
import { usePoll } from "./usePoll.js";

const OPEN_POLL_MS = 4_000;
const IDLE_POLL_MS = 20_000;
const MAX_CHARS = 1_000;

export function BoardPage({ staffShell = false }: { staffShell?: boolean }) {
  const { courseId = "", boardId = "" } = useParams<{ courseId: string; boardId: string }>();

  const [board, setBoard] = useState<BoardDTO | null>(null);
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [siblings, setSiblings] = useState<BoardDTO[]>([]);
  const [entries, setEntries] = useState<EntryDTO[]>([]);
  const [staff, setStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(() => {
    getBoard(boardId)
      .then((r) => {
        setBoard(r.board);
        setSession(r.session);
        setSiblings(r.boards);
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

  usePoll(refresh, session?.status === "open" ? OPEN_POLL_MS : IDLE_POLL_MS, !!board);

  if (missing) {
    return (
      <div className="app-page">
        <PageHeader eyebrow="Questions" title="Board not found" />
        <p className="muted">
          It may have been deleted. <Link to={questionsBase(courseId, staffShell)}>See all sessions</Link>.
        </p>
      </div>
    );
  }
  if (!board || !session) {
    return (
      <div className="app-page">
        {error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}
      </div>
    );
  }

  const open = session.status === "open";
  const idx = siblings.findIndex((b) => b.id === board.id);
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx >= 0 ? siblings[idx + 1] : undefined;
  const toBoard = (b: BoardDTO) => boardPath(courseId, staffShell, session.id, b.id);

  const setStatus = async (status: "open" | "closed") => {
    try {
      await updateSession(session.id, { status });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const scope = open
    ? "Ask as many questions as you like — they appear here for everyone, without names."
    : session.status === "closed"
      ? "This session is closed to new questions."
      : "Draft — only course staff can see this session until it's opened.";

  return (
    <div className={(staffShell ? "ds-staff-page" : "app-page") + " q-board"}>
      <PageHeader
        eyebrow={session.title}
        title={board.title}
        scope={scope}
        actions={
          staff ? (
            open ? (
              <Button variant="subtle" onClick={() => setStatus("closed")}>
                Close session
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStatus("open")}>
                {session.status === "draft" ? "Open session" : "Reopen session"}
              </Button>
            )
          ) : (
            <StatusBadge status={session.status} />
          )
        }
      />

      <nav className="q-board__nav" aria-label="Presenters">
        {prev ? <Link to={toBoard(prev)}>← {prev.title}</Link> : <span />}
        <Link to={sessionPath(courseId, staffShell, session.id)}>All boards</Link>
        {next ? <Link to={toBoard(next)}>{next.title} →</Link> : <span />}
      </nav>

      {error && <p className="error">{error}</p>}

      {open && <Composer boardId={board.id} onAsked={refresh} />}

      <Section kicker="Questions" meta={`${entries.length}${open ? " · updates live" : ""}`}>
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
        e instanceof ApiError && e.code === "session_closed"
          ? "The session just closed, so your question wasn't added."
          : (e as Error).message,
      );
      if (e instanceof ApiError && e.code === "session_closed") onAsked();
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
