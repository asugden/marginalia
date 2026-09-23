# Example: Word Embeddings (word2vec)

A standalone, static, interactive page about how a model learns what words
mean without anyone telling it. Mounted at `/examples/word2vec`. No backend,
no auth — it loads a real embedding table as a static JSON asset and computes
every similarity, neighbour and analogy in the browser.

Visual conventions follow the [deep neural network](../mnist-mlp/README.md)
example (network drawn top-to-bottom, input at the top, the shared figure
scales from `../shared/palette.ts` — sage/plum learned weights,
vermillion/cerulean computed values, ink for the one-hot input — edge-magnitude threshold on a slider, layer captions in a
left gutter, SVG throughout) and the [attention](../attention/README.md)
example (one scrolling page of live panels rather than a stepped walkthrough).

## The arc

1. **Words that fit the same gap mean similar things.** A frame with a hole in
   it and a draggable column of candidates. Some land and the sentence reads as
   English; some do not. This is the distributional hypothesis in its original
   linguistic form — *a word is characterized by the company it keeps* — and it
   is demonstrated by dragging rather than asserted in a paragraph. No model is
   involved yet, deliberately: the idea has to stand before the machinery
   arrives.

2. **Turning that into something countable.** Bag of words. A *corpus* — many
   scattered occurrences with ellipses between them and "millions of lines" at
   the foot, so nobody reads "training data" as "one sentence" — with the
   context words highlighted and tipped into a bag. Order is discarded; only
   counts remain. The training example that comes out is genuinely bag-shaped:
   one word in, a *set* of context words to predict all at once, not a stream
   of (centre, context) pairs.

3. **A network wide at both ends and thin in the middle.** One-hot input over
   the vocabulary, a bag of context words at the output, a narrow layer
   between. Because the input is one-hot, the first matrix multiply is just a
   row lookup — which is why an embedding table and a weight matrix are the
   same object seen two ways, and why the hidden layer can be labelled "the
   embedding" without cheating.

   **The input word is greyed out of the output layer**, marked *itself*. A bag
   of context never contains the word it came from, so predicting yourself is
   the degenerate answer; ruling it out makes the interesting predictions the
   only ones on screen. Feed it `trolley` and the live output is tram 24%, bus
   9%, bridge 5%.

4. **Why the waist forces it to learn meaning.** No room to memorize: ~2,100
   words' worth of context predicted through 32 numbers per word. The cheapest
   way to do well is to give words used in similar contexts similar numbers.

