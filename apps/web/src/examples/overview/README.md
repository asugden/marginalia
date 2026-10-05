# Overview page

`/examples/machine-learning` — a map that sits above the rest of the gallery.
Three figures: the shape every problem shares, the one spreadsheet it fits in,
and the complexity line every model sits on.

## Two rules

**Everything clickable lives inside a diagram.** No navigation cards, no "next"
buttons, no link lists. The way onward to another example is to click the thing
itself on the line — the family label, or a model under it. If you find yourself
adding a button to get somewhere, the diagram is not doing its job.

**Show, don't tell.** Where a claim can be made by position, size, or a dividing
line, it is not also made in a paragraph. The interpretability claim is carried
by the open-to-black bar under the axis — not by prose under the figure.

## Files

```
taxonomy.ts       families, their position on the axis, which way each label
                  column leans, and the sizing bands. Edit the curriculum here.
MachineLearningPage.tsx
PipelineFigure    data -> features -> model -> labels as one SVG, with the
                  label taxonomy forking off `labels`. Static; nothing is clickable.
SheetFigure       the spreadsheet, with the data->features transform toggle.
ComplexityLine    the axis, its families and models, and the sizing sliders.
overview.css
```

## Things that will bite you

**Both figures are fixed-coordinate SVGs.** They speak in the shared figure
voice (`shared/figure.css`) and are drawn 1:1 in their viewBox, so every label
is placed, not flowed. The pipeline shrinks on narrow screens; the complexity
line stops shrinking at 900px and scrolls sideways in `.ovw-line__scroll`,
because below that its model names collide.

**The pipeline's rows line up on purpose.** Features and labels share row
y-positions (`ROWS`); data sits above on its own (`DATA_ROWS`), joined by the
elbow arrow.

**Label columns lean, they do not centre.** The spacing is the argument: the
open-box families bunch up near regression (about 75px apart) and the axis then
opens out to trees. Names that wide cannot fit between ticks that close, so SVM
declares `side: "above"` and hangs its names over the line, in the empty left
half of the figure. Each family declares a `lean` in `taxonomy.ts` and hangs
its names off its tick toward whichever side has room. If you add or move a
family, re-check the leans, and keep `OPEN_BOX_EDGE` in a gap between columns:
its dashed drop line runs down through the model names.

**The answer lives on the line.** The sizing sliders sit below the figure, but
their result is drawn on the axis: the chosen family's tick becomes an accent
dot and its name takes the accent. There is no separate marker or overlay.

## The sizing bands

Feature count picks the family; plenty of rows can push it one family to the
right; too few rows only raise a warning:

```
features  family                       needs        one step right at
1–4       open box                     ~100 rows    10,000+ rows
5–100     XGBoost                      500+ rows    1,000,000 rows, if 20+ features
100+      reframe, or neural network   10,000+ rows
```

Rows never pull the pick left, so the feature rule below still holds.

These are blunt on purpose. Five features and eight hundred rows is an XGBoost
problem; seventeen features is basically never anything less. They are the
numbers a designer should leave with, not a practitioner's decision surface —
so resist adding nuance that makes the boundary harder to remember.

Both sliders are **log scale**. On a linear track everything from 1 to 100
features lands in the first tenth and cannot be dragged usefully.
