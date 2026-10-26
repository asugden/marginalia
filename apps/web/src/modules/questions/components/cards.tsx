// Sessions and boards as cards in any list. `title` replaces the name (an
// inline rename form); `meta` carries a row's actions.

import type { ReactNode } from "react";
import { ItemCard } from "../../../components/index.js";
import type { BoardDTO, SessionDTO } from "../api.js";
import { StatusBadge } from "./StatusBadge.js";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function SessionCard({
  session,
  href,
  title,
  meta,
}: {
  session: SessionDTO;
  href: string | null;
  title?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <ItemCard
      kind="questions"
      seed={session.id}
      title={title ?? session.title}
      href={href}
      badges={
        !title && (
          <>
            {" "}
            <StatusBadge status={session.status} />
          </>
        )
      }
      sub={title ? null : plural(session.boardCount, "board")}
      meta={meta}
    />
  );
}

export function BoardCard({
  board,
  href,
  title,
  meta,
}: {
  board: BoardDTO;
  href: string | null;
  title?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <ItemCard
      kind="questions"
      seed={board.id}
      title={title ?? board.title}
      href={href}
      sub={title ? null : plural(board.questionCount, "question")}
      meta={meta}
    />
  );
}
