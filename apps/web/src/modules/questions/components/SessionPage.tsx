// One session: its boards, one per presenter, in order. Staff open and close
// the session here and add, rename or delete boards — including mid-session,
// for the presenter nobody planned for.

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, PageHeader, Section, useConfirm } from "../../../components/index.js";
import {
  ApiError,
  createBoard,
  deleteBoard,
  getSession,
  renameBoard,
  updateSession,
  type BoardDTO,
  type SessionDTO,
} from "../api.js";
import { BoardCard } from "./cards.js";
import { boardPath, questionsBase } from "./paths.js";
import { CreateForm, RenameForm } from "./RenameForm.js";
import { StatusBadge } from "./StatusBadge.js";
import { usePoll } from "./usePoll.js";

export function SessionPage({ staffShell = false }: { staffShell?: boolean }) {
  const { courseId = "", sessionId = "" } = useParams<{ courseId: string; sessionId: string }>();
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [boards, setBoards] = useState<BoardDTO[]>([]);
  const [staff, setStaff] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const reload = useCallback(() => {
    getSession(sessionId)
      .then((r) => {
        setSession(r.session);
        setBoards(r.boards);
        setStaff(r.staff);
        setMissing(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError((e as Error).message);
      });
  }, [sessionId]);

  useEffect(() => {
    setSession(null);
    reload();
  }, [reload]);
  // Question counts move while the session is open.
  usePoll(reload, session?.status === "open" ? 8_000 : 20_000, !!session);

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const base = questionsBase(courseId, staffShell);
  if (missing) {
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

  const remove = async (b: BoardDTO) => {
    const ok = await confirm({
      title: `Delete “${b.title}”?`,
      body: b.questionCount > 0 ? `Its ${b.questionCount} question${b.questionCount === 1 ? "" : "s"} will be deleted too.` : undefined,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await act(() => deleteBoard(b.id));
  };

  const scope = open
    ? "Open. Pick a presenter to read and ask questions — ask as many as you like. Nobody sees who asked."
    : session.status === "closed"
      ? "Closed to new questions. Every board stays readable."
      : "Draft — only course staff can see this session until it's opened.";

  return (
    <div className={staffShell ? "ds-staff-page" : "app-page"}>
      <PageHeader
        eyebrow="Questions"
        title={
          <>
            {session.title} <StatusBadge status={session.status} />
          </>
        }
        scope={scope}
        actions={
          controls ? (
            open ? (
              <Button variant="subtle" onClick={() => act(() => updateSession(session.id, { status: "closed" }))}>
                Close session
              </Button>
            ) : (
              <Button variant="primary" onClick={() => act(() => updateSession(session.id, { status: "open" }))}>
                {session.status === "draft" ? "Open session" : "Reopen session"}
              </Button>
            )
          ) : undefined
        }
      />

      <nav className="q-board__nav" aria-label="Sessions">
        <Link to={base}>← All sessions</Link>
      </nav>

      {controls && (
        <Section kicker="New board">
          <CreateForm
            label="Board name"
            placeholder="e.g. Team 3 — Protein folding"
            onCreate={(t) => act(() => createBoard(session.id, t))}
          />
        </Section>
      )}

      {error && <p className="error">{error}</p>}

      <Section kicker="Boards" meta={String(boards.length)}>
        {boards.length === 0 ? (
          <p className="muted">{controls ? "No boards yet. Add one per presenter." : "No boards yet."}</p>
        ) : (
          <div className="app-list">
            {boards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                href={renaming === b.id ? null : boardPath(courseId, staffShell, session.id, b.id)}
                title={
                  renaming === b.id ? (
                    <RenameForm
                      initial={b.title}
                      onSave={async (t) => {
                        await act(() => renameBoard(b.id, t));
                        setRenaming(null);
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : undefined
                }
                meta={
                  controls &&
                  renaming !== b.id && (
                    <span className="q-row__actions">
                      <Button variant="subtle" size="sm" onClick={() => setRenaming(b.id)}>
                        Rename
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => remove(b)}>
                        Delete
                      </Button>
                    </span>
                  )
                }
              />
            ))}
          </div>
        )}
      </Section>
      {dialog}
    </div>
  );
}
