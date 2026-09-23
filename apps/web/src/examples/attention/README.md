# Example: Attention

A standalone, static, interactive page that teaches the attention mechanism
one step at a time. Mounted at `/examples/attention`. No backend, no auth,
no course context — it loads a small attention head as a static JSON asset
and runs every dot product, softmax and weighted sum in the browser.

## Why attention first, transformers second

The usual presentation builds the transformer block and arrives at attention
as one of its components. That ordering makes attention look like an
implementation detail of an architecture, when it is the other way round:
attention is the idea, and a transformer is what you get when you stack it
with feed-forward layers students have already met (see the
[deep neural network](../mnist-mlp/README.md) example).

So the page teaches the mechanism on its own and only names the architecture
in the closing panel, where multi-head, feed-forward layers, residual
connections and normalization are introduced as ordinary machinery wrapped
around the one genuinely new idea.

## Why one page and not a sequence of steps

An earlier draft was a nine-step walkthrough. It was wrong for this subject
in two ways: it separated things that only make sense together (the sentence
and the grid its vectors produce; the raw scores and their softmax), and it
put the quadratic-cost payoff behind eight clicks.

The sentence and the word being followed are chosen in one pinned bar at
the top (`../shared/controls.css`), sticky over the first three panels —
the grid, the value, the movement — and scrolling away with the third.
Clicking a row of the grid still chooses the word too.

This version is a single scrolling page where everything reacts, matching the
naive-bayes example rather than the decision-tree one. Steps earn their place
when each one changes the figure; here they did not.

## What it shows

