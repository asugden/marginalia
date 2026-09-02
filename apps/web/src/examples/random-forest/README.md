# Random Forest

Reveal a forest one tree at a time, laid out **horizontally**. The sibling
example (gradient boosting) is the same visual grammar rotated ninety degrees,
and the pair is meant to be read together.

## The point of the layout

The trees are grown in parallel and none of them knows the others exist. So the
scrubber does not build the forest so much as *reveal more of it*: drag it and
earlier trees never change, because nothing about tree 12 depended on tree 11.

Nothing here depends on the order the trees were grown in: averaging is
commutative, and no tree was fitted with any knowledge of another. The scrubber
shows it — earlier trees never change as later ones arrive. The boosting page is
the opposite, and that contrast is the reason the two examples sit together.

## Why not the small animal dataset

A forest needs enough data for the vote to mean something. With two dozen rows,
a third of them held out of every bootstrap, the out-of-bag estimate is computed
over a handful of rows, swings wildly, and teaches the opposite of the truth —
the OOB curve actually *falls* as trees are added. The generated sample here has
enough rows for the curve to behave: it rises steeply, then flattens.

## What the knobs show

- **Features per split** — drawn afresh at every *node*, not once per tree. Turn
  it down to 1 and the OOB curve gets worse: each tree is now too starved of
  choices to be worth averaging.
- **Bootstrap** — turn it off with all features available and every tree becomes
  identical. The forest collapses to a single tree and the vote tells you
  nothing new.

Both extremes fail, and what the useful middle is buying is *disagreement*:
models that make different mistakes, so averaging cancels the mistakes and keeps
the signal.

The out-of-bag curve is worth dwelling on — every row scored using only the
trees whose bootstrap sample happened to leave it out. It is a genuine held-out
estimate that costs no extra data.
