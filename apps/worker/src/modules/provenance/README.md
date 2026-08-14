# provenance (worker)

Server side of the **provenance writing tool** — a writing
environment that tracks the origin of every word so students and
instructors can have an honest conversation about how a document
came to be.

## Why this module exists

LLM use in student writing is universal. The interesting question
isn't "did the student use an LLM" but "which parts of this document
did the student actually compose, and how was the LLM used along the
way." This module exists to make that visible, by mutual agreement,
without surveilling the student.

The framing is **social contract**, not detection. Students see
exactly what their instructor will see. Submissions are shared via a
link the student generates and chooses to send — there is no covert
reporting.

## Scope at MVP

- Document storage with per-word provenance markers.
- LLM chat side-panel with selectable agents (system prompts).
  Server logs conversations and which agent was used.
- Two LLM credential paths:
  1. Institution-default key via the existing `LLMProvider`.
  2. Student-supplied key passed per-request from the browser; used
     transiently, never stored server-side.
- Append-only edit-event log per document. Enables instructor
  "scrub through snapshots" without storing full snapshots.
- Sharable submission link (unguessable token, no auth required to
  view) showing the document with color-coded words and optional
  drill-down into conversation history.

## Out of scope at MVP

- Keystroke-timing **classification**. Timing is recorded
  (`edit_events.timing_blob`) but no classifier reads it. "Real
  composition vs. copying" is a later pass and may live in `packages/`
  so other modules can reuse it. References for the eventual approach:
  - Zhang et al., "Detecting Plagiarism via Keystroke Logs" (JEDM,
    2024)
  - The Buffalo keystroke dataset (Data in Brief, 2023)

  The slice-8 rate ceiling (below) is **not** that classifier — it is a
  single physical-plausibility bound, not a model of composition.
- Cross-submission aggregation. This is a standing **non-goal**, not a
  deferral — see "Audit" below.
- Rich formatting beyond plain text + bold/italic/headings/lists.
- LMS integration.

Since slice 8, server-side derivation and log audit are **in** scope; the
client is no longer trusted to classify on its own.

## Provenance model

Every word in a document has a current **origin**:

| origin   | label ("from LLM", not "unknown")                        | color  |
|----------|----------------------------------------------------------|--------|
| `human`  | Typed by the student. — "typed"                          | blank  |
| `llm`    | Inserted from an LLM conversation. — "from LLM"          | blue   |
| `pasted` | Arrived via the clipboard. — "pasted"                    | amber  |
| `edited` | Browser spellcheck/autocorrect/Grammarly. — "autocorrect"| green  |

`pasted` covers **both** text that was pasted and left alone, and text that was
pasted and later retyped by hand (the latter derived server-side at mint — see
the transition rules). There is deliberately no separate origin for the retyped
case: it is the same fact — content entered this document through the clipboard
— and how it travelled from clipboard to final text changes neither what
happened nor what a reader should do about it. Resist adding one back.

**What `pasted` does and does not claim.** It says content entered this
document via the clipboard. It says nothing about where the clipboard content
came from: a model, an earlier draft, and the student's own notes are
indistinguishable here, by construction. This is acceptable only because
students are told **not to paste** — so the mark reports a rule stated up front
rather than inferring an intent the system cannot observe. Label it accordingly
in any new surface: never "AI-generated", never "suspected".

Colors are the shared status tokens (`--status-info-*` for `llm`,
`--status-warning-*` for `pasted`, `--status-success-*` for `edited`) and must
be identical on every surface: editor marks, legend swatches, the snapshot
render, and the instructor origin bars. Never hardcode literals — a branded
deploy re-tints these.

Transition rules (these are normative — implementation must match):

- **Human types in empty space** → `human`.
- **Student clicks "insert" on an LLM message** → inserted words
  marked `llm`, linked to the source message id.
