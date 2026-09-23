# Shared classification machinery

Used by the naive Bayes and support vector machine examples. Both draw from
the same data and the same figure, so the distributions a student learns on
one page are the ones on the other.

```
data.ts           the true distributions, sampling, the three shapes, the
                  Bayes-optimal rule, the true per-feature curves, scoring
plot.ts           data <-> pixel scales, the region rasteriser
JointPlot.tsx     the two-feature figure: scatter, true distributions, and a
                  strip along the top and right for each feature's curves
Panels.tsx        scoreboard, data controls, legend
classification.css  panel, side column and figure marks
```

## The figure

`JointPlot` draws what both examples share: the points, the held-out points
when revealed, the true distributions (a soft fade per Gaussian component),
and the two strips. Each strip shows the sample as a rug of ticks and, with
the true distributions on, each class's true curve along that feature as a
soft fill. The strips' vertical scale is one constant (`STRIP_PEAK`), not
taken from the data, so a curve of a given width is the same height on every
sample and a curve being dragged moves against a still background.

An example adds its own marks through `underlay` (beneath the points) and
`overlay` (above them), and its own curves in the strips through
`marginLines`, and gets the geometry to place them.

## Colour

Style.md §11, "Category": the class owns the hue (`classHue()`,
`--ml-class-1…3`), and the mark says the kind: dot = data, soft fill = the
true distribution, solid line = a fit, flat wash = a prediction. Marks that
separate classes rather than belonging to one (boundaries, streets) are ink.
