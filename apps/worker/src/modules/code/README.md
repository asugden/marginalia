# code (worker)

Server side of **Code**: Python notebooks that run in each student's browser,
with an optional AI chat beside them.

## Why this module exists

Teaching early machine learning with hosted notebooks has two recurring costs.
Students spend the first week installing libraries, and consumer notebook
tools now autocomplete whole solutions as the student types. This module runs
Python in the browser, so there is nothing to install, and it ships an editor
with no code completion at all. Help comes from an AI chat the instructor turns
on per assignment, and that chat is instructed not to write the solution.

## The server never runs student code

Python runs in the student's browser through Pyodide (CPython compiled to
WebAssembly). This worker stores notebooks, the AI chat conversation, and
submitted snapshots, and proxies chat turns through `LLMProvider`. There is
no execution sandbox to secure and no per-student compute to pay for.

## Datasets never reach the server

A student's uploaded files live in their browser (IndexedDB) and are mounted
into the Python runtime there. No route in this module accepts a file, and
none should. The cost is stated to students in the Files panel: files are on
that browser only.

## Optional, twice over

1. **Per course, default OFF.** `course_settings.code_enabled` (migration
   0024). A course that never turns it on never sees it: no nav item, no tab,
   no Assign menu entry. For a non-instructor in such a course every route
   answers `404 { code: "code_disabled" }`. Instructors pass, so they can
   author before opening it to the class.
2. **Per assignment, default OFF: the AI chat.** `code_assignments.ai_enabled`.
   Enforced in `sendMessageRoute` on every turn, not only by hiding the panel.
   A scratch notebook (no assignment) never has an AI chat.

## Data model

See `schema.sql`; the migration is `packages/schema/migrations/0024_code_module.sql`.

- `code_assignments`: title, Markdown instructions, starter notebook, chat
  switch and optional chat guidance, optional `due_at`, `mode`
  (`submit` | `practice`), `archived_at`.
- `code_notebooks`: one per (student, assignment), or free-standing scratch
  notebooks with `assignment_id IS NULL`. Cells and outputs as JSON, plus
  `baseline_json`: the starter text each cell began with.
- `code_messages`: one chat thread per notebook. Each row records the hash
  of the chat instructions at send time; assistant rows also keep
  `novel_text`, the reply minus lines already in the notebook.
- `code_events`: append-only edit log, per cell (submit mode only).
- `code_submissions`: immutable frozen copies, including a frozen copy of the
  chat transcript (so deleting the live notebook cannot rewrite it) and the
  origin render (`render_json`).

Every query filters by `course_id`; notebook reads also filter by owner.

## Submission mode

Each assignment is **Submitted** (default) or **Practice**. Practice has no
Submit button, refuses submissions (`400 practice_mode`), and records
nothing (`/events` answers `409 not_tracked`). Scratch notebooks are never
recorded either. Edits are logged only where the log will be read.

## Origins: typed, pasted, from the AI chat, provided

The same model as the writing tool, computed by the same code: every cell is
its own text with its own event log, replayed by
`@marginalia/provenance#buildRender` when the notebook is submitted. An
improvement to retype detection there applies here with no change in this
module. `render.ts` holds only the notebook's policy:

- **provided** — starter text, frozen as `baseline_json` when the student's
  copy is created and replayed before any event. Never counted as typed.
- **llm** — a paste of AI chat text, typing that exactly reproduces it
  (client-side reversion), and, server-side, typed text matching an AI chat
  reply's `novel_text` for 40+ characters *and written after that reply*.
- **pasted** — any other clipboard import. Moving code between this
  notebook's own cells is a verified-or-counted `move` that keeps origins.

**The AI chat-quoting rule.** An AI reply often quotes the student's own code back
to them. Two guards keep that from ever reading as AI-written: the reply's
lines already in the notebook are excluded from `novel_text`, and the match
is time-bounded (`after`) so text written before the reply can't be
attributed to it. Both are pinned by `notebook.test.ts`.

Students never see marks, and a student reading their own submission gets
the notebook without the render, as in the writing tool. They are told in
the notebook, and again in the Submit dialog, that their instructor will see
where the code came from.

The one deliberate difference from the Tiptap tracker: a slow retype of chat
text is logged as a delete followed by an `llm_insert` of the same span, so
replay re-labels it instead of inserting it twice.

## Scratch copies (instructor)

`/course/:id/instructor/code/submissions/:sid/scratch` opens a submission as
a runnable notebook that saves nothing: no notebook writes, no events, no
browser storage for files. It is marked in salmon throughout. The student's
datasets aren't there (they never left the student's browser); the
instructor can add a copy for the session.

## Notebook format

Our own small JSON shape (`types.ts`), not `.ipynb`. **Every output is
structured data, never HTML**: stream text, a result repr, a base64 PNG, a
flattened table, or an error. `notebook.ts#sanitizeContent` rebuilds each
notebook from an explicit field list, drops unknown output kinds, and accepts
only base64 PNG images. This matters because instructors open student
notebooks on their own screens.

Size: a notebook is capped at `MAX_NOTEBOOK_BYTES` (1.8 MB, under D1's row
limit). The client drops figures, oldest first, before it would exceed that.

## The LLM chat

It is called the chat, never a tutor: it's an LLM, and the product says so.

**Voice.** Each assignment picks the chat's voice (`code_assignments.voice_json`)
from the same voices agents use: a built-in library voice, or one of the
instructor's own or shared (`custom-ref`, validated as usable by the saving
instructor, as the agent editor does). No voice means the default library
voice. It's resolved on every turn, so editing a voice reaches the next
message; a deleted voice falls back to the default rather than failing a
student's turn.

`buildChatInstructions` puts the voice first (persona, tone, method), then
`NOTEBOOK_CHAT_RULES` (where the chat is, what it can see, and the
no-solutions floor), then the assignment and any instructor guidance. The
rules are never replaced by a voice or by guidance, so the floor holds
whichever voice is chosen.

The chat reads the notebook **as last saved on the server**, not a copy sent
with the message; the client flushes its save first. `buildNotebookContext`
keeps the focused cell and its neighbours when the notebook exceeds the
budget, and says what it omitted. Chat turns use the deployment's
side-panel default model (`provenanceDefaultModel`).

There is deliberately no bring-your-own-key path here.

In the starter editor, an instructor can try the AI chat on the starter
notebook (`POST /assignments/:id/chat-preview`). Nothing is stored; the
client sends the preview conversation with each turn.

## Routes

See the header of `routes.ts`. In brief: assignment CRUD and roster
(instructor), notebook CRUD (owner), chat history and SSE turn (owner, chat
on), submit and list own submissions (owner), and one submission view (owner
or instructor; anyone else gets the same 404 as a bad id).

## Course items

Code assignments are a `course_items` kind (`"code"`). Create calls
`ensureItem`; edits follow title, archive and due date onto the wrapper
through `sync.ts`. Completion is the verb **submitted**, read from
`code_submissions`.

## Tests

```
npx tsx apps/worker/src/modules/code/notebook.test.ts
```

## Not built yet

- Instructor-provided datasets attached to an assignment.
- The provenance audit panel (sessions, gaps, bursts). It is computed and
  stored per cell in `render_json`, but not yet shown.
- Feedback on submissions, when the writing tool gets it. It belongs beside
  the origin model in a shared package, not copied between the modules.
- Deep-learning frameworks. PyTorch and TensorFlow have no Pyodide build.
