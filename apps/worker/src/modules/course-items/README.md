# course-items (worker)

The **assignment wrapper**: one table naming everything a course assigns, so
scheduling stops being reinvented per content type.

## Why this exists

Three assignable things had grown up independently — agents, writing
assignments, and curated examples — and each had separately invented a title,
a display order, and a pair of optional dates. Readings and discussions would
have been the fourth and fifth copy. Three independent implementations
converging on the same four fields is the argument for a wrapper.

The concept isn't new; it had just never been named. `0001_init.sql` describes
`agents` as "the top-level thing a student picks from a list. What v0.2 called
an *assignment*."

## What it owns, and what it does not

**Owns:** scheduling (`assigned_at` / `due_at`), identity (`title`), ordering
(`ord`), and whether an item is still live (`archived_at`). These are
type-independent — a due date means the same thing whatever is due.

**Does not own:** content, or what "done" means. Each module keeps both. The
wrapper points at a payload through `payload_ref` and never copies, moves, or
supersedes it.

**Nothing moved.** `agents`, `course_examples`, and the provenance tables are
untouched by migration 0022. That is a correctness requirement: all three are
live, and the examples privacy split is enforced by physical table structure,
so relocating rows would have put it at risk for no benefit.

## Completion is not one concept

This is the rule most likely to be broken by a well-meaning change.

There is **no `completed` column in `course_items`**, no completion table in
this module, and no shared boolean anywhere in its types. Each kind already
answers "did this student do it?" its own way, and the four answers are not the
same sort of claim:

| kind | signal | source | nature |
|---|---|---|---|
| `writing` | a live submission attached to the assignment | `provenance_submissions` | artifact exists |
| `agent` | any conversation with `completed_at IS NOT NULL` | `conversations` | **server-derived** |
| `example` | an `example_completions` row | `example_completions` | self-reported |
| `reading` | (self-report, when built) | — | self-reported |
| `code` | any submission to the code assignment | `code_submissions` | artifact exists |

A backbone exit is **evidence**; a checkbox is a **claim**. Flattening them
into one boolean would quietly present a student's self-report as something
verified — the same class of error the provenance module's no-false-positives
rule exists to prevent.

So `ItemCompletionDTO` is a discriminated union with a different field name per
arm — `submitted` / `finished` / `markedDone` — and no shared field to read.
Rendering one requires naming which kind it came from. **Do not add a
`complete: boolean` convenience field:** it would immediately become the thing
every call site reads, and the distinction would be gone.

The student-facing verbs follow from this: writing *submitted*, agent
*finished*, example and reading *marked done*.

### Agent completion specifically

**Any** completed conversation counts. A student may hold several
conversations with one agent, and because completion ends the *backbone* rather
than the conversation, they can keep talking afterwards. Re-opening a finished
tutor to review must never un-finish it — hence `EXISTS` over the whole set
rather than a check on the most recent row. `commitTurn` writes `completed_at =
COALESCE(completed_at, ?)`, so credit once earned is never overwritten.

## The privacy invariant

`example_usage_daily` is anonymous **by structure** — it has no user column, so
no query can re-identify. This module is the thing most likely to break that,
and it is built so it cannot:

- **No query in this module mentions `example_usage_daily`.** Not in `repo.ts`,
  not in `handlers.ts`. This module has no legitimate use for aggregate usage.
- **`course_items` is course data, not per-student data.** One row per assigned
  thing, never one row per student. Joining it to the usage aggregate yields at
  most "this course assigned this slug and the course opened it N times" —
  which the aggregate already said on its own.
- **Example completion is read from `example_completions`**, keyed by slug, the
  identified opt-in table — and from nowhere else.

**The rule for future changes:** no row carrying a user id may become joinable
to `example_usage_daily`. Concretely, do not add a `user_id` to `course_items`,
and do not add a per-student completion table keyed by `course_items.id` for
`kind='example'`. Either would create the join path the split exists to make
impossible. Example completion has a home already; it stays there.

## No verdicts

The provenance module's **no-false-positives** rule governs this surface in
full. The list reports facts — submitted / finished / marked done, and dates
against deadlines — and carries no score, no risk column, no "concern" flag,
and no aggregate that reads as one. Lateness, where shown, is
`submitted_at > due_at` computed at read time and never stored, so moving a
deadline is the whole of the remedy.

There is deliberately **no course-wide completion matrix here**. `GET
/course-items` returns the *caller's own* state, even for an instructor.
Class-wide state lives on the per-module rosters, which is where each kind's
own rules already apply; a combined grid would put four different kinds of
evidence side by side where they would read as equivalent.

