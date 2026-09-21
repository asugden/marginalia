# Example: Softmax

A small, self-contained page about one function. Mounted at
`/examples/softmax`. One live figure, no backend, everything recomputed as the
scores are dragged.

## Why it exists

Softmax is load-bearing in two other examples here — [attention](../attention/README.md)
turns match scores into weights with it, and word2vec turns scores over the
vocabulary into a predicted word with it. In both places it would otherwise
be an unexplained step in the middle of something harder, so it gets its own
page and the other two link to it.

## The confusion it targets

Students read "softmax turns numbers into probabilities" and conclude it
must be doing something statistical. It isn't. It is exponentiate-then-divide,
and the only reason the output looks like a probability distribution is that
dividing by the total forces it to sum to 1.

Four columns, side by side, all live. One drag travels the whole pipeline:

1. **Model output.** Four draggable bars, signed, summing to nothing in
   particular — the raw scores a linear layer emits.
2. **÷ T.** Every score divided by the temperature, *drawn against the same
   axis as column 1* so the division reads as a movement (see "The fixed axis"
   below). Above T = 1 the bars collapse toward zero; below it they stretch
   and clip off the top of the track.
3. **eˣ.** Positive for every input, however negative. That is the whole fix.
4. **÷ sum.** Never negative, always sums to exactly 1.

Two invariants are worth confirming by hand, and each has a control:

- **Only gaps matter.** Adding the same constant to every score leaves the last
  column untouched, at any temperature. This is also why an individual score is
  not a log-odds while a *difference* of two of them is — the reason the word
  "logit" is only half accurate.
- **Softmax never reorders.** It reshapes the gaps; the winner stays the winner.

The temperature slider carries a live readout of the winning probability. That
readout is deliberately *not* an entropy: entropy would import information
theory this page never explains, and — worse — it is a genuinely statistical
quantity on a page whose whole argument is that softmax is not doing
statistics. The winner's probability needs no new vocabulary, is already
visible as the tallest bar, and is the number that governs sampling.

## Three decisions worth not reversing

**Column 1 is titled "Model output", not "Logits".** At that point in the
pipeline that is all it is: what the linear layer emitted. Those numbers earn
the name *logit* from the softmax three columns to their right — the name
describes the role, not how they were computed. The subtitle and caption still
say the word, because it is what students will meet in every framework and
paper, and this is the one page where they can see what it refers to.

**The fixed axis.** Column 2 is drawn on the raw-score axis (`logitFrac`)
rather than scaled to its own largest value like every other column. This is
not a style choice. Dividing every score by T and *then* rescaling by the new
maximum reproduces the identical picture — the column would look the same at
every temperature and teach nothing. Against a fixed axis the change of scale
is the visible event. If this column is ever rewritten, keep the shared axis.

**The uniform shift refuses rather than clips.** `shiftAll` moves all four
scores or none, and the button disables when there is no room. Clamping each
bar independently — which is what it used to do — silently turns a uniform
shift into a non-uniform one as soon as one bar tops out, at which point the
probabilities *do* move and the figure appears to disprove the invariant it
exists to demonstrate.

## What was removed, and why

- **The naive ÷ total column.** It staged a real failure (negative
  "probabilities"; a blow-up when the scores nearly cancel) but it was a
  detour: the page's subject is what softmax *does*, and a quarter of the
  figure's width went to what something else does. The eˣ column already
  carries the point that negative inputs are the problem being solved — the
  "Negatives" preset is kept for exactly that.
- **The arithmetic table**, and with it the `− max` column. `− max` is a
  floating-point safeguard (`exp(1000)` is `Infinity`), explicitly not part of
  the definition, so the page no longer spends space on it. `softmax.ts` still
  returns `max` and `shifted` if a future column wants them.

## Architecture

- `softmax.ts` — softmax with temperature, returning every intermediate
  (scaled, max, shifted, exps, sum, probs). Deliberately not a one-liner; the
  intermediates are what the page draws.
- `SoftmaxPage.tsx` — the four columns, the draggable bars (`LogitBars`), the
  read-only stage bars (`ValueBars`, with its `onLogitAxis` mode), and the
  controls.

No trained weights and no data files: every number on the page is computed
from the four scores the student is dragging.
