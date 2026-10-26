// A board as a card in any list: the student list, the dashboard panel, and
// (with actions in `meta`) the staff list.

import type { ReactNode } from "react";
import { ItemCard } from "../../../components/index.js";
import type { BoardDTO } from "../api.js";
import { StatusBadge } from "./StatusBadge.js";

export function BoardCard({
  board,
  href,
  title,
  meta,
}: {
  board: BoardDTO;
  href: string | null;
  /** Replaces the title (the staff list's inline rename form). */
  title?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <ItemCard
      kind="questions"
      seed={board.id}
      title={title ?? board.title}
      href={href}
      badges={
        !title && (
          <>
            {" "}
            <StatusBadge status={board.status} />
          </>
        )
      }
      sub={title ? null : `${board.questionCount} question${board.questionCount === 1 ? "" : "s"}`}
      meta={meta}
    />
  );
}
