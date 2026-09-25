# @marginalia/provenance

Where text came from, shared by every surface that records it: the writing
tool (`modules/provenance`) and code notebooks (`modules/code`). Improve
detection here and both get it.

## What lives here

| file | what | runs on |
|---|---|---|
| `origins.ts` | the origin model, and run-length helpers (`spliceRuns`, `sliceRuns`, `countOrigins` …) | both |
| `client.ts` | the editor's live best guess: `MoveBuffer` (moves inside a document keep their origins) and the reversion index (retyping AI text is re-stamped `llm`) | browser |
| `render.ts` | the authoritative render: replay an event log, verify moves, retype detection, the import inventory, and the audit | server |

Origins: `human` (typed), `llm` (from an AI conversation), `pasted`
(clipboard import), `edited` (spellcheck/autocorrect), `provided`
(instructor-supplied starter text; the writing tool never produces it).

## The division of labour

The client proposes; the server disposes. An editor stamps origins as the
student works so it can repaint without a round trip, and logs every edit.
Anything that must not be forgeable is derived by `buildRender` from the log
when work is submitted: retype detection, move verification, the audit.

## Surface policy, not algorithm

`buildRender` takes options for the few places surfaces genuinely differ.
Keep policy in the adapter (`modules/*/render.ts`); keep algorithm here.

- `corpusOrigin` — the origin a retyped match takes. The writing tool maps
  every import to `pasted`; code maps an AI chat import to `llm`.
- `extraCorpus` — retype sources that are not events, like AI replies.
  Give each an `after` time: only text typed after the source existed can
  match it, so text written first is never attributed to a source that later
  quoted it.
- `baseline` — text present before the first event (starter code), replayed
  first and excluded from the audit's activity measures.
- `importKinds`, `labelImports` — which events the import inventory lists.

With no options, behaviour is exactly the writing tool's. A change here that
alters the no-options output changes every submitted writing render: check
`apps/worker/src/modules/provenance/render.test.ts`.

## The rule that governs all of it

No false positives. Every threshold errs toward silence (`MIN_RETYPE_MATCH`
is 40 characters, `MIN_REVERSION_LENGTH` 12), nothing produces a verdict, and
the audit only measures. See the provenance module README for the full
statement.

## Tests

```
npx tsx packages/provenance/src/render.test.ts
```
