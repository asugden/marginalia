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
  submission viewer).

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
4. **LLM insert.** Cursor-aware insertion from a chat message into
   the document, emitting `llm_insert` events and stamping the
   inserted text with `origin="llm"` + the source message id.
5. **BYO key.** `localStorage["provenance.llmKey"]` + per-request
   `X-Provenance-LLM-Key` header + "Use my own key" affordance.
   Worker uses the supplied key transiently; never stored.
6. **Submissions + public viewer.** Share token, frozen snapshot,
   read-only colored render. Optional drill-down to conversations.
7. **Reversion + edit detection.** Whole-word vs character edit
   classification; `edited` (green) mark; `llm` reversion on exact
   re-match past `MIN_REVERSION_LENGTH`.

Later (not MVP): keystroke timing classification, server-side audit.

## Known gap unblocked by this module

- The `LLMProvider` interface in `packages/providers` is generalized,
  but only `AnthropicProvider` is implemented. Slices 3 (chat) and 5
  (BYO key) are both more useful once `OpenAICompatibleProvider`
  ships — that single adapter covers OpenAI, Ollama, vLLM,
  OpenRouter, Together, and Groq. Provider work lives in
  `packages/providers/` and is its own track, not this module.
