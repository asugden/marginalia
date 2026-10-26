// Staff: every board in the course. Name a board (one per presenter, say),
// open it when that talk starts, close it when it ends. New boards start as
// drafts, which students can't see.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Input, PageHeader, Section, useConfirm } from "../../../components/index.js";
import { createBoard, deleteBoard, listBoards, updateBoard, type BoardDTO } from "../api.js";
import { usePoll } from "./usePoll.js";
import { BoardCard } from "./BoardCard.js";

export function StaffBoardsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const base = `/course/${courseId}/instructor/questions`;
  const [boards, setBoards] = useState<BoardDTO[] | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const reload = useCallback(() => {
    if (!courseId) return;
    listBoards(courseId)
      .then((r) => setBoards(r.boards))
      .catch((e) => setError((e as Error).message));
  }, [courseId]);

  useEffect(reload, [reload]);
  // Counts move while a board is open.
  usePoll(reload, 10_000, boards?.some((b) => b.status === "open") ?? false);

  const create = async () => {
    const t = title.trim();
    if (!t || !courseId) return;
    setCreating(true);
    setError(null);
    try {
      await createBoard(courseId, t);
      setTitle("");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (b: BoardDTO) => {
    const ok = await confirm({
      title: `Delete “${b.title}”?`,
      body:
        b.questionCount > 0
          ? `Its ${b.questionCount} question${b.questionCount === 1 ? "" : "s"} will be deleted too.`
          : undefined,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await act(() => deleteBoard(b.id));
  };

  return (
    <div className="ds-staff-page">
      <PageHeader
        eyebrow="Instructor · Review"
        title="Questions"
        scope="One board per presenter. Open a board and everyone in the course is prompted to ask questions; they appear for the whole class without names."
      />

      <Section kicker="New board">
        <form
          className="q-new"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            aria-label="Board name"
            placeholder="e.g. Team 3 — Protein folding"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" variant="primary" loading={creating} disabled={creating || !title.trim()}>
            New
          </Button>
        </form>
      </Section>

      {error && <p className="error">{error}</p>}

      <Section kicker="Boards" meta={boards ? String(boards.length) : undefined}>
        {boards === null ? (
          <p className="muted">Loading…</p>
        ) : boards.length === 0 ? (
          <p className="muted">No boards yet.</p>
        ) : (
          <div className="app-list">
            {boards.map((b) => (
              <BoardRow
                key={b.id}
                board={b}
                href={`${base}/${b.id}`}
                onStatus={(status) => act(() => updateBoard(b.id, { status }))}
                onRename={(t) => act(() => updateBoard(b.id, { title: t }))}
                onDelete={() => remove(b)}
              />
            ))}
          </div>
        )}
      </Section>
      {dialog}
    </div>
  );
}

function BoardRow({
  board,
  href,
  onStatus,
  onRename,
  onDelete,
}: {
  board: BoardDTO;
  href: string;
  onStatus: (s: "open" | "closed") => void;
  onRename: (title: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(board.title);

  const renameForm = (
    <form
      className="q-new"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        await onRename(draft.trim());
        setRenaming(false);
      }}
    >
      <Input
        aria-label="Board name"
        value={draft}
        maxLength={120}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>
        Save
      </Button>
      <Button
        variant="subtle"
        size="sm"
        onClick={() => {
          setDraft(board.title);
          setRenaming(false);
        }}
      >
        Cancel
      </Button>
    </form>
  );

  return (
    <BoardCard
      board={board}
      href={renaming ? null : href}
      title={renaming ? renameForm : undefined}
      meta={
        !renaming && (
          <span className="q-row__actions">
            {board.status === "open" ? (
              <Button variant="subtle" size="sm" onClick={() => onStatus("closed")}>
                Close
              </Button>
            ) : (
              <Button variant="subtle" size="sm" onClick={() => onStatus("open")}>
                {board.status === "draft" ? "Open" : "Reopen"}
              </Button>
            )}
            <Button variant="subtle" size="sm" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </span>
        )
      }
    />
  );
}
