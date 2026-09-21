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
by the dashed divide and by "black box" being set in a lighter ink than "open
box" — not by prose under the figure.

## Files

```
taxonomy.ts       families, their position on the axis, which way each label
                  column leans, and the sizing bands. Edit the curriculum here.
MachineLearningPage.tsx
PipelineFigure    data (above) -> features -> model -> labels, plus the label
                  taxonomy hanging off `labels`. Static; nothing is clickable.
SheetFigure       the spreadsheet, with the data->features transform toggle.
ComplexityLine    the scroll-pinned axis and the sizing overlay.
overview.css
```

## Things that will bite you

**The scroller is `.app__body`, not the window.** The shell puts
`overflow-y: auto` there, so `window.scrollY` never moves and a window scroll
listener silently never fires. `ComplexityLine` walks up to the nearest
scrolling ancestor. Same reason the pin is `calc(100vh - 60px)`: the scroller
already sits below the topbar, so a full `100vh` overflows it by exactly that
much and the sizing panel falls off the bottom.

**Label columns lean, they do not centre.** The first two families sit ~17% of
the axis apart — about 170px on a 1000px stage — while "support vector machine"
needs ~190px unwrapped. Centring both on their ticks cannot fit at any column
width. Each family declares a `lean` in `taxonomy.ts` and grows into whichever
side has room. If you add or move a family, re-check the leans.

**Below ~1000px the stage scrolls sideways.** A horizontal axis with four
labelled families does not fit a phone. `.ovw-stage` holds a `min-width` and
`.ovw-pin__track` scrolls horizontally rather than letting the labels collide.

**The marker's stem is pinned to a measured pixel offset.** The axis stroke sits
166px above the stage's bottom edge (quantities block + axis svg + the 6.5rem
column row). The pill is held exactly one stem-length above that so the stem's
tip lands on the stroke. If you change the column row's height or the svg's
viewBox, re-measure — the two constants have to move together, and shrinking
both at once moves the tip nowhere.

**The fork list is aligned by measurement, not by a magic offset.** The label
forks have to start under the `labels` box, whose x position depends on how wide
the boxes and arrows render. `PipelineFigure` measures it into `--ovw-labels-x`.

**Labels are HTML, not SVG text.** SVG text cannot wrap and has to be placed by
guessed width; at this density the guesses collided. The axis is SVG; the labels
are an absolutely-positioned HTML overlay sharing the same percentage
coordinates. `.ovw-cols` needs an explicit height — with `height: 0` the columns
render outside the stage and the track's overflow clips them.

## The sizing bands

Feature count picks the family; rows only say whether you have enough data for
that pick:

```
1–4      open box     ~100 rows
5–100    XGBoost      500+ rows
100+     reframe, or neural network   10,000+ rows
```

These are blunt on purpose. Five features and eight hundred rows is an XGBoost
problem; seventeen features is basically never anything less. They are the
numbers a designer should leave with, not a practitioner's decision surface —
so resist adding nuance that makes the boundary harder to remember.

Both sliders are **log scale**. On a linear track everything from 1 to 100
features lands in the first tenth and cannot be dragged usefully.
