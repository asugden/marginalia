# Naive Bayes

Draw a decision boundary by hand, fit Gaussian naive Bayes to the same sample,
and compare both against the Bayes-optimal rule computed from the true
generating distributions.

Static and unauthenticated. Everything — the distributions, the sample, the fit
— is generated in the browser from a seed, so there is no asset to load and a
given seed always replays.

## What it is built to show

Three predictors are always on screen, and each pair of them is a separate
lesson:

| pair | lesson |
|---|---|
| you vs naive Bayes | whether a person can beat a fitted model by eye |
| seen vs fresh | overfitting, as a number that moves rather than a definition |
| anyone vs Bayes | there is a ceiling, and the gap to 100% is irreducible overlap |

The margins carry the main idea. In two features, Gaussian naive Bayes *is* the
four curves drawn along the bottom and side: one mean and one variance per class
per feature, multiplied together. Nothing in the model can express how the
features move together, so its contours are ellipses square-on to the axes — the
fitted ellipse can stretch, but it can never turn.

## Difficulty settings

Gaussian naive Bayes makes two separate assumptions, and each setting breaks a
chosen one:

- **Round** — breaks neither. Naive Bayes lands within a point or two of
  optimal. Worth seeing: "naive" is not a synonym for "wrong".
- **Tilted** — breaks conditional independence. Two features only.
- **Interleaved** — breaks the assumption that each per-feature conditional is a
  single Gaussian.

Two details took care to get right, and both are load-bearing:

**Tilted has to be constructed deliberately.** The naive boundary is normal to
`diag(Σ)⁻¹Δμ` and the optimal one is normal to `Σ⁻¹Δμ`, so if `Δμ` happens to
lie along an eigenvector of `Σ` the two agree *exactly* and the independence
assumption costs nothing at all. Damage is maximised the other way round: tilt
the shared covariance to about 45°, so its diagonal is nearly isotropic, then
separate the means along an axis. That opens a gap of roughly 20 points.

**A wide class wrapped around a narrow one does not defeat it.** When the fitted
variances differ the per-feature Gaussians cross twice, the boundary comes out
quadratic, and naive Bayes carves out the middle region on its own. What defeats
it is making the classes *share their marginals* — a checkerboard in 2D, three
lumps interleaved with two in 1D. Feature by feature the classes are then
identical, and the model is reduced to guessing while the joint distribution
separates them almost perfectly.

With one feature, `tilted` is disabled rather than hidden. Conditional
independence is a claim about how features relate to each other, so with a lone
feature naive Bayes is not being naive about anything — it is simply a Gaussian
classifier, and optimal whenever the classes are Gaussian.

## Files

```
nb.ts           distributions, sampling, the Gaussian NB fit, the Bayes-optimal
                rule, the hand-placed classifier, and scoring
plot.ts         palette, data<->pixel scales, region rasteriser
ScatterPlot.tsx two features: scatter, draggable boundaries, ellipses, margins
StripPlot.tsx   one feature: densities, dot strip, draggable cuts
```