## Keeping wrappers in step

The modules that own the payloads call `sync.ts` at the moments a payload
changes, so the Assign list can never drift from what a course actually has:

- **agents** — `ensureItem` on create and on copy-into-course,
  `renameItemForPayload` on title change, `removeItemForPayload` on delete.
- **writing** — `ensureItem` on create, `renameItemForPayload` and
  `setArchivedForPayload` on edit, `removeItemForPayload` on delete.
- **code** — `ensureItem` on create; `renameItemForPayload`,
  `setArchivedForPayload` and `setDueForPayload` on edit;
  `removeItemForPayload` on delete. The code assignment's editor owns its one
  due date, so the wrapper follows it.
- **examples** — `syncExampleItems` after every save of the curated list:
  creates wrappers for new slugs, deletes them for dropped slugs, and copies
  dates and note from the curation row (the editor where those are set).

Sync flows one way, payload → wrapper, and never touches a payload. A wrapper
that already exists keeps its own scheduling; a rename flows through only
while the wrapper still carries the payload's previous title, so a deliberate
override on the Assign list survives. Example wrappers store the slug as their
title and the Assign page resolves the display name from the registry.

Migration 0023 is the one-time catch-up for writing and examples that existed
before this sync did; 0022 did the same for agents.

## Payload resolution

`payload_ref` is interpreted by `kind`:

| kind | `payload_ref` is |
|---|---|
| `writing` | `provenance_assignments.id` |
| `agent` | `agents.id` |
| `example` | `course_examples.slug` (a slug — examples are front-end code, so there is no row id) |
| `reading` | reserved; not built |

It is intentionally **not a foreign key**. It cannot be one (it targets three
tables plus a slug that is no table's row), and it should not be: deleting an
agent leaves a dangling wrapper the read path reports as `dangling: true`,
rather than cascading away an instructor's schedule. Dangling rows are surfaced
rather than hidden so an instructor can see why something vanished from the
student list and clean it up.

Resolution is three bulk reads per request, not one query per row, so a course
with fifty items costs a fixed handful of queries.

## Sections

A course "section" is coming. When it lands, `course_items` gains one nullable
`section_id` and slots in, because scheduling and grouping will then live in
one table instead of three. The column is deliberately **left out** for now
rather than added unused. `ord` is kept section-shaped — dense within a course,
instructor-controlled, no meaning attached to the absolute value — so adding it
later is a migration, not a redesign.

## Routes

Mounted by `apps/worker/src/index.ts` at `/api/course-items/*`. See `routes.ts`.

- **Any enrolled role:** `GET /?courseId=` — combined list + caller's own
  completion. `includeArchived=1` is honoured for instructors only.
- **Instructor:** `POST /` (assign an existing payload), `PATCH /:id`,
  `DELETE /:id` (unassign), `POST /reorder`.

## Invariants

- Every query filters by `course_id`.
- No query in this module touches `example_usage_daily`.
- `course_items` has no user column and must never gain one.
- Completion is reported per kind with distinct verbs, never as a shared
  boolean.
- `POST` verifies the payload lives in the **same course** before writing the
  wrapper. `payload_ref` carries no FK, so this check is the only thing
  standing in for one — without it a caller could schedule another course's
  agent.
- `kind` and `payload_ref` are not patchable. Redirecting a scheduled row at
  different content would change what a student sees under a link they hold.
- Unassigning deletes the wrapper only. The payload and all student work
  against it survive.
- Archiving a wrapper does not archive its payload — different lifetimes.
- One wrapper per payload per course, enforced on create. Migration 0022's
  verification queries check the same property for the agent backfill.

## Not in scope

- Authoring payloads. Creating an agent or a writing assignment stays with the
  module that owns it; this endpoint schedules content, it does not write it.
- A combined per-student roster. See "No verdicts".
- Discussions. Planned to live in this same space, not built.

## Files in this folder

- `README.md` — this file.
- `routes.ts` — dispatch, mounted at `/api/course-items/*`.
- `handlers.ts` — request handlers, payload + completion resolution.
- `repo.ts` — D1 queries. Organised so the completion reads sit in one clearly
  labelled section, per kind.
- `types.ts` — row/DTO shapes, including the `ItemCompletionDTO` union.
- `schema.sql` — reference snapshot. The authoritative migration is
  `packages/schema/migrations/0022_course_items.sql`, which carries the full
  reasoning and the backfill's verification queries.