- **Paste event** → pasted words marked `pasted`.
- **Browser word replacement** — spellcheck, autocorrect, or a
  grammar tool (the browser's `inputType === "insertReplacementText"`)
  → logged as a `replace` event, marked `edited`. Kept distinct from
  `paste` so autocorrect isn't lumped in with clipboard content. We
  deliberately do **not** classify generic select-and-retype as
  `edited` (it produces too many false positives); only the browser's
  own replacement signal counts. A replacement appears in the log as a
  `delete` (old word) + `replace` (new word) pair.
- **Reversion**: if typed text exactly re-types a known LLM
  contribution (≥ `MIN_REVERSION_LENGTH`, whitespace-normalized) it
  flips to `llm`. This protects against the "type LLM output verbatim
  to launder it" loophole while not penalising natural re-typing of
  common phrases (the length floor). Implemented client-side: the
  tracker keeps an in-memory index of LLM contributions seeded by
  `insertLlmText` and rehydrated on load from existing `origin="llm"`
  runs (`MIN_REVERSION_LENGTH` lives in the client tracker, not here).
- **Move** (slice 8): a paste of text cut or copied from *this same
  document* within 30s keeps the origins it already carried, logged as
  a `move` rather than a `paste`. Rearranging your own paragraphs is
  ordinary writing and must not read as importing. Copy is treated the
  same as cut — the distinction that matters is inside vs. outside the
  document, not moved vs. duplicated. The server re-verifies each move
  against a prior delete of the same text; an unverifiable move is
  counted in the audit block (a *copy* leaves no delete event, so this
  is a soft signal, not proof of anything) and its restored origins are
  still honoured.
- **Retype** (slice 8): at mint time the server fingerprints the final
  text against everything that entered via clipboard or chat panel
  (`paste` + `llm_insert` event text) and re-marks matching `human`
  runs as **`pasted`**. Requires a ≥ 40-character contiguous match.
  Deliberately generous: common phrasing recurs naturally, and a short
  coincidental overlap is not evidence of anything. This closes the
  "paste it, delete it, type it back in" laundering path, which the
  client cannot be trusted to detect on its own.

The current origin is computed from the append-only
`edit_events` log; the document table caches the latest rendered
state for fast loads. Snapshots at arbitrary timestamps are
reconstructable by replaying events up to that time.

## Audit (slice 8)

At mint time `render.ts` measures the event log and stores the result in
`render_json.audit`. **Every field is a measurement, never a verdict.**

| field | what it measures |
|-------|------------------|
| `sessions`, `spanMs`, `activeMs`, `longestGapMs` | shape of the writing process |
| `finalSessionShare` | share of surviving text from the last session |
| `lengthDrift` | chars the log fails to account for |
| `fastBursts` | runs of typing above a physical-plausibility ceiling |
| `orderingAnomalies` | events whose arrival contradicts their client order |
| `unverifiedMoves` | `move` events with no matching prior cut |

### The one rule that governs this whole surface

**No false positives.** A student who did nothing wrong must never generate
something that reads as an accusation. Concretely, and these are binding on
any future change here:

1. **Nothing produces a verdict.** No score, no flag, no threshold that turns
   a row red. The viewer states facts; the instructor draws conclusions.
2. **Every benign explanation ships next to its observation, in the same
   sentence.** "40-minute gap with no connection (writing offline, a dropped
   connection, or a closed laptop)." A reader who arrives suspicious will read
   a bare number as confirmation, so the ordinary reading has to be right
   there.
3. **The history panel renders even when everything is clean.** A panel that
   appeared only when something looked wrong would itself be the accusation.
4. **Thresholds err toward silence.** A missed detection costs far less than a
   wrong one.

### Why there is no JS-integrity check

A tamper check computed by the page is worthless: a student who patches the
tracker patches the hash reporter too, and Subresource Integrity defends
against a modified *network response*, not a user with devtools. Building one
would produce false confidence, which is worse than nothing.

What works instead is that **the log must reconstruct the artifact.** A client
patched to mark everything `human` still has to emit an event stream that
replays to the document actually submitted. `lengthDrift` and
`orderingAnomalies` measure exactly that, and need no client cooperation. The
literature framing is integrity/consistency auditing of keystroke logs.

`fastBursts` is measured **only over single-character insert events**. A
multi-character insert (autocomplete, IME, mobile keyboard, swipe) would
otherwise divide its whole length by one inter-event gap and manufacture an
impossible rate from ordinary typing — a real false positive caught in
testing, now pinned by `render.test.ts`. The cost is under-detection; that is
the correct trade. One burst means nothing on its own: dictation,
autocomplete, and assistive input devices all produce them.

