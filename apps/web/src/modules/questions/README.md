# questions (web)

Client side of the questions module. See the worker module's
[README](../../../../worker/src/modules/questions/README.md) for the data
model, permissions, and the anonymity invariant.

## Routes

- `/course/:id/questions` — student: every opened board, newest first.
  (`StudentBoardsPage`)
- `/course/:id/questions/:boardId` — student: one board. (`StudentBoardPage`)
- `/course/:id/instructor/questions` — staff: create, rename, open, close and
  delete boards. Review ▸ Questions in the staff nav. (`StaffBoardsPage`)
- `/course/:id/instructor/questions/:boardId` — staff: one board, with
  Open/Close and per-question Hide and Delete. (`StaffBoardPage`)

Both board pages render `BoardPage`; the server's `staff` flag decides which
controls appear.

## UX shape

- **Board page.** Header with the board's title and state; previous / next
  links to neighbouring boards and "All boards"; a question box while the
  board is open; then every question, oldest first. A person's own questions
  carry a "Yours" badge (only they see it) and Edit / Delete until the board
  closes. Staff questions look exactly like anyone else's.
- **Live updates.** The board polls every 4 s while open and every 20 s
  otherwise; polling pauses in a hidden tab (`usePoll`).
- **The live prompt.** `LiveBoardButton` polls `/live` every 15 s and, while a
  board is open, floats a "Questions open · <title> →" button at the bottom
  of the screen. It is mounted by `StudentLayout`, `CourseLayout` (linking to
  the staff page), and around the full-screen writing and notebook editors
  in `main.tsx`, so it appears wherever someone is in the course. It hides on
  the board it points to; dismissing it lasts until a board next opens
  (per tab, in `sessionStorage`).
- **Dashboard.** Once any board has been opened, the student dashboard shows
  a Questions panel with the three newest boards and an "All boards" link.

## State

Pages own their state; nothing is shared through context beyond the course id
in the URL.
