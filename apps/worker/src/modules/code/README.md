# code (worker)

Server side of **Code**: Python notebooks that run in each student's browser,
with an optional AI tutor beside them.

## Why this module exists

Teaching early machine learning with hosted notebooks has two recurring costs.
Students spend the first week installing libraries, and consumer notebook
tools now autocomplete whole solutions as the student types. This module runs
Python in the browser, so there is nothing to install, and it ships an editor
with no code completion at all. Help comes from a tutor the instructor turns
on per assignment, and that tutor is instructed not to write the solution.

## The server never runs student code

Python runs in the student's browser through Pyodide (CPython compiled to
WebAssembly). This worker stores notebooks, the tutor conversation, and
submitted snapshots, and proxies tutor turns through `LLMProvider`. There is
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
2. **Per assignment, default OFF: the AI tutor.** `code_assignments.ai_enabled`.
   Enforced in `sendMessageRoute` on every turn, not only by hiding the panel.
   A scratch notebook (no assignment) never has a tutor.

## Data model

See `schema.sql`; the migration is `packages/schema/migrations/0024_code_module.sql`.

- `code_assignments`: title, Markdown instructions, starter notebook, tutor
  switch and optional tutor guidance, optional `due_at`, `archived_at`.
- `code_notebooks`: one per (student, assignment), or free-standing scratch
  notebooks with `assignment_id IS NULL`. Cells and outputs as JSON.
- `code_messages`: one tutor thread per notebook. Each row records the hash
  of the tutor instructions at send time.
- `code_submissions`: immutable frozen copies, including a frozen copy of the
  tutor transcript (so deleting the live notebook cannot rewrite it).

Every query filters by `course_id`; notebook reads also filter by owner.

## Notebook format

Our own small JSON shape (`types.ts`), not `.ipynb`. **Every output is
structured data, never HTML**: stream text, a result repr, a base64 PNG, a
flattened table, or an error. `notebook.ts#sanitizeContent` rebuilds each
notebook from an explicit field list, drops unknown output kinds, and accepts
only base64 PNG images. This matters because instructors open student
notebooks on their own screens.

Size: a notebook is capped at `MAX_NOTEBOOK_BYTES` (1.8 MB, under D1's row
limit). The client drops figures, oldest first, before it would exceed that.

## The tutor

`buildTutorInstructions` puts the built-in coding-tutor prompt first and
appends the assignment's instructions and any instructor guidance beneath it.
Guidance is added, never substituted, so the no-solutions floor holds even
when an instructor's text doesn't mention it.

The tutor reads the notebook **as last saved on the server**, not a copy sent
with the message; the client flushes its save first. `buildNotebookContext`
keeps the focused cell and its neighbours when the notebook exceeds the
budget, and says what it omitted. Tutor turns use the deployment's
side-panel default model (`provenanceDefaultModel`).

There is deliberately no bring-your-own-key path here.

## Routes

See the header of `routes.ts`. In brief: assignment CRUD and roster
(instructor), notebook CRUD (owner), tutor history and SSE turn (owner, tutor
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
- Recording where code came from (paste tracking, in the spirit of the
  provenance module).
- Deep-learning frameworks. PyTorch and TensorFlow have no Pyodide build.