### Cross-submission aggregation is a non-goal

The real signal is a pattern across submissions — and computing it is the
**instructor's job, not the tool's**. An instructor knows which students
dictate, who drafts on paper, who has already had the conversation. A metric
knows none of that and would launder those unknowns into an authoritative
-looking number.

The obligation this creates: per-submission facts must be **comparable by
eye**. Same fields, same order, same units on every submission; absolute
figures ("3 pastes", "40-minute longest gap") over normalized ones, since a
percentage silently encodes a comparison the tool has not earned.

## Privacy: what the log retains, and what an instructor sees

Since slice 8, `delete` events store the removed text (migration `0010` always
specified this; the client had been sending `""`). That makes replay lossless
— which is what lets the server verify claims without trusting the client —
but it means **the log retains text a student deleted and chose not to
submit.** State this plainly in any student-facing description of the tool.

The mitigating boundary is a design requirement, not a reassurance:

- Deleted text is an **input to computation** — the retype fingerprint corpus,
  and move verification. Both are server-side.
- The only source text that reaches a human is `pastes[].sample`, and only for
  clipboard **imports**.
- **Text the student typed and then deleted never appears in the render.**
  Ordinary drafting — writing a sentence, disliking it, rewriting it — stays
  private.

Enforcement is by whitelist: `buildRender` constructs `render_json` from an
explicit field list, so a future field cannot leak deleted text by accident.
`render.test.ts` asserts that a typed-then-deleted span never appears in the
output. Keep that test passing.

## Data model

See `schema.sql` for the authoritative shape. In brief:

- `provenance_documents` — one row per document (title, owner,
  course, current text + provenance map cache, timestamps).
- `edit_events` — append-only log: `{insert, delete, replace,
  paste, llm_insert, format}` with character offsets, the affected
  text, optional `agent_message_id` link, optional `timing_blob` for
  later keystroke analysis.
- `provenance_agents` — agents available in the side panel. Rows
  with `owner_user_id IS NULL` are course-default agents authored by
  the instructor; rows with an owner are student-private.
- `provenance_conversations` — one chat session per document (a
  document can have many conversations over its life).
- `provenance_messages` — individual chat messages, with the
  `provenance_agents.id` and prompt hash captured at send time so
  later edits to the agent don't rewrite history.
- `provenance_submissions` — generated share tokens. Row contains
  document id, a **frozen provenance render** (`render_json`: `{text,
  runs:[{origin,length}]}`) computed from `edit_events` at mint time,
  the `snapshot_event_seq` cutoff (for future scrub), a title
  snapshot, and optional `revoked_at`. The render is computed from
  the authoritative event log — NOT from the editor's display marks —
  so it stays correct even if provenance coloring is later hidden
  from students while writing. (Slice 6 chose this over the original
  "event-id cutoff + replay on read" sketch: replay-for-text is lossy
  today since delete events don't store removed text, and a frozen
  render is faster to view.)

All tables filter by `course_id` per the project-wide rule.

## Routes (planned, all under `/api/provenance/`)

```
POST   /documents                      create a new document
GET    /documents                      list mine in this course
GET    /documents/:id                  fetch document + provenance map
PATCH  /documents/:id                  rename / move

POST   /documents/:id/events           append a batch of edit_events
GET    /documents/:id/events           list (paged) — for snapshot scrubbing

GET    /documents/:id/agents           list available agents (course + own)
POST   /agents                         create a personal agent
PATCH  /agents/:id                     edit own agent
DELETE /agents/:id                     delete own agent

POST   /documents/:id/conversations    start a new conversation
GET    /documents/:id/conversations    list
POST   /conversations/:id/messages     send a message; supports BYO key header
GET    /conversations/:id/messages     fetch history

POST   /documents/:id/submissions      mint a share token (freezes snapshot)
GET    /submissions?courseId=          course-wide list — INSTRUCTOR ONLY
DELETE /submissions/:token             revoke

GET    /public/submissions/:token      read-only view — INSTRUCTOR ONLY
GET    /public/submissions/:token/conversations  drill-down — INSTRUCTOR ONLY
```

