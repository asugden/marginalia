# questions (web)

Client side of the questions module. See the worker module's
[README](../../../../worker/src/modules/questions/README.md) for the data
model (sessions → boards → questions), permissions, and the anonymity
invariant.

## Routes

Each page is mounted under both shells; only the root differs.

| Student | Staff | Page |
|---|---|---|
| `/course/:id/questions` | `/course/:id/instructor/questions` | `SessionsPage` — every session, newest first. Staff create (landing inside the new session), open, close, rename and delete sessions here. Review ▸ Questions in the staff nav. |
| `…/questions/:sessionId/:boardId?` | `…/instructor/questions/:sessionId/:boardId?` | `SessionPage` — the whole session on one page. One route with an optional board, so switching boards never remounts it. With no board in the URL it shows the newest. |

The server's `staff` flag decides which controls appear; `paths.ts` builds
every link.

## UX shape

- **Session page.** Header: the session's name, its state, and (staff) Open /
  Close session. Below it, the boards as a row of tabs with question counts;
  clicking one switches presenter in place. Then the selected board: its
  name (staff: Rename, Delete), a question box while the session is open,
  and every question, oldest first.
- **Building a session, ahead or live.** Staff end the tab row with
  "+ Board". It opens a name field that stays open after each Enter, so a
  lineup can be typed back to back before class, or one presenter added at a
  time during it; each new board is selected as it's made. Pasting several
  lines creates one board per line. Escape closes the field. An empty session
  opens with the field ready.
- **Questions.** A person's own questions carry a "Yours" badge (only they
  see it) and Edit / Delete until the session closes. Staff get Hide / Delete
  on every question. Staff questions look exactly like anyone else's.
- **Live updates.** The page polls every 4 s while the session is open and
  every 20 s otherwise; polling pauses in a hidden tab (`usePoll`). New
  boards appear as tabs on everyone's screen within that interval.
- **The live prompt.** `LiveSessionButton` polls `/live` every 15 s and, while
  a session is open, floats a "Questions open · <session> →" button at the
  bottom of the screen. It is mounted by `StudentLayout`, `CourseLayout`
  (linking into the staff shell), and around the full-screen writing and
  notebook editors in `main.tsx`, so it appears wherever someone is in the
  course. It hides anywhere inside that session; dismissing it lasts until a
  session next opens (per tab, in `sessionStorage`).
- **Dashboard.** Once any session has been opened, the student dashboard
  shows a Questions panel with the three newest sessions and an "All
  sessions" link.
