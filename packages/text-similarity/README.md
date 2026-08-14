# @marginalia/text-similarity

Dependency-free winnowing fingerprints: find where one text reproduces
material from a set of other texts, tolerantly enough to survive light
editing, reformatting, and reordering.

The construction is the standard one from Schleimer, Wilkerson & Aiken,
*Winnowing: Local Algorithms for Document Fingerprinting* (SIGMOD 2003) —
the algorithm behind MOSS. Hash every k-gram, slide a window of `w` hashes,
keep the minimum in each. Any shared substring of length ≥ `k + w - 1` is
guaranteed to share at least one fingerprint, at ~1/`w` the storage.

## Why not a diff

Edit-distance alignment is O(n·m) and answers a different question — "how do
these two texts differ" rather than "does this text contain material from any
of these". Winnowing is near-linear and matches moved or lightly reworded
passages, which is the case that matters here.

## Use

```ts
import { findMatches, coverage } from "@marginalia/text-similarity";

// Which spans of `essay` reproduce material from these sources?
const spans = findMatches(essay, [sourceA, sourceB], { minMatchLength: 40 });
// → [{ start, end, sourceIndex }, ...] in ORIGINAL `essay` coordinates

// How much of `source` survives in `essay`?
const { verbatim, nearMatch } = coverage(source, essay);
```

`findMatches` returns non-overlapping spans sorted by start, in the original
(un-normalized) coordinates of the candidate, so callers can map them onto
their own character ranges.

## Tuning

- `k` (default 25) — k-gram size in normalized characters. Larger is stricter.
- `w` (default 12) — winnowing window. Larger stores fewer fingerprints and
  raises the guaranteed-match threshold.
- `minMatchLength` (default `k`) — spans shorter than this are dropped
  entirely rather than reported weakly.

Callers that act on the output should keep `minMatchLength` generous. Common
phrasing recurs naturally in any corpus; a short overlap is not evidence of
anything, and reporting it as though it were is the expensive kind of error.

## Cost

One pass to index the corpus, one to fingerprint the candidate, plus extension
work proportional to what actually matched. A 5,000-word candidate against
~20KB of corpus runs in single-digit milliseconds — cheap enough to run inside
a request handler.

## Scope

Lexical only. This package does not do embeddings, semantics, or authorship
attribution, and it makes no claim about *why* two texts overlap.
