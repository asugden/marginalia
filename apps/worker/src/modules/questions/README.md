# questions

Anonymous audience questions, collected during class. The use case it was
built for: students present one after another, and the rest of the room
writes questions for each presenter.

## Shape

- **Sessions** are one class meeting ("Presentations — Day 1"). A session is
  the **window**: staff create it as a draft, open it during class, and close
  it after. A closed session can be reopened. A session never returns to
  draft — once students have seen it, it stays visible to them.
- **Boards** belong to a session, one per presenter (or team, or topic), in
  the order staff add them. Staff can add, rename and delete boards at any
  time, including while the session is open.
- **Questions** go on a board. While its session is open, anyone enrolled in
  the course, staff included, may ask on any of its boards, as many as they
  like, and edit or delete their own until the session closes.
- **Everyone sees every question, live, without names.** Staff questions look
  identical to student questions.
- **Staff moderate.** They can hide a question from the class (they still see
  it, marked hidden) or delete it, whether the session is open or closed.
- Deleting a board deletes its questions; deleting a session deletes its
  boards and their questions.

## Anonymity

`question_entries.user_id` records who wrote each question. **No route returns
it**, to anyone: `EntryDTO` has no author field, only `mine`, which tells the
caller which questions are their own. The column exists so that a later,
deliberately built staff view can answer "who took part"; adding one is a
product decision, not a bug fix.

Draft sessions (and their boards) are reported as 404 to students, so titles
stay private until a session opens.

## The live session

`GET /live?courseId=` returns the open session opened most recently
(reopening moves `opened_at` forward, so it counts as new). The web app polls
it from every course page, so a person is offered the session wherever they
are. Keep it a single indexed query.

## Data model

- `question_sessions` — `(id, course_id, title, status, created_by,
  created_at, opened_at, closed_at)`. `status` is `draft | open | closed`.
- `question_boards` — `(id, session_id, course_id, title, position,
  created_at)`.
- `question_entries` — `(id, board_id, course_id, user_id, body, created_at,
  updated_at, hidden_at)`.

See `schema.sql`; the migration is `0035_questions.sql`.

## Routes

Mounted at `/api/questions/*`; see `routes.ts` for the list. Staff means a
course role holding `run_questions` (instructors and TAs).

## Invariants

- Every query is scoped by `course_id`, directly or through a resolved
  session or board.
- No response includes `user_id` or any other author information.
- Students never receive draft sessions, their boards, or hidden questions.
- Writes to questions in a session that isn't open are refused with
  `409 session_closed`, except staff moderation.
