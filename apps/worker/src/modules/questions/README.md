# questions

Anonymous audience questions, collected on **boards** during class. The use
case it was built for: students present one after another, and the rest of
the room writes questions for each presenter. Staff make one board per
presenter (or per team, or per anything), open it for a window, and close it.

## Shape

- **Boards** belong to a course and carry a free-text title. Staff create
  them as drafts, then open and close them; a closed board can be reopened.
  A board never returns to draft — once students have seen it, it stays
  visible to them. Deleting a board deletes its questions.
- **Questions** can be written by anyone enrolled in the course, staff
  included, while the board is open. A person may ask several, and may edit
  or delete their own until the board closes.
- **Everyone sees every question, live, without names.** Staff questions look
  identical to student questions.
- **Staff moderate.** They can hide a question from the class (they still see
  it, marked hidden) or delete it, open or closed.

## Anonymity

`question_entries.user_id` records who wrote each question. **No route returns
it**, to anyone: `EntryDTO` has no author field, only `mine`, which tells the
caller which questions are their own. The column exists so that a later,
deliberately built staff view can answer "who took part"; adding one is a
product decision, not a bug fix.

Drafts are reported as 404 to students, so a board's title stays private until
it opens.

## The live board

`GET /live?courseId=` returns the open board opened most recently (reopening a
board moves `opened_at` forward, so it counts as new). The web app polls it
from every course page, so a student is offered the board wherever they are.
Keep it a single indexed query.

## Data model

- `question_boards` — `(id, course_id, title, status, created_by, created_at,
  opened_at, closed_at)`. `status` is `draft | open | closed`.
- `question_entries` — `(id, board_id, course_id, user_id, body, created_at,
  updated_at, hidden_at)`.

See `schema.sql`; the migration is `0035_questions.sql`.

## Routes

Mounted at `/api/questions/*`; see `routes.ts` for the list. Staff means a
course role holding `run_questions` (instructors and TAs).

## Invariants

- Every query is scoped by `course_id`, directly or through a resolved board.
- No response includes `user_id` or any other author information.
- Students never receive draft boards or hidden questions.
- Writes to a closed board's questions are refused with `409 board_closed`,
  except staff moderation.
