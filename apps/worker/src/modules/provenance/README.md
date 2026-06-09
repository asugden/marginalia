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

- Keystroke-timing forensics. The schema reserves space for it
  (`edit_events.timing_blob`) but classification ("real composition
  vs. copying") is a later pass and may live in `packages/` so other
  modules can reuse it. References for the eventual approach:
  - Zhang et al., "Detecting Plagiarism via Keystroke Logs" (JEDM,
    2024)
  - The Buffalo keystroke dataset (Data in Brief, 2023)
- Server-side audit / re-classification of provenance claims.
  Client is trusted at MVP. Audit pass comes when usage warrants it.
- Rich formatting beyond plain text + bold/italic/headings/lists.
- LMS integration.

## Provenance model

Every word in a document has a current **origin**:

| origin   | meaning                                                  | color  |
|----------|----------------------------------------------------------|--------|
| `human`  | Typed by the student.                                    | blank  |
| `llm`    | Inserted from an LLM conversation, unedited.             | yellow |
| `pasted` | Pasted from outside the editor; source unknown.          | red    |
| `edited` | Inserted by browser spellcheck/autocorrect/Grammarly.   | green  |

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

The current origin is computed from the append-only
`edit_events` log; the document table caches the latest rendered
state for fast loads. Snapshots at arbitrary timestamps are
reconstructable by replaying events up to that time.

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
DELETE /submissions/:token             revoke

GET    /public/submissions/:token      unauthenticated read-only view
GET    /public/submissions/:token/conversations  optional drill-down
```

BYO key path: messages POST accepts an `X-Provenance-LLM-Key` header.
If present, the worker uses it for that request only; it is never
written to D1, R2, KV, or logs.

## Invariants

- `edit_events` is append-only. No updates, no deletes (except
  whole-document cascade).
- A `provenance_submissions` row is immutable once created (besides
  `revoked_at`). The viewer renders at the snapshot, not live.
- An LLM message logged in `provenance_messages` always records the
  agent's prompt hash *at send time*, so later agent edits never
  rewrite past conversations.
- The public submission view is the *only* unauthenticated route in
  this module and reads only from the frozen snapshot.

## Files in this folder

- `README.md` — this file.
- `routes.ts` — Hono sub-router mounted at `/api/provenance/*` in
  `apps/worker/src/index.ts`. Empty scaffold for now.
- `handlers.ts` — request handlers. Empty scaffold.
- `repo.ts` — D1 queries scoped to this module's tables. Empty
  scaffold.
- `types.ts` — shared TS types (origin enum, event shapes, etc.).
- `schema.sql` — reference snapshot of the tables. Authoritative
  migration lives in `packages/schema/migrations/`.

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
4. **Pasting from within the same document.** Cut + paste shouldn't
   become `pasted` (red). Suggest: a paste whose text matches an
   immediately-prior delete in this doc preserves the origin of the
   deleted text.
