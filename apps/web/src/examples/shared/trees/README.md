# Shared tree machinery

Used by the decision-tree lesson and both ensemble examples. Written for
teaching rather than for speed: datasets are tens to hundreds of rows, so
everything is the naive search with no histogram binning and no caching.

```
cart.ts          impurity, the split search, tree growing, exhaustive search,
                 bootstrap and seeded randomness
ensembles.ts     random forest (bagging + per-node feature subsets, OOB scoring)
                 and gradient boosting in the XGBoost formulation
datasets.ts      the teaching datasets, each built to show exactly one thing
TreeView.tsx     the tree diagram — questions in nodes, no/yes on edges
GainChart.tsx    every candidate split at a node, losers included
ThresholdCurve.tsx  gain against threshold for one continuous feature
LineChart.tsx    small multi-series chart for the ensemble score curves
palette.ts       class colours
```

## The design rule

`searchSplits` returns the score of **every** candidate it considered, not just
the winner. That is the whole reason this exists rather than a library call: a
finished tree diagram hides the competition, which makes the sequence of
questions look like a ranked list of features chosen up front. Showing the
losers at every node is what takes that reading apart.

Two feature kinds are kept deliberately distinct, because the difference is a
teaching point rather than an implementation detail:

- **binary** — one candidate split. Exhausted once used: every row below shares
  the value, so splitting again scores exactly zero.
- **numeric** — one candidate per midpoint between consecutive distinct values.
  Never exhausted; a tree routinely returns to the same column at a deeper level
  with a tighter threshold.

## Datasets

Each exists to make one thing visible, and they are ordered so a lesson can walk
between them changing one variable at a time. `animalsTiny` has pure leaves and
therefore a three-way tie at the root; `animalsDiet` asks something that cannot
be looked up, so leaves are impure and branch winners differ; `animalsDietSpeed`
is the same rows plus a single continuous column; `dogsComfort` is an XNOR where
greedy growing demonstrably fails. The generated ones (`makeDogScatter`,
`makeDogSizes`) exist because ensembles need more rows than a readable table
holds.
