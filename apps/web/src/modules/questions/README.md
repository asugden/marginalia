# questions (web)

Client side of the questions module. See the worker module's
[README](../../../../worker/src/modules/questions/README.md) for the data
model (sessions → boards → questions), permissions, and the anonymity
invariant.

## Routes

Each page is mounted under both shells; only the root differs.

| Student | Staff | Page |
|---|---|---|
| `/course/:id/questions` | `/course/:id/instructor/questions` | `SessionsPage` — every session, newest first. Staff create, open, close, rename and delete sessions here. Review ▸ Questions in the staff nav. |
| `…/questions/:sessionId` | `…/instructor/questions/:sessionId` | `SessionPage` — the session's boards in order. Staff open/close the session and add, rename and delete boards. |
| `…/questions/:sessionId/:boardId` | `…/instructor/questions/:sessionId/:boardId` | `BoardPage` — one presenter's questions. |

The server's `staff` flag decides which controls appear; `paths.ts` builds
every link.

## UX shape

- **Board page.** The session's name as eyebrow, the presenter as title;
  previous / next presenter links and "All boards"; a question box while the
  session is open; then every question, oldest first. A person's own
  questions carry a "Yours" badge (only they see it) and Edit / Delete until
  the session closes. Staff get Close / Reopen session in the header, and
  Hide / Delete on every question.
- **Live updates.** The board polls every 4 s while the session is open and
  every 20 s otherwise; polling pauses in a hidden tab (`usePoll`).
- **The live prompt.** `LiveSessionButton` polls `/live` every 15 s and, while
  a session is open, floats a "Questions open · <session> →" button at the
  bottom of the screen, linking to the session's board list. It is mounted
  by `StudentLayout`, `CourseLayout` (linking into the staff shell), and
  around the full-screen writing and notebook editors in `main.tsx`, so it
  appears wherever someone is in the course. It hides anywhere inside that
  session; dismissing it lasts until a session next opens (per tab, in
  `sessionStorage`).
- **Dashboard.** Once any session has been opened, the student dashboard
  shows a Questions panel with the three newest sessions and an "All
  sessions" link.
