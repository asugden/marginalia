# XGBoost

The mirror of the random forest example. There the trees run left to right and
the order means nothing; here they run **top to bottom** and the order is the
entire model.

The scrubber genuinely builds the model rather than revealing it: each step adds
one small tree fitted to the *current* residuals, and the residual panel shrinks
as you drag. Round k cannot be moved, removed or reordered, because rounds
k+1 onwards were fitted assuming it was there. Reordering these trees is not a
slower route to the same answer; it is undefined.

## What is actually implemented

The XGBoost formulation, not classic gradient boosting:

- splits scored by the second-order objective, `G²/(H+λ)`
- leaves take the closed-form weight `-G/(H+λ)`
- `lambda`, `gamma` and `min_child_weight`
- shrinkage (`eta`) applied to every tree's contribution

For squared error the gradients are simple — `g = prediction - target`, `h = 1`
— which keeps the arithmetic legible while the machinery stays honest, and it is
why "fit the gradient" and "fit the residual" say the same thing here. That is
the loss to teach boosting with.

**This is not the XGBoost library**, which does not run in a browser. It is that
recipe implemented from scratch so the page can show every round. The knobs are
the real ones and the arithmetic matches; the code is not the same code, and the
page says so.

## The overfitting story

Held-out error bottoms out and then drifts up while training error keeps
falling. That divergence is the difference between the two ensembles in one
picture: a forest flattens out and stays there, a boosted model will happily
keep going until it has memorised the sample. Learning rate 1 with depth 4 makes
it dramatic — the best round arrives in single digits and everything after it is
damage.

This is why the dataset here is generated with real scatter rather than reusing
the small hand-written table: there has to be noise to overfit, and rows the
model has not seen.
