// One session, run from one page. Its boards (one per presenter) are tabs
// across the top; the selected board's questions sit below. Nobody leaves the
// page to move between presenters.
//
// Staff build the session here too, before class or during it: the "+ Board"
// tab opens a name field that stays open after each board it creates, so a
// lineup can be typed (or pasted, one name per line) in advance, or added one
// presenter at a time as the class goes. Creating a board selects it.
//
// Mounted at …/questions/:sessionId/:boardId? — one route, so switching boards
// keeps the page (and an open "+ Board" field) mounted. With no board in the
// URL it shows the newest board — the one being presented, when boards are
// added as the class goes.

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Input, PageHeader, Section, useConfirm } from "../../../components/index.js";
import {
  ApiError,
  createBoard,
  deleteBoard,
  getBoard,
  getSession,
  renameBoard,
  updateSession,
  type BoardDTO,
  type EntryDTO,
  type SessionDTO,
} from "../api.js";
import { boardPath, questionsBase } from "./paths.js";
import { Composer, QuestionRow } from "./Questions.js";
import { RenameForm } from "./RenameForm.js";
import { StatusBadge } from "./StatusBadge.js";
import { usePoll } from "./usePoll.js";

const OPEN_POLL_MS = 4_000;
const IDLE_POLL_MS = 20_000;

