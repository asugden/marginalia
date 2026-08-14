# provenance (web)

Client side of the provenance writing tool. See the worker module's
[README](../../../../worker/src/modules/provenance/README.md) for
the overall design, data model, and route surface.

## UX shape (MVP)

```
+---------------------------------------------+---------------------+
|  [B] [I] [H1] [H2] [•]   <— minimal toolbar | Agent: [Tutor    v] |
|                                             | ------------------- |
|                                             | (chat history)      |
|  Document editor                            |                     |
|  - per-word coloring (yellow/red/green)     |                     |
|  - paste tracked                            |                     |
|  - click into doc, then "Insert" on a       |                     |
|    chat message to drop LLM text in         |                     |
|                                             | [type a message...] |
|                                             |  ▸ Insert at cursor |
+---------------------------------------------+---------------------+
                       [Share submission link]
```

Color legend visible on a hover/info affordance, not always-on, so
the document reads naturally while writing.

## Editor choice

Plain text + bold/italic/headings/lists. Default to a small
ContentEditable wrapper with our own word-level model rather than
pulling in Tiptap/ProseMirror at MVP — the provenance model wants
direct ownership of selection, paste, and input events. Revisit if
that becomes painful.

## Course resolution

`/write` is a **course-agnostic** route (not under `<CourseLayout>`), so
it can't use `useCourse()`. Instead it uses `useActiveCourse()` (in
`apps/web/src/course/`): fetch `/api/me`, resolve to a single course
(one enrollment → that one; many → the one in `localStorage`
`active.courseId`, else most recent). The header exposes a "Switch
course" menu via the shared `<StandalonePage>` shell when the caller
has >1 enrollment. Documents/agents are filtered to the active course;
the editor passes the *document's own* `courseId` (from the loaded DTO)
down to the chat panel so the two never disagree.

Page chrome (`.page.staff` frame + breadcrumb header + actions +
course switcher) comes from `<StandalonePage>` — the standalone-surface
parallel to `<CourseLayout>`. Provenance pages render only their body.

## State shape

```ts
{
  document: ProvenanceDocument,           // server canonical
  pendingEvents: EditEvent[],             // buffered, flushed every ~5s / 50 events
  activeConversation: ProvenanceConversation,
  messages: ProvenanceMessage[],
  selectedAgent: ProvenanceAgent,
  byoKey: string | null,                  // from localStorage; never sent to server except in per-request header
}
```

## BYO key

`localStorage["provenance.llmKey"]`. When set, the message-send
fetch adds `X-Provenance-LLM-Key`. UI surface: a small "Use my own
key" toggle in the agent panel header that opens a modal with a
single password input and a "How this works" link explaining the
key never leaves the browser except for the LLM proxy request and
is never stored server-side.

## Files in this folder

- `README.md` — this file.
- `index.tsx` — module entry; exports `ProvenanceRoute` mounted in
  `apps/web/src/main.tsx` (or `bootstrap.ts`).
- `api.ts` — typed fetch wrappers for `/api/provenance/*`.
- `components/` — components used only here (editor, agent panel,
  submission viewer, instructor submissions list).

## Instructor Submissions surface

`/course/:id/instructor/submissions` (`SubmissionsPage.tsx`) — the course-wide
review surface, and the only place in the module that reads across student
owners. Built from the standard staff primitives (`.app-page` for the measure,
`PageHeader`, `Section`, `.app-list`); the only bespoke CSS is the origin bar,
which has no design-system equivalent.

**Grouped by document, not by mint.** Pressing "Share" always mints a *new* row
(`createSubmissionRoute` never reuses a token), so the raw table is one row per
press and a flat list buries the actual unit of work under near-duplicates. Each
row is a document showing its latest snapshot; earlier ones collapse behind an
"N earlier" disclosure. Rows carry a proportional origin bar (typed / pasted /
from LLM / autocorrect) and a "% not typed" figure computed from the frozen
render, so an instructor can triage without opening each snapshot. Titles link
to `/s/:token`.

Note this is a list of *ad-hoc shares*, not of structured checkpoints: there are
no assignments, due dates, or defined checkpoints in the data model, so the page
can only report what students chose to share and when.

Backed by `GET /api/provenance/submissions?courseId=` — instructor-only, 403
otherwise. The tab appears in the instructor strip only when the Writing module
is enabled (`TabVisibilityFlags.provenanceEnabled`).

Still absent: any *authoring* surface for provenance assignments. Submissions is
review-only.

## Slices

1. ✅ **Document CRUD + bare editor.** Plain text + minimal formatting +
   word/char/page counts. Autosave debounced 1s, flushes on tab-hide.
2. ✅ **Edit-event log.** OriginMark + ProvenanceTracker capture
   insert/delete/paste, stamp inserted text with `origin`, buffer
   events client-side, POST batches to `/events`. Yellow/red coloring
   wired; keystroke timing recorded but not yet classified.
3. ✅ **Agent panel + conversations.** Course-default + personal
   agents (`/write/agents`). Many conversations per document (for
   context-window juggling). Streamed SSE responses using the
   project-wide `LLMProvider` interface (today: Anthropic; provider
   expansion is a separate track). Optimistic UI for user message;
   live `delta` ticker for assistant. "Insert at cursor" button is
   rendered but no-op until slice 4.