The `/public/` segment on those last two is a **historical name**, kept so
previously-shared links resolve instead of 404ing. They are authenticated and
require an `instructor` enrollment in the submission's course.

BYO key path: messages POST accepts an `X-Provenance-LLM-Key` header.
If present, the worker uses it for that request only; it is never
written to D1, R2, KV, or logs.

## Invariants

- `edit_events` is append-only. No updates, no deletes (except
  whole-document cascade).
- **The client proposes; the server disposes.** Client-assigned origins are a
  live best guess so the editor can repaint without a round trip. Anything
  that must not be forgeable is derived at mint from the log: retype detection
  (typed text that reproduces an earlier paste becomes `pasted`), move
  verification, and the entire audit block. Never move one of those to the
  client for latency.
- A `provenance_submissions` row is immutable once created (besides
  `revoked_at`). The viewer renders at the snapshot, not live.
- An LLM message logged in `provenance_messages` always records the
  agent's prompt hash *at send time*, so later agent edits never
  rewrite past conversations.
- There are **no unauthenticated routes** in this module. The submission
  view reads only from the frozen snapshot and requires an instructor
  enrollment in the submission's course; every unauthorized caller gets the
  same 404 as a bad token, so probing can't confirm a token exists.
- Every document/submission read is scoped to the caller's own rows, with
  exactly one deliberate exception: `GET /submissions?courseId=` (the
  instructor review list) crosses the owner boundary and therefore checks
  `role === "instructor"` before querying.
- A student can mint a share token but cannot open the result. This is
  deliberate: the render shows which spans were attributed to the LLM, and
  origin classification is incomplete (see the web README's slice-7 gap), so
  a student-readable render is a bypass oracle — it tells them exactly what
  to retype until the page looks clean.

## Files in this folder

- `README.md` — this file.
- `routes.ts` — Hono sub-router mounted at `/api/provenance/*` in
  `apps/worker/src/index.ts`.
- `handlers.ts` — request handlers, including inbound event validation.
- `repo.ts` — D1 queries scoped to this module's tables, plus the
  `timing_blob` sidecar codec (`encodeSidecar` / `decodeSidecar`).
- `render.ts` — replay + all mint-time derivation: origins, retype
  detection, move verification, the paste inventory, and the audit block.
- `render.test.ts` — behavioural checks, `npm test -w apps/worker`.
  Most assert the *absence* of a signal on innocent input; a new
  failure there means a false positive is reaching an instructor.
- `types.ts` — shared TS types (origin enum, event shapes, etc.).
- `schema.sql` — reference snapshot of the tables. Authoritative
  migration lives in `packages/schema/migrations/`.

Slice 8 shipped **without a migration**: `provenance_events.text` and
`.timing_blob` already existed, `kind` and `origin` are untyped TEXT, and the
new derived output lives inside `provenance_submissions.render_json`. The
render blob carries `v: 2`; snapshots frozen earlier have no `v`, no `pastes`,
and no `audit`, and the viewer degrades to slice-6 behaviour for them rather
than implying the student pasted nothing.

## Open questions to resolve before implementing

1. **Event batching cadence.** Client buffers edit events and POSTs
   every N seconds / M events? Tradeoff: lower cadence = fewer
   requests + larger blast radius on connection drop. Suggest start
   at 5s / 50 events, revisit.
2. **Provenance map serialization.** Inline per-character array
   (simple, large) vs. run-length runs of `(origin, length,
   source_ref)` (compact, requires reconstruction). Suggest RLE
   from day one; the cache field on `provenance_documents` stores
   it as JSON.
3. **MIN_REVERSION_LENGTH.** How long must a re-typed string be to
   flip back to `llm`? Suggest 12 characters (covers a short phrase,
   not a common word).
4. ~~**Pasting from within the same document.**~~ **Resolved in slice 8**
   as the `move` kind — see the transition rules above. Cut *and* copy
   both feed a 30s internal-clipboard buffer, and the server verifies
   the claim against the log rather than taking the client's word.