export function SessionPage({ staffShell = false }: { staffShell?: boolean }) {
  const { courseId = "", sessionId = "", boardId } = useParams<{
    courseId: string;
    sessionId: string;
    boardId?: string;
  }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [boards, setBoards] = useState<BoardDTO[]>([]);
  const [entries, setEntries] = useState<EntryDTO[]>([]);
  const [staff, setStaff] = useState(false);
  const [missing, setMissing] = useState<"session" | "board" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { confirm, dialog } = useConfirm();

  const toBoard = useCallback(
    (id: string) => boardPath(courseId, staffShell, sessionId, id),
    [courseId, staffShell, sessionId],
  );

  const refresh = useCallback(() => {
    const load = boardId
      ? getBoard(boardId).then((r) => {
          // A board id from another session (a stale link) belongs there.
          if (r.board.sessionId !== sessionId) throw new ApiError("Board not found", 404);
          setEntries(r.entries);
          return r;
        })
      : getSession(sessionId).then((r) => {
          setEntries([]);
          // No board chosen: go to the newest one, if there is one.
          const newest = r.boards[r.boards.length - 1];
          if (newest) navigate(toBoard(newest.id), { replace: true });
          return r;
        });
    load
      .then((r) => {
        setSession(r.session);
        setBoards(r.boards);
        setStaff(r.staff);
        setMissing(null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setMissing(boardId ? "board" : "session");
        else setError((e as Error).message);
      });
  }, [boardId, sessionId, navigate, toBoard]);

  useEffect(() => {
    setEntries([]);
    setError(null);
    setRenaming(false);
    refresh();
  }, [refresh]);

  usePoll(refresh, session?.status === "open" ? OPEN_POLL_MS : IDLE_POLL_MS, !!session);

  const base = questionsBase(courseId, staffShell);
  // A board link we can't resolve before the session has loaded (deleted, or
  // in a session that isn't open to this person) is as missing as the session.
  if (missing === "session" || (missing && !session)) {
    return (
      <div className="app-page">
        <PageHeader eyebrow="Questions" title="Session not found" />
        <p className="muted">
          It may have been deleted. <Link to={base}>See all sessions</Link>.
        </p>
      </div>
    );
  }
  if (!session) {
    return <div className="app-page">{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</div>;
  }

  const controls = staffShell && staff;
  const open = session.status === "open";
  const board = boards.find((b) => b.id === boardId) ?? null;

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeBoard = async (b: BoardDTO) => {
    const ok = await confirm({
      title: `Delete “${b.title}”?`,
      body: b.questionCount > 0 ? `Its ${b.questionCount} question${b.questionCount === 1 ? "" : "s"} will be deleted too.` : undefined,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteBoard(b.id);
      // Land on a neighbour rather than an empty page.
      const rest = boards.filter((x) => x.id !== b.id);
      const idx = boards.findIndex((x) => x.id === b.id);
      const next = rest[Math.min(idx, rest.length - 1)];
      navigate(next ? toBoard(next.id) : `${base}/${session.id}`, { replace: true });
      if (!next) refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const scope = open
    ? "Open. Ask as many questions as you like, on any presenter's board — everyone sees them, without names."
    : session.status === "closed"
      ? "Closed to new questions. Every board stays readable."
      : controls
        ? "Draft — students can't see this session until you open it. Add a board for each presenter now, or as you go."
        : "Draft — only course staff can see this session.";

  return (
    <div className={(staffShell ? "ds-staff-page" : "app-page") + " q-session"}>
      <PageHeader
        eyebrow="Questions"
        title={session.title}
        scope={scope}
        actions={
          <span className="q-session__state">
            <StatusBadge status={session.status} />
            {controls &&
              (open ? (
                <Button variant="subtle" onClick={() => act(() => updateSession(session.id, { status: "closed" }))}>
                  Close session
                </Button>
              ) : (
                <Button variant="primary" onClick={() => act(() => updateSession(session.id, { status: "open" }))}>
                  {session.status === "draft" ? "Open session" : "Reopen session"}
                </Button>
              ))}
          </span>
        }
      />

      <nav className="q-tabs" aria-label="Presenters">
        <Link className="q-tabs__back" to={base} title="All sessions">
          ←
        </Link>
        {boards.map((b) => (
          <Link
            key={b.id}
            to={toBoard(b.id)}
            className={"q-tabs__tab" + (b.id === boardId ? " q-tabs__tab--active" : "")}
            aria-current={b.id === boardId ? "page" : undefined}
          >
            <span className="q-tabs__name">{b.title}</span>
            <span className="q-tabs__count">{b.questionCount}</span>
          </Link>
        ))}
        {controls && (
          <AddBoard
            autoOpen={boards.length === 0}
            onCreate={async (title) => {
              const created = await createBoard(session.id, title);
              navigate(toBoard(created.id));
              return created;
            }}
            onError={setError}
          />
        )}
      </nav>

      {error && <p className="error">{error}</p>}

      {missing === "board" ? (
        <p className="muted">That board has been deleted. Pick another above.</p>
      ) : !board ? (
        <p className="muted">
          {controls ? "No boards yet. Add one for each presenter with + Board." : "No boards yet. They'll appear here as presenters are added."}
        </p>
      ) : (
        <>
          <div className="q-board__head">
            {renaming ? (
              <RenameForm
                initial={board.title}
                onSave={async (t) => {
                  await act(() => renameBoard(board.id, t));
                  setRenaming(false);
                }}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <>
                <h2 className="q-board__title">{board.title}</h2>
                {controls && (
                  <span className="q-row__actions">
                    <Button variant="subtle" size="sm" onClick={() => setRenaming(true)}>
                      Rename
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => removeBoard(board)}>
                      Delete
                    </Button>
                  </span>
                )}
              </>
            )}
          </div>

          {open && <Composer key={board.id} boardId={board.id} onAsked={refresh} />}

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
        </>
      )}
      {dialog}
    </div>
  );
}

/**
 * The "+ Board" tab. Opens into a name field that stays open after each board
 * it creates, so names can be entered back to back. A paste with several
 * lines creates one board per line, in order. Escape (or emptying and
 * leaving the field) closes it.
 */
function AddBoard({
  autoOpen,
  onCreate,
  onError,
}: {
  autoOpen: boolean;
  onCreate: (title: string) => Promise<BoardDTO>;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(autoOpen);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (titles: string[]) => {
    const names = titles.map((t) => t.trim()).filter(Boolean);
    if (names.length === 0 || busy) return;
    setBusy(true);
    try {
      for (const name of names) await onCreate(name);
      setTitle("");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className="q-tabs__add" onClick={() => setEditing(true)}>
        + Board
      </button>
    );
  }
  return (
    <form
      className="q-tabs__new"
      onSubmit={(e) => {
        e.preventDefault();
        void create([title]);
      }}
    >
      <Input
        aria-label="New board name"
        placeholder="Presenter name, then Enter"
        value={title}
        maxLength={120}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text.includes("\n")) {
            e.preventDefault();
            void create(text.split(/\r?\n/));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTitle("");
            setEditing(false);
          }
        }}
        onBlur={() => {
          if (!title.trim() && !busy) setEditing(false);
        }}
      />
    </form>
  );
}
