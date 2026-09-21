# Subword Embeddings (fastText)

The closing section of the [word embeddings](../word2vec/README.md) example,
about embedding words a model has never seen.

It was a standalone example at `/examples/fasttext` first, and stopped being
one because it is not a separate idea: it is the answer to a wall the word
embeddings page runs into. `<SubwordSection />` now renders at the bottom of
`Word2VecPage`, and `/examples/fasttext` redirects to `/examples/word2vec#subword`
so links handed to students still land. **Keep that redirect** (it lives in
`apps/web/src/main.tsx`) — the slug is in course material.

The section keeps its own directory because it carries its own data: a second
word table (fastText rather than GloVe) plus the n-gram table, ~2.2 MB raw
against the ~80 KB the rest of the page runs on. That is why it is fetched
lazily — the section measures its own distance from the viewport on scroll and
loads only once the reader is within 600px of it (or immediately when the URL
carries `#subword`). Deliberately *not* an IntersectionObserver: IO delivers
callbacks only while the document is being rendered, so a page opened in a
background tab would sit on "Loading…" until it was looked at.

## The arc

1. **The wall.** Type a word and the section shows both answers side by side:
   word2vec returns *nothing at all* for anything outside its vocabulary,
   while fastText reports how many familiar pieces it found. "Not in the
   vocabulary" is the common case, not the edge case — vocabularies are finite
   and language is not.

2. **A word is a bag of pieces.** The word is wrapped in `<` `>` and cut into
   every run of 3–6 characters — not trigrams only. 3–6 is fastText's own
   default for `skipgram`/`cbow` (`-minn 3 -maxn 6`), which is what the
   published vectors this page ships were trained with; `MIN_N`/`MAX_N` in the
   builder and `gramsOf`'s defaults in `ft.ts` must both match it. The range
   is what lets a piece cover a whole stem (`coffee`, `troll`) rather than only
   suffix shapes. The brackets are not decoration either: they make
   `<un` ("starts with un") a different piece from `un` mid-word. Each piece
   shows how many vocabulary words contain it; pieces that pulled the result
   hardest are highlighted, and never-seen pieces are greyed and dashed.

3. **Add the pieces up.** Sum, normalize, done — no lookup, no special case.
   `trolleys` comes back at **0.98** from `trolley` having never been seen;
   `coffeeshop` at 0.95 from `coffee`; `tunneled` at 0.95 from `tunnel`.

   When the typed word *is* in the vocabulary, the section also shows how close
   the pieces got to its real vector. One preset exists for exactly this:
   `trolley`, sitting beside the plural the table does *not* have. It scores
   **0.986** — the control for the experiment, and the evidence the mechanism
   is sound. Every other preset is out of vocabulary, which is the point, but
   without one word the table actually contains there is nothing to check the
   assembled vector against except its own neighbours. The number is computed
   live, not quoted.

4. **Where spelling stops being meaning.** `greasiest` returns *significant*,
   *greater*, *great*. The `-est` ending dominates: it found the grammar and
   lost the grease. The section shows this failure rather than hiding it, because
   it is the honest boundary of the idea — subwords help with word *forms*,
   and cannot invent a relationship that spelling does not carry.

## Honesty notes

**Real:** the word vectors are published fastText embeddings trained *with*
subword information on 16 billion tokens of Wikipedia and news, reduced 300d →
32d by PCA and quantized to int8 — the same table the rest of the gallery uses.

**Reconstructed:** the n-gram vectors. The published `.vec` release ships word
vectors only; the matrix holding the real n-gram vectors lives in a ~6.7 GB
binary that cannot ship to a browser. So each n-gram's vector here is the mean
of the unit-length vectors of every vocabulary word containing it. Words
sharing a gram pull it toward whatever they have in common, which is the same
statistical relationship the real training procedure captures.

That is a reconstruction, and the section says so in its own footnote. It is also
measurably a good one, and the measurement is the claim: **rebuilding a word we
already have, from its n-grams alone, reproduces its real vector at 0.909
cosine** (sampled over 304 words by `build-ngrams.mjs --report`).

### Why every n-gram is kept

`MIN_COUNT` is 1 — no pruning. This was measured, not assumed:

| pruning | grams kept | reconstruction | `coffeeshop` →              |
|---------|-----------:|---------------:|-----------------------------|
| keep all| 18,077     | **0.909**      | **coffee 0.95**, tea 0.86   |
| ≥ 2     | 6,773      | 0.775          | offering 0.63, bring 0.61   |
| ≥ 3     | 3,488      | 0.695          | offering 0.63, bring 0.61   |

Pruning removes exactly the *distinctive* grams (`ffee`, `roll`) and leaves the
generic suffixes, so everything starts matching bland common words. Keeping
them all costs ~430 KB gzipped, lazy-loaded only when the reader reaches the section.

## Architecture

- `ft.ts` — n-gram extraction (`gramsOf`, which MUST stay in sync with the
  trainer's copy), the table loader, and `buildFromGrams`, which sums the
  pieces and reports how hard each one pulled.
- `SubwordSection.tsx` — the section and its four panels, including the lazy
  load and the `#subword` deep-link handling. No page chrome: the topbar,
  heading and footer belong to `Word2VecPage`.
- `fasttext.css` — the section's styling, including the rule and heading that
  form the seam between the two halves of the page.
- `ngrams.json` — the derived n-gram table, also copied to
  `public/examples/fasttext/`.
- `train/build-ngrams.mjs` — the offline builder.

Word vectors come from `../shared/embeddings/train/distill.mjs` and are served
from `public/examples/fasttext/vectors.json`.

## Regenerating

```
node apps/web/src/examples/shared/embeddings/train/distill.mjs --source fasttext
node apps/web/src/examples/fasttext/train/build-ngrams.mjs --report
cp apps/web/src/examples/fasttext/ngrams.json \
   apps/web/public/examples/fasttext/ngrams.json
cp apps/web/src/examples/shared/embeddings/fasttext-32d.json \
   apps/web/public/examples/fasttext/vectors.json
```

Deterministic: no randomness in the pipeline. `--report` prints the
reconstruction cosine and a set of out-of-vocabulary examples — read that
output before shipping a change, since it is the number the section's footnote
quotes.
