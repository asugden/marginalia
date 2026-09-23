# Naive Bayes

Fit naive Bayes by hand, then let the model fit the same points. The reader
drags one bell curve per class along each feature (a centre and a spread),
which is the whole of Gaussian naive Bayes. The regions in the plot are
computed from those curves, so changing the curves is the only way to
change them.

Static and unauthenticated. Everything (the distributions, the sample, the
fit) is generated in the browser from a seed, so there is no asset to load
and a given seed always replays. The data comes from
[`shared/classification`](../shared/classification/README.md), shared with
the SVM example.

## What it is built to show

| pair | lesson |
|---|---|
| you vs naive Bayes | the same model, fitted by eye and by maximum likelihood |
| train vs test | overfitting, as a number that moves rather than a definition |

The strips carry the main idea. In two features, naive Bayes *is* the curves
along the top and the right, multiplied together. Each class's ellipse in the
plot is that product, so it can stretch along either axis but never turn. On
tilted data the reader tries to turn it and finds there is no handle for that.

With the true distributions on, each strip also shows the true curves as soft
fills. On **tilted** the fitted curves match the true ones almost exactly,
feature by feature, and the ellipse is still wrong: each curve is right, and
multiplying them is the mistake. On **interleaved** the classes' true curves
are nearly identical along each feature, which is why the model is left
guessing.

## Difficulty settings

Gaussian naive Bayes makes two separate assumptions, and each setting breaks
a chosen one:

- **Round** breaks neither. Naive Bayes lands within a point or two of
  optimal. Worth seeing: "naive" is not a synonym for "wrong".
- **Tilted** breaks conditional independence. Two features only; with one it
  is disabled, because independence is about how features relate.
- **Interleaved** breaks the assumption that each per-feature curve is a
  single Gaussian.

How the shapes are constructed so that they actually cost accuracy is in
`shared/classification/data.ts`.

## Colour

The class owns the hue (`--ml-class-1…3`, style.md §11 "Category"), and the
mark says the kind:

| Mark | Kind |
|---|---|
| dot, and a tick in the strip's rug | the sample |
| soft fill | the true distribution |
| solid line with handles | your curves, and your ellipse |
| dashed line | naive Bayes's curves and ellipse, once fitted |
| flat wash | the regions, yours or naive Bayes's |

The curves are learned parameters, but they stay in their class's hue rather
than sage: every curve belongs to a class, and which class is the thing the
reader needs to read off it. That is the Category rule, not an exception.

## Files

```
nb.ts            the naive Bayes fit, prediction, and the reader's curves
ScatterPlot.tsx  two features: the shared joint plot, with curve handles
                 in the strips and each class's ellipse in the plot
StripPlot.tsx    one feature: the curves, with handles, over a dot strip
```
