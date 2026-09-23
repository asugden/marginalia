# Example: Transformers

A standalone, static, interactive page that builds one transformer block
around the attention head from the [attention example](../attention/README.md).
Mounted at `/examples/transformers`. No backend, no auth, no course context —
it loads a small multi-head asset as static JSON and computes every vector on
the page in the browser.

## Where it sits

The attention example goes *inside* one head: the grid, the three matrices,
the weighted sum, the cost. This page treats the head as a finished part and
builds the rest of the block around it. A later example will cover language
models — masking, next-word prediction, generation — and is deliberately not
this page. What this page builds is the **encoder** of the original paper's
figure: unmasked, all-to-all attention, no cross-attention, no output head.

## What it shows

0. **One layer, as a map.** Drawn once at the top in the semi-traditional
   shape and read top to bottom — rows of neurons, widening through the
   memory and narrowing back. The attention block is drawn as one grid per
   head, side by side, all fed the same input and folded by a single W_O
   into the one vector the memory reads. Two dashed residual arcs down the
   left carry the word past each stage to a `+`, inside a dashed repeat
   frame. Each stage's caption and its numbered marker sit in the gutter to
   the right. Every node is live for the selected word: its embedding in at
   the top, each fact neuron's weighted sum in the middle (the ones that
   fired outlined), the block's output at the bottom. Above the first row
   and below the last, the same two vectors are drawn again as embedding
   strips — the form word2vec introduces — each cell directly over or under
   its neuron. Numbered markers 1–5 match chips on the panel headings, so
   every panel can point at its place on the map, and each marker with its
   caption is a link down to that panel — the map is the page's contents.

   **One control bar drives the page.** The sentence and the word being
   followed are chosen in a single sticky bar under the lede, pinned as the
   page scrolls (the ensemble pages' scrubber technique), rather than in a
   copy of the word buttons above each figure. It is sticky only within the
   panels that follow the word — the map through the memory — so it scrolls
   away at the stack panel, where nothing depends on the word any more.

1. **The head, as one box.** The attention page's whole subject collapsed to
   an object: words in on the left with their E strips, a box holding just
   the head's attention grid (unannotated, so it does not blur the query /
   key / value roles the attention page separates), the same words out on
   the right with their vectors changed.
   Computed from head 0, which is the attention example's head verbatim, so
   the two pages agree to the last digit. Hover a row for "pierogi came out
   made of greasy 43%, soggy 41%".

2. **Many heads at once.** Three heads side by side, each with its own mini
   grid and its own output for the selected word, stacked end to end into a
   48-number vector and multiplied by `W_O` back to 16. The brackets under
   the stack show which third each head filled. The heads were fitted to
   find three different relationships (see below), so for
   "pierogi" only the adjective head does anything while for "a" only the
   little-words head does. This is where the attention page's footnote about
   `W_O` pays off: here it is, and here is why it exists.

3. **Add & norm, as two paths.** The point is a contrast with every layer
   the student has met before, which *replaces* its input. The same word goes
   down both paths: "the old way" — the layer's output alone — and "a
   transformer" — the word plus the layer's output — each ending in a "still
   the word?" meter (cosine to the original embedding) and the nearest known
   word. Replace, and the result is barely like the word; add, and it is
   still the word carrying what it learned. Then the norm, with the mean and
   standard deviation before and after. Drawn once, after attention; the
   second add & norm, after the fact layer, is one line pointing back here.