4. ✅ **LLM insert.** "Insert at cursor" on an assistant bubble now
   calls `editor.commands.insertLlmText({ text, sourceMessageId })`.
   The tracker stashes a `next-op` hint of `llm_insert` and
   `appendTransaction` stamps the inserted range with `origin="llm"`
   + `sourceMessageId`, emits an `llm_insert` event into the buffer.
   Smart-spaces if the cursor was mid-word so LLM text doesn't fuse
   onto the previous word.
5. ✅ **BYO key.** `useByoKey()` stores a personal key in
   `localStorage["provenance.llmKey"]`; `streamChatTurn` attaches it
   as `X-Provenance-LLM-Key`. The worker (`readByoKey`) uses it for
   that request only — never written to D1/R2/KV/logs — and falls
   back to the institution key when absent. UI: a key button + banner
   + manage-modal in the chat header. CORS preflight allows the
   header for the cross-origin deploy. **Still Anthropic-only** until
   `OpenAICompatibleProvider` ships — a student's OpenAI key won't
   work yet; that's the provider track, not this slice.
6. ✅ **Submissions + instructor viewer.** "Share" mints an unguessable
   token (`/s/:token`). The frozen snapshot is a **provenance render**
   computed server-side from the authoritative `edit_events` log at
   mint time (`render.ts buildRender`), stored as `{text, runs}` JSON
   on `provenance_submissions` — *display-independent*, so it works
   even though students never see coloring mid-write. The viewer and
   chat drill-down (`/api/provenance/public/*` — a legacy path name)
   are **instructor-only**: authenticated, and gated on an instructor
   enrollment in the submission's course. A student can mint a link but
   not open it, so the render can't be used as a bypass oracle against
   the known classification gaps below. Owner can revoke.
   **Diverges from the original
   "event-id cutoff" sketch**: replay-for-text would be lossy today
   (delete events don't store removed text), and a frozen render is
   faster to view. `snapshot_event_seq` retains the cutoff for future
   scrub features.

7. ✅ **Reversion + edit detection.** Browser spellcheck / autocorrect /
   Grammarly word swaps (`inputType === "insertReplacementText"`) are
   logged as a `replace` event and stamped `origin="edited"` (green) —
   kept distinct from `paste` so autocorrect isn't lumped in with
   clipboard content. We deliberately do **not** classify generic
   select-and-retype as "edited" (too many false positives); only the
   browser's own replacement signal counts. `llm` **reversion**: the
   tracker keeps an in-memory index of LLM contributions (seeded by
   `insertLlmText`, rehydrated on load from existing `origin="llm"`
   runs via `rehydrateLlmContributions`); when typed text exactly
   re-types a remembered contribution ≥ `MIN_REVERSION_LENGTH` (12,
   whitespace-normalized) it's re-stamped `origin="llm"`, so suggested
   wording can't be laundered into "human" by retyping. `render.ts`
   replays `replace` as an insert of the event origin (a swap is a
   `delete` + `replace` pair); the public viewer legend gains "edited".
   No schema migration — the `kind`/`origin` columns are untyped TEXT.

## Marks are never shown to students while writing (cross-cutting)

**Students never see origin coloring in the editor**, and have no control that
could turn it on. Watching your own prose get color-coded in real time is a
surveillance experience, and it pushes students to write for the marks instead
of for the assignment. The student surface renders plain text with no legend;
an instructor "previewing as student" gets the same plain view, since preview
is supposed to be a genuine student view.

This is **display-only** — recording continues unchanged. Because the
submission render (slice 6) is computed server-side from the event log, the
frozen render, instructor review, and the public viewer all still show origins.
Suppressing the live coloring costs nothing in audit terms; that decoupling is
exactly what slice 6 bought.

The per-course `hide_provenance_marks` setting (migration `0014`) survives as
an **instructor view preference**: the header toggle in the editor flips
whether *the instructor* sees coloring, so they can read a draft plain. It no
longer gates anything student-facing. Stored on the shared `course_settings`
row; read via `/api/me` (`MeEnrollment.hideProvenanceMarks`) and
`GET /api/provenance/settings`; flipped via `PATCH /api/provenance/settings`
(instructor only).

8. ✅ **Server-derived provenance.** Origin classification stops being
   client-only. Four changes, all detailed in the worker README:
   - Deletes now record the removed text **and the origins it carried**
     (the schema always specified this; the client had been sending `""`),
     making replay lossless.
   - A paste of text cut or copied from this same document within 30s is a
     `move`: it keeps the origins it already had instead of being relabelled
     as imported. The buffer is populated from `cut`, `copy`, and delete;
     the server re-verifies each move against the log.
   - The editor no longer decides everything. Text that was pasted and then
     retyped by hand is re-marked `pasted` server-side at mint, by
     fingerprinting the final text against the paste corpus. Same origin, not
     a new one — it's the same fact about how the content arrived.
   - Keystroke timing is still recorded and still unclassified — see the
     worker README's note on why the rate check is not that classifier.

Later (not MVP): keystroke timing classification.

Slow character-by-character retyping of LLM wording **is** caught, by the
rolling `humanRun` window in `ProvenanceTracker.ts` (the per-event reversion
check alone would miss it, since each keystroke is under
`MIN_REVERSION_LENGTH`). An earlier revision of this file listed that as an
open gap; it isn't.

## Known gap unblocked by this module

- The `LLMProvider` interface in `packages/providers` is generalized,
  but only `AnthropicProvider` is implemented. Slices 3 (chat) and 5
  (BYO key) are both more useful once `OpenAICompatibleProvider`
  ships — that single adapter covers OpenAI, Ollama, vLLM,
  OpenRouter, Together, and Groq. Provider work lives in
  `packages/providers/` and is its own track, not this module.
