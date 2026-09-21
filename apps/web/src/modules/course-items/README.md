# course-items (web)

Client for the **assignment wrapper** — the Assign band, one list showing
everything a course has assigned regardless of kind.

Server side and the full rationale:
`apps/worker/src/modules/course-items/README.md`.

## The page

`AssignPage` at `/course/:courseId/instructor/assign`. One list, every kind —
writing, agents, and examples today; readings and discussions later. **A new
content type lands here as a row, not as a new tab.** That is the point of the
wrapper: the nav had been growing a tab per content type, which scaled badly
and said nothing true about how the pieces relate.

It supersedes the earlier combined `AssignmentsPage` (provenance), which
unified writing and examples in the presentation layer only. Here the union is
real — one table, one ordering, each row resolving its own payload.

## The rule that governs the status column

**Completion is not one concept, and this page must never imply it is.**

Each kind reports a different verb, from a different source:

| kind | verb | source | nature |
|---|---|---|---|
| Writing | *submitted* | a live submission | artifact exists |
| Agent | *finished* | a conversation reached its backbone exit | **server-derived** |
| Example | *marked done* | the student pressed "Mark complete" | self-reported |

A backbone exit is **evidence**; a checkbox is a **claim**. One shared
checkmark across all three would quietly present a self-report as something
verified — the error the provenance module's no-false-positives rule exists to
prevent.

`ItemCompletionDTO` is a discriminated union with a **different field name per
arm** (`submitted` / `finished` / `markedDone`), so there is no shared boolean
to read and rendering one forces the caller to name its kind. `completionLabel()`
is the single place the verb mapping lives — **render its output verbatim**;
never re-derive a tick from the boolean inside the union, and never add a
`complete: boolean` helper.

There is no score, no verdict, no risk column, and no per-student grid on this
page. Class-wide state lives on the per-module rosters, where each kind's own
rules already apply.

## Privacy

This module never reads example usage. The anonymous aggregate
(`example_usage_daily`) has no user column and must never become joinable to an
identified per-student row — see the examples module README. The only
completion signal for an example here is `example_completions`, the student's
own opt-in claim, and it arrives already resolved by the worker for the calling
user alone. There is no client-side path to aggregate usage at all.

`listCourseItems` returns the **caller's own** completion state, even for an
instructor. The page shows it as "you: finished" so an instructor previewing
their own course sees their own state and nobody mistakes it for the class's.

## Labels

`kindLabel()` owns the type names. **`Agent` is decided and stays**: in an AI
course the real term is part of the content, so a student learning that the
thing they talk to is an agent is pedagogically useful rather than jargon
leakage. Guided vs. free-form renders as a *property* badge on the row, not as
a separate type.

## Supplements

An item with **both dates null** is a recommended supplement — offered but
never scheduled, available the whole term, never late. It is a first-class
state, not an empty one, and it renders as "Supplement — always available"
rather than as a blank. Every agent that predates the wrapper is in this state
after migration 0022's backfill, which is what makes that backfill behaviour-
preserving.

## Dangling rows

A wrapper whose payload no longer resolves (deleted agent, dropped example
slug) is **shown, not hidden**, with a "content missing" badge and a plain
explanation. Students never see it; the instructor is the only one who can
clear it, so hiding it would leave them with no way to understand why something
vanished.

## Files

- `api.ts` — typed fetch wrappers, the `ItemCompletionDTO` union, and the
  `kindLabel` / `completionLabel` / `isSupplement` helpers.
- `components/AssignPage.tsx` — the Assign band.
- `index.tsx` — barrel for the router.
