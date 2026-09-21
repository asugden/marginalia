# examples (web)

Client side of **course-attached examples**. See the worker module's
[README](../../../../worker/src/modules/examples/README.md) for the data model
and the full reasoning behind the two-mechanism privacy split; this file covers
the surfaces.

## The constraint that shapes everything here

`/examples/<slug>` is a public, static, unauthenticated page, and it stays
byte-identical for every viewer. Nothing in this module gates one, and nothing
in this module changes what an ordinary visitor sees.

Course context reaches an example page through exactly one channel: a
`?c=<courseId>` query parameter on a link the student followed from their
course. `ExampleCourseStrip` reads it, checks enrollment, and — only if both
hold — renders a thin band above the page. **With no `?c=`, or with a `?c=` the
viewer isn't enrolled in, the component returns `null` and renders nothing at
all**: no strip, no layout shift, no error. The failure mode is silence, on
purpose, because a public teaching page is the wrong place to surface an auth
problem.

Because it self-suppresses, it is mounted **once, in `apps/web/src/main.tsx`**,
in the `EXAMPLES.map(...)` route factory that builds every `/examples/<slug>`
route:

```tsx
element: lz(
  <>
    <ExampleCourseStrip slug={ex.slug} />
    <ex.Page />
  </>,
),
```

Mounting at the route rather than inside each page means an example added later
picks this up for free, and no example page has to know that courses exist.
Individual example pages need no changes at all.

## Surfaces

- `/course/:courseId/examples` — **student**: the curated list in the
  instructor's order, with any dates and notes, and a Mark complete control per
  row. Links carry `?c=`. (`StudentExamplesPage`)
- `/course/:courseId/instructor/assign/examples` — **instructor**: three
  panels behind a segmented control. (`InstructorExamplesPage`)
  - *Assign* — pick from the `EXAMPLES` registry, set optional assigned/due
    dates and a one-line note, reorder, save. Saving is a whole-list replace.
  - *Usage* — the anonymous aggregate: per-example open and engaged-open
    counts, plus a by-UTC-hour histogram. Every figure passes through the
    small-cohort floor first.
  - *Completion* — the ✓ / — roster.
- `ExampleCourseStrip` — not routed; mounted inside example pages.

### Where the instructor reaches this

Examples are **a kind of assignment**, so on the instructor side they do not
have a tab of their own. The **Assign band**
(`/course/:courseId/instructor/assign`, the `course-items` module) is one list
of every assignable kind — writing, agents, and examples — each row tagged
`[Writing]`, `[Agent]`, or `[Example]`. An example row links to the curation
surface here.

Since the assignment wrapper landed, that list is backed by a real table
(`course_items`) rather than being a presentation-layer union: the wrapper owns
each item's dates, title, and order. **This module is unchanged by that.**
`course_examples`, `example_usage_daily`, and `example_completions` all stay
exactly where they are; a wrapper row points at an example by `slug` through
`payload_ref` and owns nothing else. The privacy split is physically intact —
see "The privacy invariant" in
`apps/worker/src/modules/course-items/README.md` for why `course_items` cannot
become a join path to the anonymous aggregate.

Completion for an example on that list is **"marked done"** — this module's
opt-in binary claim, labelled with its own verb so it never reads as the
server-derived evidence an agent or a submission carries.

Both older paths still resolve: `/course/:id/instructor/examples` and
`/course/:id/instructor/assignments/examples` redirect here.

The one figure the combined list borrows from this module is **how many students
marked each example complete** — mechanism (b), the opt-in binary claim. It is
computed from the completion roster the Completion panel already fetches, so it
costs no extra call, and it is the only per-example number that may appear
there. Nothing from `example_usage_daily` is shown on that list: putting an open
count on the same row as a completion count would invite exactly the correlation
the split exists to prevent, even though the tables are never joined in SQL.

The student side is untouched — `/course/:courseId/examples` is still its own
surface with its own nav entry, because for a student an example *is* a distinct
thing they open and work through.

The Usage and Completion panels are separate views and there is deliberately no
combined one. They read two tables that cannot be joined — usage has no
identity, completion has no counts — and a single table with students down the
side would imply a correlation the data does not support.

## What the student is told

`RecordingNotice` is the single source of that wording, rendered in both places
a student might act: the course list (full form) and the strip (compact form).
It is one shared component precisely so the two copies cannot drift.

**If the recorded mechanism changes, this text changes in the same commit.** It
is not boilerplate — an accurate description is what the arrangement rests on,
and the module's whole posture (matching the provenance module: social
contract, not detection; students see what instructors see) fails if the notice
describes something other than what the server actually stores.

## The engagement signal

`ExampleCourseStrip` sends two beacons through `sendUsageBeacon`:

- **open** — once, as soon as enrollment resolves.
- **engaged** — at most once per visit, on the first pointer or key event that
  happens *after* a 10s dwell floor (`ENGAGEMENT_MIN_DWELL_MS`), after which the
  listeners detach.

Both halves of the engaged condition matter. Requiring an interaction keeps a
bounce from reading as use; requiring the dwell keeps a stray click on the way
to the back button from reading as use either. The bias is toward
under-counting, which is the right direction: an instructor acting on an
inflated engagement number is worse off than one reading a conservative floor.

Beacons are `keepalive` fetches whose promises are swallowed. A 401 or 403 (a
signed-out viewer, someone who isn't in the course) is an expected outcome, not
an error to display — they see the example regardless.

## Reading suppressed counts

`opens` / `engagedOpens` come back as `null` when the true count is non-zero but
below `minCohort`. Render that as "fewer than N" — never as `0`, and never as a
guess. `describeCount` in `InstructorExamplesPage.tsx` is the one place that
formatting lives.

## Registry coupling

Curation rows store a `slug` only. Both the student list and the instructor
panels resolve it through `findExample` from
`apps/web/src/examples/registry.ts` and **skip anything the registry no longer
knows**, so a deploy that removes an example leaves a stale row inert rather
than producing a dead link.
