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
   shape — columns of neurons, widening through the memory and narrowing
   back — with the attention block drawn as the grid it is, two dashed
   residual arcs carrying the word past each stage to a `+`, and a dashed
   repeat frame. Every node is live for the selected word (its embedding in,
   which drawers opened in the middle, the block's output out). Numbered
   markers 1–5 match chips on the panel headings, so every panel can point
   at its place on the map.

1. **The head, as one box.** The attention page's whole subject collapsed to
   an object: words in on the left with their E strips, a box holding the
   two things a head does (a mini attention grid for *how much*, values for
   *what*), the same words out on the right with their vectors changed.
   Computed from head 0, which is the attention example's head verbatim, so
   the two pages agree to the last digit. Hover a row for "pierogi came out
   made of greasy 43%, soggy 41%".

2. **Many heads at once.** Three heads side by side, each with its own mini
   grid and its own output for the selected word, stacked end to end into a
   48-number vector and multiplied by `W_O` back to 16. Click a head to
   switch it off and watch its third of the stack go blank. The heads were
   fitted to find three different relationships (see below), so for
   "pierogi" only the adjective head does anything while for "a" only the
   little-words head does. This is where the attention page's footnote about
   `W_O` pays off: here it is, and here is why it exists.

3. **Add & norm, as two paths.** The point is a contrast with every layer
   the student has met before, which *replaces* its input. The same word goes
   down both paths: "the old way" — the layer's output alone — and "a
   transformer" — the word plus the layer's output — each ending in a "still
   the word?" meter (cosine to the original embedding) and the nearest known
   word. Replace, and the result is barely like the word; add, and it is
   still the word carrying what it learned. Then the norm, with size before
   and after. Used twice, after attention and after the memory.

4. **The feed-forward layer as a memory.** Each word alone, with no view of
   the others, is presented to a bank of drawers; each drawer has a key and a
   value; the drawers whose keys match open and their values are summed into
   the word. This is the key-value-memory reading of the feed-forward layer
   (Geva, Schuster, Berant & Levy 2021) and the place ROME finds factual
   associations (Meng, Bau, Andonian & Belinkov 2022). The panel also states
   the parameter share: `4d²` for attention's four matrices against `8d²` for
   the memory's two. Followed by the second add & norm.

   **The memory here is designed, not learned,** and labelled so on the
   page: one drawer per word the model knows, keyed on that word's
   embedding, whose value nudges toward that word. Sixteen dimensions of
   GloVe leave nothing to train a real one on. The mechanism — sparse keys
   firing on similarity above a threshold, values summed, no cross-talk
   between words — is exact.

5. **One block, then stack it.** Our block drawn as a diagram with the
   repeat bracket and the two skip paths, beside a table of real models:
   blocks, heads per block, their product, and width, each row tagged by
   where the number comes from (published paper, open weights, or reported
   leak). GPT-4 is present as the example of the last kind and marked as an
   estimate; current closed frontier models are noted as undisclosed. Links
   onward to the parameter-budget example for why width dominates.

6. **The canonical figure, decoded.** Figure 1 of "Attention Is All You
   Need" redrawn in SVG with its layout and colours, next to a legend that
   translates every box into this page's language and links to the panel
   where the student watched it happen. Hovering a box lights its legend
   row and vice versa. A toggle fades everything this page did not build —
   the decoder tower, the mask, cross-attention, linear + softmax — leaving
   the encoder lit, with the un-built pieces named and pointed at the
   language-models example.

**Vocabulary across the page:** the panels reuse the attention example's
drawing language (red/blue strips for vectors, shaded grids for attention
patterns, swatches for matrices) so that "the whole attention page is now
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
against. The memory's drawers are the vocabulary's own embeddings. The page
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
- `MemoryPanel.tsx` — the drawers (panel 4).
- `StackPanel.tsx` — the block diagram and the table of real models.
- `CanonicalFigure.tsx` — the redrawn paper figure and its legend.
- `TransformersPage.tsx` — the page and its prose.
- `heads.json` — three heads and `W_O` (~21 KB), committed so the page is
  fully static. Also copied to `public/examples/transformers/`.
- `train/build-heads.mjs` — the offline builder.

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
head; it copies it. The trainer prints every head's pattern on the first
sentence — if you change targets, read that output before shipping.