5. **Throw away the decoder.** A toggle that removes the decoder half of the
   figure — its edges and output nodes go, its bracket fades — while the
   encoder stays solid. In the bag's place the figure says the output is now
   the hidden layer and redraws that layer as an embedding strip (the
   transformer page's `Strip`), introducing the rectangle-of-cells form every
   later example uses for a word's vector. The halves are bracketed and named
   in the figure itself, so this is a visible event rather than a number
   changing in a table.

6. **Play.** Cosine similarity between any two words, clickable nearest
   neighbours, and analogies.

7. **The whole space at once.** A fixed, curated set of ~40 words projected to
   2D. Transport clusters with transport, food with food, cities with cities,
   and nobody labelled any of it. Clicking a word draws lines to everything
   above 0.45 true similarity, *measured in all 32 dimensions* — so when a line
   stretches right across the picture (`trolley`→`bakery` at 0.61) the student
   catches 2D lying, which the caption names.

8. **One vector per word, forever.** The limitation that motivates attention.

9. **Subword embeddings.** The *other* limitation of one row per word — there
   is no row at all for a word the corpus never contained — and its much
   cheaper fix. Lives in [`../fasttext/`](../fasttext/README.md) and renders
   here as `<SubwordSection />`; it was its own example until it became clear
   it is the answer to a wall this page runs into rather than a separate idea.
   The page then closes by separating the two limits: spelling gets you the
   word, but only context gets you the *sense*, which is attention's job.

## Honesty notes

**Real:** the vectors are published GloVe embeddings (6B tokens, Wikipedia +
Gigaword), reduced 300d → 32d by PCA and quantized to int8 — about 80 KB
gzipped. Every neighbour, similarity and analogy on the page is computed live
from that table. Measured top-10 neighbour overlap against the 300d source is
**52%** (printed by `distill.mjs --report`).

**A stand-in:** the *decoder* half of the network figure. A trained skip-gram
decoder is another full vocabulary-sized matrix that we do not ship — partly
because it is large, and mostly because the page's whole point is that it gets
thrown away. Each word's decoder row is therefore its own embedding, which
reproduces the right behaviour (the softmax peaks on words related to the
input) without pretending we shipped trained weights. The page says so in its
footer.

**A schematic:** the network figure draws 8 words and 8 hidden units so the
wiring is legible — every connection is drawn, since 128 of them needs no
thresholding and no detail slider. All the arithmetic runs at the table's full
32 dimensions over the full vocabulary; the figure slices only for drawing, and
says so above itself.

**Spacing and weights** are taken from the digit recognizer (230px first gap,
108px after; 25px nodes at rx 9; 1.5px borders) so
the two figures read as the same kind of object.

**The 2D map** is PCA over exactly the plotted words, so its axes carry no
independent meaning and distances are a shadow of the real ones. Every
similarity number shown beside a dot is computed in full dimensionality, and
the caption tells students to watch for the disagreements.

### The analogy demo is deliberately unflattering

`king − man + woman = queen` is usually shown having quietly excluded the three
input words from the answer. Without that exclusion the nearest vector to the
result is very often just `king` again. Here the exclusion is a visible toggle,
the top five are listed with scores rather than one confident answer, and
students are invited to try their own and watch most come out mushy. The
structure is genuinely in there, but as a tendency, not a rule.

### The polysemy demo shows two different failures

Both are real findings from this table, and the verdict text is computed from
the measured similarities rather than written in advance:

- **`bass`** — neighbours are `guitar 0.77` and `trout 0.63` side by side.
  Scores 0.40 to fish words and 0.51 to music words: one point blending two
  meanings the word never has at once.
- **`bank`** — 0.16 to river words, 0.57 to money words. The rarer sense has
  not been blended, it has been *swallowed*: the table simply does not
  represent it.

This is the bridge to [attention](../attention/README.md), where a word's
vector depends on the sentence it is in. Note that the subword section below it
does *not* fix this one — spelling cannot separate the fish from the
instrument — and the closing panel says so explicitly, so the two limitations
do not blur into one.

## Architecture

- `w2v.ts` — bag-of-words collection, the stand-in decoder, and a hand-written
  forward pass (one-hot lookup → hidden → scores → softmax).
- `SlotFigure.tsx` — the draggable substitution frame.
- `BagOfWordsFigure.tsx` — the corpus-with-ellipses and the bag it fills.
- `WordMap.tsx` — the 2D projection with true-similarity readouts.
- `SkipGramNet.tsx` — the SVG network in the house style.
- `SimilarityPanel.tsx` — similarity, neighbours, and the honest analogy demo.
- `Word2VecPage.tsx` — the page and its panels, including the polysemy demo.
- `../fasttext/SubwordSection.tsx` — the closing subword section, which brings
  its own (lazily fetched) fastText and n-gram tables. See its README.
- Vectors are produced by `../shared/embeddings/train/distill.mjs` and served
  from `public/examples/word2vec/vectors.json`.

## Regenerating the vectors

```
node apps/web/src/examples/shared/embeddings/train/distill.mjs --report
cp apps/web/src/examples/shared/embeddings/word2vec-32d.json \
   apps/web/public/examples/word2vec/vectors.json
```

One-time ~860 MB download, cached under `train/.vectors-cache/` (gitignored).
Deterministic: no randomness in the pipeline, so a re-run reproduces the file
byte for byte. `MUST_KEEP` in the distiller holds words the teaching pages name
directly but which fall below the frequency cut — add to it if a page needs a
word the table lacks.
