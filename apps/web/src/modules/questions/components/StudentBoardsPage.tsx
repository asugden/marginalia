// Student: every board that has been opened in this course, newest first, so
// questions from earlier talks stay readable after the fact.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader, Section } from "../../../components/index.js";
import { listBoards, type BoardDTO } from "../api.js";
import { usePoll } from "./usePoll.js";
import { BoardCard } from "./BoardCard.js";

export function StudentBoardsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const base = `/course/${courseId}/questions`;
  const [boards, setBoards] = useState<BoardDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!courseId) return;
    listBoards(courseId)
      .then((r) => setBoards(r.boards))
      .catch((e) => setError((e as Error).message));
  }, [courseId]);

  useEffect(reload, [reload]);
  usePoll(reload, 20_000);

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Questions"
        title="Question boards"
        scope="Questions for each presenter. Everyone sees them; nobody sees who asked."
      />
      {error && <p className="error">{error}</p>}
      <Section kicker="Boards">
        {boards === null ? (
          <p className="muted">Loading…</p>
        ) : boards.length === 0 ? (
          <p className="muted">No boards yet. When one opens in class, a button will appear to take you to it.</p>
        ) : (
          <div className="app-list">
            {boards.map((b) => (
              <BoardCard key={b.id} board={b} href={`${base}/${b.id}`} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