4. **The feed-forward layer, as a network that stores facts.** Drawn as the
   dense network it is, in the digit recognizer's style: the word's sixteen
   numbers in, a row of hidden neurons, sixteen numbers out. Each hidden
   neuron is `ReLU(w·x + b)`, as on the activation page, and the neurons
   that fire add their outgoing weights onto the word.

   The point it makes is the finding it is built on (Geva, Schuster, Berant
   & Levy 2021; Meng, Bau, Andonian & Belinkov 2022): when a model reads
   "Michael Jordan", its MLP layers add "basketball" — knowledge that is
   nowhere in the input. So every fact points OUTSIDE the sentences
   (`pierogi → polish`, `stadium → soccer`). Each hidden neuron is
   labelled only with the word it adds (`polish`); which word fires it is
   carried by its incoming weights, shown on hover. The readout sets the
   two sources side by side: *from attention* (the words it mixed in) and
   *from the feedforward layers* (the fact, tagged "from outside the
   sentence", with how far the word moved toward it). The words "key" and
   "value" are deliberately absent: on this page they belong to attention.
   The second add & norm follows as one line linking back to panel 3.

   **The layer is designed, not learned,** and labelled so on the page: one
   hidden neuron per fact in `facts.json`. A fact neuron's incoming weights
   point along its trigger word, scaled so that for a normalised input
   (always length 4) `w·x` is exactly the cosine match, with a bias of
   −0.55 as the firing threshold; its outgoing weights push toward the fact
   word. The fact words are projected into the page's 16-d space through the
   PCA fitted on the sentence vocabulary (see below), which keeps only part
   of an outside word — so the readout is "how much like polish", never a
   list of nearest words.

5. **Blocks in series** is step 5 on the map, but it lives on the
   [counting parameters](../parameter-budget/README.md) page ("Make it
   bigger!"): a transformer block, repeated in series, drawn at the real
   shapes of published models. The map's step-5 marker links there.

6. **The canonical figure, decoded.** Figure 1 of "Attention Is All You
   Need" redrawn in SVG with its layout and colours, next to a legend that
   translates every box into this page's language and links to the panel
   where the student watched it happen. Hovering a box lights its legend
   row and vice versa. A toggle fades everything this page did not build —
   the decoder tower, the mask, cross-attention, linear + softmax — leaving
   the encoder lit, with the un-built pieces named and pointed at the
   language-models example.

**Vocabulary across the page:** the panels reuse the attention example's
drawing language and the shared figure scales in `../shared/palette.ts`
(vermillion/cerulean strips for computed vectors, vermillion-shaded grids for
attention patterns, sage/plum swatches and wires for learned weights) so that "the whole attention page is now
this box" is something a student can check by eye.

## What is real here, and what was designed

**Real:** the token embeddings are the attention example's — GloVe vectors
for these exact words, PCA-reduced to 16 dimensions — and the trainer asserts
they match. Head 0's three matrices are copied from that example's
`head.json`. Every stack, fold, add, norm, key match and sum on the page is
computed live by `transformer.ts`.

**Designed:** heads 1 and 2 were fitted offline by gradient descent to
targets chosen for legibility ("little words → their noun", "verb → its
nouns"), with the same procedure as head 0, including the reparameterisation
that keeps `W_Q` and `W_K` visibly distinct. Their `W_V`, and the layer's
`W_O`, are fixed random projections — there is no network around them to fit
against. The fact layer is built by hand from word pairs. The page
says all of this where it applies.

Measured behaviour of the shipped heads on the first sentence (printed by
the trainer):

```
head 0  adjectives → noun     pierogi -> greasy 43%, soggy 41%
                              stadium -> crowded 97%
head 1  little words → noun   a       -> pierogi 94%
                              the     -> stadium 86%
head 2  verb → its nouns      conquered -> stadium 46%, pierogi 45%
```

## Architecture

- `transformer.ts` — the block's forward pass with every intermediate kept:
  per-head runs, the stacked vector, `W_O`, both residual sums, both layer
  norms, and the key–value memory.
- `draw.tsx` — shared SVG pieces in the attention example's language: a
  vector strip, a mini attention grid, a matrix swatch.
- `LayerMap.tsx` — the live layer diagram at the top, with numbered markers.
- `HeadBox.tsx` — the head as a box (panel 1).
- `MultiHead.tsx` — several heads, stacking and `W_O` (panel 2).
- `AddNorm.tsx` — add & norm as two paths with a "still the word?" meter,
  used twice (panels 3 and 4).
- `MemoryPanel.tsx` — the fact layer as a dense network (panel 4).
- `CanonicalFigure.tsx` — the redrawn paper figure and its legend.
- `TransformersPage.tsx` — the page and its prose.
- `heads.json` — three heads and `W_O` (~21 KB), committed so the page is
  fully static. Also copied to `public/examples/transformers/`.
- `facts.json` — the fact layer's facts and the outside-the-sentences words
  they point at (~2 KB). Also copied to `public/examples/transformers/`.
- `train/build-heads.mjs` — the offline builder for the heads.
- `train/build-facts.mjs` — the offline builder for the facts.

## Regenerating the heads

The builder reads the GloVe file the shared embedding distiller downloads
and the attention example's `head.json`, so run the distiller first if the
cache is cold:

```
node apps/web/src/examples/shared/embeddings/train/distill.mjs
node apps/web/src/examples/transformers/train/build-heads.mjs
cp apps/web/src/examples/transformers/heads.json \
   apps/web/public/examples/transformers/heads.json
```

Deterministic (fixed PRNG seeds). It never modifies the attention example's
head; it copies it.

The facts are built separately and never touch `heads.json`: the fact words
are projected through the same PCA the vocabulary was fitted with, and the
builder refuses to write if the vocabulary does not reproduce `heads.json`.
To change a fact, edit `FACTS` in the builder (a fact's target must be a
word in no sentence), then:

```
node apps/web/src/examples/transformers/train/build-facts.mjs
cp apps/web/src/examples/transformers/facts.json \
   apps/web/public/examples/transformers/facts.json
``` The trainer prints every head's pattern on the first
sentence — if you change targets, read that output before shipping.
