# Example: Fitting Complex Shapes

A standalone, static, interactive page on what extra parameters buy a model,
and what they cost. Mounted at `/examples/complex-shapes`. No backend, no
weights file: every fit is computed in the browser by `fit.ts`.

The other examples lean on these two ideas without stopping for them — the
activation example's network gaining neurons, XGBoost's fit sharpening as
trees go in and its test error turning back up. This page shows them on
their own, with the smallest models that make them visible.

One pinned bar chooses what the curve is **built from**, for both panels:

- **Steps** — a flat value per stretch of the input: every shape a
  regression tree on one input can make. k leaves keep k values and k − 1
  thresholds, 2k − 1 parameters.
- **Bends** — a straight line with corners: what one hidden layer of ReLU
  neurons adds up to. n corners take n + 1 neurons (one always on, for the
  line's own slope), and one input → n + 1 neurons → one output keeps
  3(n + 1) + 1 parameters, the count the counting parameters example uses.

Each panel's slider counts **parameters**, and the budget is kept when the
reader switches between steps and bends, so the two can be compared at the
same count. The readout under the slider names the model the count stands
for ("a tree with 7 leaves", "a network with 3 ReLU neurons").

## What it shows

1. **Draw a shape.** A heartbeat to start with — long flat stretches and one
   sharp spike — which the reader can draw over or replace. No noise, so every
   parameter can only bring the curve closer; the average miss falls and the
   ticks under the plot mark where each piece begins.
2. **Overfitting.** Traffic past one spot on a road, counted every half hour
   (48 counts, a morning and an evening rush). The model is fitted to today's
   counts (filled dots) and scored on the next day's (hollow, same times).
   Under the plot, both misses against parameters: today's falls to zero, the
   next day's bottoms out and creeps back up. **Next day** moves the calendar
   on — the next day becomes today — and the last four days' fits stay on the
   plot, faint, at the current size: small models agree from day to day,
   large ones chase each day's scatter. A switch shows the usual traffic the
   counts were drawn from.

Because both kinds interpolate by stepping or zig-zagging between points,
neither swings wildly between them the way a high-degree polynomial does; the
next day's miss at the largest size is about √2 times the scatter, and its
rise from the best size is modest and varies from day to day. The gap
between the two misses is the picture. The page opens on a day whose next-day
miss turns up clearly for both kinds (`FIRST_DAY` in `NoisePanel.tsx`); any
day shows the gap.

## How the fits are found

Exactly, and the same for every viewer. A dynamic programme over the sorted
points finds the best split into k stretches (flat stretches for steps,
straight ones sharing their end points for bends). Steps take each stretch's
mean. Bends are refitted by least squares as one continuous line with
corners at those points. This is the best tree of each size, which a greedy
tree-growing algorithm does not always find, and a network whose corners were
placed by search rather than gradient descent; both are within the family of
shapes the named model can make.

## Colour

Per `docs/style.md` §11: the drawn shape and the counts are data as it
arrived (ink); a model's curve is computed (vermillion), its fits to earlier
days the same, faint; the usual traffic is the truth the data was drawn from,
a soft grey band with no edge. The miss curves are neutral, the next day's
set dark as the honest one. The accent marks the chosen size only.

## Files

- `fit.ts` — the two model kinds, parameter counts, the exact fits, the
  heartbeat and the traffic days.
- `DrawPanel.tsx`, `NoisePanel.tsx` — the two panels.
- `draw.tsx` — the fitted curve as a path, the parameter slider, the bar's
  glyphs.
- `ComplexShapesPage.tsx` — the page and the pinned bar.
- `complex-shapes.css` — panels, boxes and figure marks.
