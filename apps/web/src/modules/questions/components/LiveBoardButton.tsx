// The "a board just opened" prompt. Mounted by every course shell (and the
// full-screen editors, which live outside them), so it reaches a person
// wherever they are in the course. It polls /live and, while some board is
// open, shows a floating button that jumps to it — unless they are already on
// that board, or dismissed it. Dismissal is remembered per opening, so a board
// that closes and reopens prompts again.

import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { liveBoard, type BoardDTO } from "../api.js";
import { usePoll } from "./usePoll.js";

const POLL_MS = 15_000;
const DISMISS_KEY = "marginalia.questions.dismissed";

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function LiveBoardButton({
  courseId,
  staff = false,
}: {
  courseId: string;
  /** Link to the staff board page instead of the student one. */
  staff?: boolean;
}) {
  const location = useLocation();
  const [board, setBoard] = useState<BoardDTO | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  const refresh = useCallback(() => {
    liveBoard(courseId)
      .then((r) => setBoard(r.board))
      // A failed poll leaves the last answer standing; the next one retries.
      .catch(() => {});
  }, [courseId]);

  // First check on mount (and on switching course), then on the interval.
  useEffect(() => {
    setBoard(null);
    refresh();
  }, [refresh]);
  usePoll(refresh, POLL_MS);

  if (!board) return null;
  const href = staff
    ? `/course/${courseId}/instructor/questions/${board.id}`
    : `/course/${courseId}/questions/${board.id}`;
  if (location.pathname === href) return null;
  const key = `${board.id}:${board.openedAt ?? ""}`;
  if (dismissed === key) return null;

  const dismiss = () => {
    setDismissed(key);
    try {
      sessionStorage.setItem(DISMISS_KEY, key);
    } catch {
      // Blocked storage: the dismissal lasts until this page reloads.
    }
  };

  return (
    <div className="q-live" role="status">
      <Link className="q-live__go" to={href}>
        <span className="q-live__dot" aria-hidden />
        <span className="q-live__text">
          <span className="q-live__kicker">Questions open</span>
          <span className="q-live__title">{board.title}</span>
        </span>
        <span className="q-live__arrow" aria-hidden>
          →
        </span>
      </Link>
      <button type="button" className="q-live__close" aria-label="Dismiss" title="Dismiss" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
