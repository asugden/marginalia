# examples (worker)

Server side of **course-attached examples**. An instructor curates a subset of
the standalone interactive examples for their course, optionally with dates,
and gets two narrow signals about how the class used them.

## What this module does not do

It does **not** gate the examples. `/examples/<slug>` stays public, static, and
byte-identical for every viewer — anonymous visitor, enrolled student, and
instructor all see the same page. Course context reaches an example only as a
`?c=<courseId>` query parameter on a link a student followed from their course,
and all it does is add a thin strip above an otherwise unchanged page. Remove
the parameter and the page is exactly what it was before this module existed.

That constraint is the reason examples are worth having: they are things an
instructor can link to from a syllabus, a slide, or a message to a colleague at
another institution, and none of those links should demand a login.

## The two-mechanism split

Usage is recorded by **two mechanisms that are deliberately never joined.**
They answer two different questions, and the pair of them is specifically
chosen so that a third question — "what did this particular student do, and
when?" — cannot be answered at all.

### (a) `example_usage_daily` — anonymous aggregate

Answers: *did the class use these outside of the room, and roughly when?*

- **No user identifier.** Not a nulled column, not a hash, not a session or
  device id. The column is absent. A hash is not anonymity at a class-sized
  cohort — thirty candidate inputs is a lookup table, not a search — and a
  nullable column is one migration away from being populated. Absence is the
  only version of this guarantee that survives future contributors.
- No IP, user-agent, or Referer is read on the write path either, though
  Cloudflare puts all three within reach of the handler.
- Rows are tallies, not events: written by an `INSERT … ON CONFLICT … DO
  UPDATE SET opens = opens + …`, so there is no insertion order and nothing to
  sequence.
- Time resolution is a UTC day plus an hour bucket, and no finer. Hour
  granularity answers the interesting question (steady use across the week vs.
  a spike the night before a deadline); a raw timestamp would be a
  quasi-identifier, since a single open at 03:14 in a class of thirty is one
  person.
- `opens` counts page loads with course context. `engaged_opens` counts only a
  genuine interaction with the example, at most once per visit, so a bounce
  doesn't read as use. Comparing the two is most of the value: 40 opens and 3
  engaged means something quite different from 40 and 35.

**Why the beacon still requires a session.** Without one, anyone could POST a
`courseId` and inflate the counters, and the number would be worthless. The
session is used for exactly one check — is this caller enrolled in the course
they named — and then discarded. `repo.bumpUsage` accepts no identity
parameter, so this is a property of the call signature rather than a promise
about the handler's discipline.

**The small-cohort floor.** `MIN_COHORT = 5` in `handlers.ts`. Any non-zero
count below it is reported as "fewer than 5" rather than an exact number, for
buckets and for per-slug totals alike. A stored aggregate is not automatically
an anonymous one: "1 open, Tuesday 23:00" plus an instructor's knowledge of who
works late is an identification, even though the row holds no identity. A true
zero is never suppressed — "nobody opened this" is a fact about the assignment,
not about a student. Totals are floored against the **raw** sum, not the sum of
already-floored buckets, which would under-report.

### (b) `example_completions` — opt-in, identified, binary

Answers: *did this student say they finished it?*

One row per `(course, example, student)`, written **only** when the student
presses "Mark complete", and deleted when they un-mark. The student may always
un-mark: the row is their claim about their own work, so retracting it is
theirs to do.

**The rule this table exists under, which future changes must not break:
instructor oversight of examples is binary completion only.** The roster shows
a checkmark or a dash and nothing else. No dwell time, no open counts, no
attempt history, no per-student timeline, no "last seen". `completed_at` is
stored but deliberately not selected by the roster query, because its only use
would be to build the timeline this rule forbids. If a future feature seems to
need per-student detail, the decision to reconsider is that feature, not this
constraint.

### Why split at all

Either mechanism alone would be worse. Identified open-tracking turns a
voluntary resource into surveillance and changes how students use it. Pure
anonymity leaves a student with no way to tell an instructor "I did this" and
an instructor with no way to give credit. Splitting gets both, at the cost of
never being able to correlate them — which is the point, not the price.

This matches the posture stated in the provenance module's README: a social
contract rather than detection, with students seeing exactly what instructors
see. The student-facing surfaces say plainly what is recorded, in both places
where a student might act: the course examples list and the course strip on the
example page itself. **If the mechanism here changes, that wording has to
change with it** — an accurate description is the whole basis of the contract.

## Data model

See `schema.sql` for the shape; `packages/schema/migrations/0021_course_examples.sql`
is authoritative and carries the full reasoning.

- `course_examples` — curation. `(course_id, slug)`, display `ord`, plus
  `assigned_at`, `due_at`, and `note`, all nullable. Dates are optional in both
  directions: "these are worth your time" is a legitimate assignment with no
  deadline at all.
- `example_usage_daily` — (a) above.
- `example_completions` — (b) above.

`slug` is intentionally not a foreign key anywhere. Examples are front-end code
in `apps/web/src/examples/registry.ts`, not rows; a deploy that drops an example
should leave a harmless dangling row rather than fail a constraint. Read paths
skip slugs the registry no longer knows.

## Routes

Mounted by `apps/worker/src/index.ts` at `/api/examples/*`. See `routes.ts`.

- **Instructor** (gated on `enrollments.role = 'instructor'`):
  - `GET /course?courseId=` curated list
  - `PUT /course?courseId=` replace the curated list (whole-list write)
  - `GET /usage?courseId=` aggregate, floored
  - `GET /completions?courseId=` binary roster
- **Student** (signed-in, any enrolled role):
  - `GET /course/mine?courseId=` curated list + own completions
  - `POST /usage` anonymous beacon → `204`
  - `POST /completions` / `DELETE /completions` mark / un-mark

## Invariants

- Every query filters by `course_id`.
- `example_usage_daily` has no user identifier and never will.
- The usage write path takes no identity parameter.
- The completions roster returns binary state only — no timestamps, no counts.
- The beacon returns `204` and does no work after the write. It must never be
  on the critical path of rendering an example.
- Curation is a whole-list replace, applied as one batch, so students never see
  a half-written assignment list.
- Removing an example from the curated list does not delete completions or
  usage. Curating is not retracting history; re-adding it should not make
  students who finished it read as unfinished.

## Not in scope

- Per-student open counts or timelines. See the binary-only rule above.
- Gating example pages behind enrollment. Their being public is the feature.
- Cross-course aggregation. Same reasoning as the provenance module's
  cross-submission non-goal: the comparison an instructor wants requires
  context the tool does not have, and a number would launder that away.