0. **The idea, before any numbers** (`IdeaPanel.tsx`). The first review by
   a mathematician found the page started at step two: it showed Q · K
   without ever saying what attention is *for*. This panel gives the
   picture with no numbers at all, in the 3Blue1Brown manner. Each word of
   the first sentence gets a row with three speech bubbles: what it asks
   (query: "Anyone describing a food?"), what it says it is (key: "I
   describe food") and what it hands over (value: "wet and limp"). Beside
   them is the comparison matrix as a grid of circles, one per pair, sized
   by how well that row's question fits that column's answer. Clicking a
   word follows its question: the answers that fit stay lit and a readout
   says what the word takes in ("It leaves as a soggy and greasy
   pierogi"). The speech is written by hand and the note says so; the
   circle areas are the head's real weights for that sentence, so the
   pattern is the one the attention matrix below prints as percentages.
   Words the head gives no question to ("Nothing to ask") attend mostly
   to themselves, which is what the shipped head does.

1. **The sentence and the grid, in one view.** The n × n grid holds one
   cell per *pair* of words. Clicking a word focuses its row. The point of
   the opening panel is the problem attention solves: `pierogi` has the same
   vector in every sentence it appears in, so it cannot know *this* pierogi
   is soggy and greasy.

   **The grid carries its own inputs on its edges, laid out like layers.**
   Borrowing the convolutional example's top-to-bottom layer layout, two
   lanes feed the grid and both start from the same embeddings. Across the
   top, one column per word: the word, its `E` strip, an arrow through a
   `× W_K` swatch, its `K` strip, then the column. Down the left, one row per
   word: the word, the same `E` strip, an arrow through a `× W_Q` swatch,
   its `Q` strip, then the row. A cell is then visibly the strip to its left
   dotted with the strip above it, and every `Q` and `K` is visibly an `E`
   pushed through a matrix. The two matrices are drawn **once each**, as
   swatches on the arrows, because they are shared by every word — drawing
   one per word would suggest the opposite. Hovering a cell lights its whole
   lineage back to the two embeddings; hovering any strip prints its numbers
   beneath the grid. The figure is centred in its card.

2. **The value, straight after the grid.** The grid answers *how much*
   and nothing about *what*, so the third matrix gets its own panel, drawn in
   the grid's own grammar (`ValueLane.tsx`): one column per word running
   word → `E` → `× W_V` swatch → `V`, then a `× weight` cell holding the
   selected word's row of the grid (square, the grid cell's size and colour,
   so the row visibly matches the grid above), then one line per word converging on the
   output strip, with line thickness carrying the weight. The weighted sum is
   therefore drawn rather than stated — "mostly greasy and soggy" is visible
   before it is read. Clicking a value zeroes it: the output moves, the
   weight cells do not, and the note says so. This is where the old
   "weights decide how much, values decide what" panel went. The output
   projection `W_O` is deliberately not drawn: for one head it composes with
   `W_V` into a single matrix, exactly as `W_Q` and `W_K` compose into one
   bilinear form, so it is indistinguishable here from a second
   multiplication; its real job is combining heads, which is a transformer
   lesson. The panel's note says as much in one sentence.

3. **Softmax as a toggle on the grid, not a separate step.** One button flips
   the same figure between raw Q·K dot products (signed, summing to nothing)
   and weights (non-negative, each row summing to 1). The explanatory note and
   the pipeline breadcrumb above it change with the toggle. It **defaults to
   raw scores**, so softmax is something the student switches on and watches
   happen rather than a transformation that already occurred.

4. **What attention did to this word.** Naming the three roles gives
   vocabulary, not intuition; the intuition is that a token *moves*. The value
   vectors and the head's output are projected to 2D and the journey is drawn:
   `pierogi` starts at its own value vector and is dragged toward its
   adjectives. The cosines beside the plot are computed in all 16 dimensions,
   not read off the picture — for the shipped head, `pierogi`'s output has
   similarity −0.38 to its own value and +0.73 to `soggy`'s. It genuinely
   moved away from itself and toward its context.
5. **Where Q, K and V come from.** The matrix itself is drawn — an 8 × 16
   heatmap tagged "learned" — times the embedding, equals the projection, with
   hovering an output component lighting the row of W that produced it and
   spelling out the arithmetic. This panel exists to fix a specific confusion:
   **W_Q, W_K and W_V are the learned parameters; Q, K and V are not.** Every
   other figure shows only the outputs, so without this one a student can see
   Q, K and V a dozen times without ever seeing the matrix that makes them.
6. **Why this gets expensive.** The quadratic cost is the single most
   consequential fact about attention, and a slider driving two counters made
   it boring. The panel (`CostPanel.tsx`) now makes the point in three beats,
   and never says "dot product" — every cell is "one computation: one word
   reading another", so the door is open to readers without linear algebra.
   *The handshake:* the words on a circle, every pair joined, and an "add a
   word" button that draws the newcomer's lines in red — it must read every
   word already there, and each of them must read it — with a counter for
   what the *next* word will cost (+2n+1). The unit of intuition is the cost
   of one more word, not the total. *The speck:* pick a real text (a
   message, this page, a long chat, a novel) and see its grid with the
   page's own 8 × 8 grid drawn inside it at true relative scale, zooming
   from the whole square down to less than a pixel. *Feel it:* the browser
   really performs the computations for the chosen size with a stopwatch,
   timing only the work itself; 2,000 words is tens of milliseconds, 20,000
   is seconds with a visibly slowing bar, and a novel is not run — its time
   is extrapolated from the measured rate and labelled as an estimate for one
   head of one layer on this machine. The closing note ties it to what a
   student has met: conversation limits, the price of long documents, and
   chats that seem to forget their start.

7. **Where a word is: positional encoding, drawn as clocks.** An earlier
   version scrambled the sentence to show the head was blind to order; that
   only proved the toy was unrepresentative. This version shows the fix and
   why it is clever, with no formula. One column per position, a stack of
   small clocks per column: the fast hand turns a quarter-turn per word, the
   next half as fast, and so on — which is literally what the sinusoidal
   encoding is (each pair of components is the sine and cosine of one hand's
   angle). The same angles are drawn beneath as a 16-number strip, so the
   "where" vector is visibly the same kind of thing as the "what" vector.
   Hovering a second column reports how alike the two codes are and by how
   much each hand turned — the same turns for any two positions the same
   distance apart, which is the property that lets "the word just before
   me" be learned once and used anywhere. Below, a slider puts the selected
   word at another position: what + where = the vector attention sees, and
   the "what" half stays fixed while the sum changes. The note says the head
   was fitted without positions (so this is the input it would receive, not
   a re-run), that real encodings use many slower hands to count to
   thousands, and that the newest models turn the hands inside attention
   (rotary embeddings) rather than adding them.

8. **That is attention. Now, transformers.**

**Hover any vector to see its numbers.** Lectures write E with an arrow
over it and treat it as an atom, so students hold "E is a thing" without
ever seeing that the thing is a list of numbers. On the grid, every E, Q and
K strip reports its full numeric contents beneath the figure on hover;
elsewhere on the page, every Q, K, V and E is a `VectorChip`: a symbol with a
colour strip showing all its dimensions at a glance, which opens into the
actual numbers on hover or keyboard focus.

**Deliberately absent:** causal masking, which needs the generation story to
make sense and adds a second idea to a page already carrying one; and
training, which is its own example.

## What is real here, and what was designed

**Real:** the token embeddings are GloVe vectors for these exact words,
reduced to 16 dimensions by the same PCA pipeline the word-embedding
examples use. Every dot product, scaling, softmax and weighted sum shown on
the page is computed live from the shipped matrices by `attention.ts`.

**Designed:** W_Q and W_K were fitted offline by gradient descent so that
nouns attend to their adjectives (`train/build-head.mjs`), rather than
learned from a language-modelling objective. W_V is a fixed random
projection — there is no "correct" value vector to fit against, and keeping
it visibly different from the identity is what lets step 6 land.

One more designed choice, invisible on the grid: after fitting, W_Q and W_K
are pulled apart by an exact reparameterisation (W_Q → R·W_Q, W_K → R⁻ᵀ·W_K
for a fixed invertible R), which leaves every score, weight and output
unchanged. Attention only ever sees the product W_Qᵀ·W_K, and gradient
descent from a small initialisation lands on the *balanced* member of that
family, where W_Q ≈ W_K (correlation 0.85 for this head). Drawn side by side
that reads as one matrix drawn twice, which is the wrong lesson for a figure
whose point is that there are two. The trainer picks R deterministically and
asserts that no score moved; see `unbalance()` in `train/build-head.mjs`.

This is a deliberate trade and the page says so in its footer. A head lifted
from a production model is not legible: real heads at 768 dimensions encode
many overlapping behaviours at once, and the clean "adjective head" of
lecture slides is largely a teaching fiction. Here the *mechanism* is exact
and the *behaviour* was chosen for teachability.

Measured behaviour of the shipped head (printed by the trainer):

```
"a soggy greasy pierogi conquered the crowded stadium"
  pierogi   -> greasy 43%, soggy 41%, a 12%
  stadium   -> crowded 97%, stadium 1%, soggy 1%
"the stubborn old trolley rattled a narrow tunnel"
  trolley   -> old 49%, stubborn 42%, a 4%
  tunnel    -> narrow 98%, tunnel 1%, stubborn 1%
```

## Architecture

- `attention.ts` — the head type and a hand-written forward pass that keeps
  *every* intermediate (E, Q, K, V, raw scores, scaled scores, weights,
  outputs) because the intermediates are the lesson. A production
  implementation fuses this into two matrix multiplications; a framework
  would hide exactly what needs drawing.
- `AttentionGrid.tsx` — the n × n SVG grid with its two feeding lanes drawn
  on the edges (word → E → × W → Q or K), so each cell reads as the dot
  product of the two strips that meet there and each strip reads as an
  embedding pushed through a shared matrix.
- `IdeaPanel.tsx` — the opening panel: speech bubbles for query, key and
  value per word, beside the matrix drawn as circles sized by weight.
- `ValueLane.tsx` — the value panel's figure: word → E → × W_V → V, × the
  selected row's weights, summed into the output, with one line per word
  whose thickness is its weight.
- `MatrixMultiply.tsx` — E × W → Q/K/V with the weight matrix drawn.
- `MovementPlot.tsx` — the 2D projection showing a token pulled toward its
  context.
- `CostPanel.tsx` — the quadratic cost in three beats: the handshake
  circle, the speck at true scale, and the live stopwatch.
- `PositionPanel.tsx` — positional encoding as clocks, and what + where.
- `VectorChip.tsx` — the hover-to-reveal vector symbol.
- `AttentionPage.tsx` — the page and all its panels.
- `head.json` — the trained head (~8 KB), committed so the page is fully
  static. Also copied to `public/examples/attention/`.
- `train/build-head.mjs` — the offline builder.

## Regenerating the head

The builder reads the GloVe file the shared embedding distiller downloads,
so run that first if the cache is cold:

```
node apps/web/src/examples/shared/embeddings/train/distill.mjs
node apps/web/src/examples/attention/train/build-head.mjs
cp apps/web/src/examples/attention/head.json \
   apps/web/public/examples/attention/head.json
```

Deterministic (fixed PRNG seed), so a re-run reproduces the same weights.
The trainer prints the resulting attention pattern for every sentence — if
you change the sentences or targets, read that output before shipping.
