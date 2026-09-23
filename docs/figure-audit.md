# Figure audit — the checklist

How to bring one example in line with the rules in [style.md](style.md):
§11 (figure colour), §12 (figure text, scale, neurons), §13 (words) and
§14 (panels). Run it one example at a time, all the way through: a
half-audited example is harder to read than one that has not been
touched, because it speaks two dialects at once.

The rules say *what*; this file says *how to check*, and records where the
audit stands. When the checklist and the style guide disagree, the style
guide wins and this file is fixed. Keep the **Status** and **Open
decisions** sections current at the end of every pass — they are what the
next person (or session) picks up from.

## Working method

- **One example per pass, done collaboratively with the maintainer.** Work
  through every section below for that example, then stop for review.
- **The maintainer checks the result visually.** Do not spend the pass
  screenshotting to verify; do run the typecheck, and measure on-screen
  sizes with the browser's computed styles when size is in question.
  Screenshots are for layout problems the maintainer has asked about.
- **Show, don't tell.** The examples are used in class after an
  introduction. Keep prose to a sentence or two per panel; never add text
  that explains how to operate something the interaction makes obvious;
  never add formula-level detail the reader does not need; prefer positive
  phrasing to "not / no / nothing".
- **The deep neural network example is the reference** for layout,
  neurons and tone. When in doubt, match it.
- **Scope.** Fix what the audit finds in the example under review. A shared
  file (figure.css, digit-recognizer.css, palette.ts) may change, but say
  which other examples the change reaches.
- **Privacy.** This is the public repository: no institution names, course
  names or private planning in code, comments or docs.

## Where things live

| What | File |
|---|---|
| Figure colour scales and helpers | `apps/web/src/examples/shared/palette.ts`; tokens `--ml-*` in `apps/web/src/tokens/colors.css` |
| Figure text, neuron and tile classes | `apps/web/src/examples/shared/figure.css` (import it on the page) |
| Figure label grey, neuron and tile borders | `--fig-text-label`, `--fig-node-border`, `--fig-tile-border` in `tokens/colors.css` |
| The pinned control bar | `apps/web/src/examples/shared/controls.css` (`.ex-controls`, `.ex-followed`) |
| Network-example page chrome, `--fig-scale: 1.33` for 1000-unit figures | `apps/web/src/examples/mnist-mlp/digit-recognizer.css` |
| Rendered specimens | the `/design` gallery, **Examples · Figures** |
| The rules | `docs/style.md` §11–§14 |

## Before you start

- Read the example's README. Some choices look like violations and are
  deliberate; they should be named there and, if they break a rule, listed
  under **Recorded exceptions** in style.md §11. Anything not recorded is a
  bug.
- List every figure the example draws, including the ones that only
  appear on interaction: pop-ups, hover cards, tooltips, scan panels,
  expanded views. They are the ones most often missed.

## 1. Colour (style.md §11)

For every mark, decide which kind of number it shows, then check its scale:

| The mark shows | Scale | Helper |
|---|---|---|
| a parameter the model fitted (weights, kernels) | sage + / plum − | `learned()`, `LEARNED_POS/NEG` |
| a number computed from this input, signed | vermillion + / cerulean − | `value()` |
| a computed number that cannot go below zero (after a ReLU, a softmax, a probability) | paper → vermillion | `magnitude()` |
| the data as it arrived (pixels, the drawing) | paper → ink | `input()` |
| the class a point belongs to, in a classifier (and anything that belongs to one class: its curves, its region) | teal / periwinkle / amber, in order; the mark says the kind | `classHue()`, `--ml-class-1…3` |

Then:

- [ ] No brand accent on anything that encodes a number. The accent is for
      selection, focus and "look at this one" only. Bars and fills in side
      readouts count: a probability bar is data.
- [ ] No hand-rolled ramps (`rgb(...)` built from a number, literal red/blue
      pairs). Replace them with the helpers.
- [ ] Non-data structure (wiring, category fills, brackets) uses the design
      system's general hues (`--purple-600`, `--amber-tint`, …), never a
      figure scale and never a raw hex.
- [ ] Remaining literals are tokens: hairlines `--border`, fills
      `--surface` / `--sand-*`, backdrops `--ink-900`, text on an accent fill
      `--text-on-accent`, neuron and tile borders `--fig-node-border` /
      `--fig-tile-border` (see section 4). No hex left in the figure.
- [ ] The page's legend matches what the figure actually draws.

## 2. Text (style.md §12)

For every piece of text in every figure, name its job and give it the
class for that job:

| Job | Class |
|---|---|
| names a part: layer, lane, column, axis, stage | `.fig-label` (`.fig-label--lg` for a large figure's main layer names) |
| the quieter line under a label | `.fig-label-sub` |
| names rows that are the argument (alternatives compared) | `.fig-row` |
| a position on an axis | `.fig-tick` |
| the data's own words | `.fig-word` |
| the word the figure follows, inside a label | `.fig-word--key` (a `<tspan>`) |
| a value | `.fig-num` |
| explains something | `.fig-note` |
| selected | `.fig-on` (others `.fig-dim`) |
| links to another example | `.fig-link` on the wrapping `<a>` / `<Link>` |

Then:

- [ ] The page imports `examples/shared/figure.css`. Without it the classes
      do nothing and text falls back to unstyled defaults — lowercase,
      unsized — which is easy to miss because it still renders.
- [ ] No inline `fontSize` / `fill` / `fontFamily` on figure text. Glyphs that
      are part of the drawing (×, →, the digit on an output tile) may keep
      theirs.
- [ ] Uppercase names; it never explains. A label with a verb in it is a
      note.
- [ ] Notes are sentences: capital letter, full stop.
- [ ] One selected state: accent and bold.
- [ ] No `--text-faint` on figure text; labels use `--fig-text-label`.
- [ ] No instructions that the interaction already makes obvious ("click
      anywhere to close"), and no formula-level detail the figure's reader
      does not need.

## 3. Size and scale (style.md §12)

- [ ] Every figure `<svg>` has `width` and `height` as well as `viewBox`, and
      is styled `max-width: 100%; height: auto` — it shrinks to fit a narrow
      screen but never grows.
- [ ] If the figure is drawn wider than its column (it shrinks at desktop
      width), it declares `--fig-scale` = its width ÷ the column's, so its
      text lands at the stated pixel sizes.
- [ ] Measure one label of each class on screen (rendered font size × the
      figure's scale) and compare with an already-audited example.

## 4. Neurons (style.md §12)

- [ ] Every neuron is the shared one: a rounded square (corner radius about
      a third of its side) drawn with `.fig-neuron`; input and output tiles
      with `.fig-tile`. No per-example border widths or copied `#888888` /
      `#c9c2b8`.
- [ ] On a figure that shrinks, the border still lands near 2 px on screen
      (the classes multiply by `--fig-scale`).
- [ ] Rows of neurons too small to read as squares use `.fig-neuron--small`.
- [ ] The border carries no meaning except "picked out" (fired, on the
      traced path, the winner), which takes a darker or accent border.

## 5. Words (style.md §13)

- [ ] Every term is the one in style.md §13's table. Search the example's
      page text, figure text, aria-labels, gallery blurb and tags, and the
      overview's model list — not comments or code names.
- [ ] Other names for an idea appear only where §13 says they are named.

## 6. Panels and boxes (style.md §14)

- [ ] Each panel is one `Card` (`padding="md"`) with, in order: an `<h2>`
      title (`--text-lg`, strong, sentence case, no full stop), a one- or
      two-sentence standfirst (`--text-sm`, `--text-secondary`, ≤78ch), the
      interaction and figure, and an optional note under a top rule
      (`--text-xs`, muted).
- [ ] Subheadings are `<h3>` at `--text-md`, strong. A second beat that
      needs its own standfirst and figure is a new panel.
- [ ] Layout: side by side (≈260 px controls column, figure right, stacking
      below ≈860 px) for a tall figure worked continuously; stacked for a
      wide figure or a single row of choices.
- [ ] A choice that several panels in a row follow lives in one pinned bar
      (`shared/controls.css`) wrapping exactly those panels; the panels have
      no copies of it. Page-wide switches sit at the bar's right-hand end.
- [ ] Surfaces: everything the reader operates (the bar, controls boxes,
      slider groups) is `--surface-sunken` with a `--border-strong` edge;
      readouts are white `--surface` boxes with `--border`; pop-ups are the
      sunken card with a shadow.
- [ ] Choices are `Button` rows (`primary` = chosen, `subtle` = the rest);
      page-wide on/off is a `Switch`; slider rows read label · slider ·
      value in mono.
- [ ] Readouts: a mono uppercase kicker over the value; big numbers mono,
      bold, tabular; figure-scale values in the scale's `-ink` colour.
- [ ] Page-specific copies of shared pieces (a local pinned-bar class, a
      local `h2` class) are replaced by the shared ones where they exist.

## 7. Pop-ups and overlays

- [ ] Drawn last, so nothing in the figure paints over them.
- [ ] Look like pop-ups: a raised card (`--surface-sunken` fill,
      `--border-strong` edge, a soft drop shadow), not a white box with an
      accent outline.
- [ ] Tied to what they describe (a leader line to the scanned window, the
      selected element highlighted).
- [ ] Close like pop-ups: a click outside, or Esc. No separate "stop" or
      "close" button, and no text telling the reader how to close them.
- [ ] Their text is legible at the figure's real on-screen scale.

## 8. Finish

- [ ] The README describes the colours and any recorded exception.
- [ ] Typecheck passes.
- [ ] The maintainer checks it visually.
- [ ] Mark the example done in the table below.

## Status

Last updated after the counting parameters pass (rebuilt around the smallest models, a language model's width, rounding and copying). Before that, the naive Bayes pass, which split the old page into
naive Bayes and a new support vector machine example sharing
`examples/shared/classification`, and added the **Category** kind to
style.md §11. Before that: the convolutional network pass and the sweep that
retired the old shared label class `.at-grid__axis` (its 50 uses across
attention, transformers, BERT and RNN moved onto the shared voices by job,
and the class was deleted). "—" is not started.

| Example | Colour | Text | Scale | Neurons | Words | Panels | Pop-ups |
|---|---|---|---|---|---|---|---|
| convolutional network | done (feature maps greyscale: recorded exception) | done | done | done | done | not checked | done |
| activation functions | done | done | done | own `.af-node` spec | done | controls boxes are white, should be sunken | — |
| large language models | done (new panels built to the rules; "Make it bigger!" moved to counting parameters) | done | grid is `width: 100%`, not 1:1; pipeline 1:1 | pipeline uses `.fig-neuron` | done | new panels use a local sunken controls box (`.lm-controls`) | none |
| deep neural network | legend and readout bars only | — | shares `--fig-scale`; SVG still `width="100%"` | — | done | not checked | trace tooltip not checked |
| transformers | mostly | old label class migrated; per-page classes (`.tf-map__cap`, `.tf-box__*`, `.tf-rowlabel`, …) remain | done | fact neurons and map nodes use own specs | done | uses the old `.tf-controls` bar | — |
| attention | mostly (palette pass done; value-box weights fixed) | old label class migrated; other per-page classes remain | — | — | done | uses the shared bar | — |
| word2vec | done | — | — | copies the node spec as literals | done | — | — |
| BERT, RNN | — | old label class migrated; other per-page classes remain | — | — | done | — |
| naive Bayes | done (first Category example) | done | done | no neurons | done | done | none |
| support vector machine | done (new, built to the rules) | done | done | no neurons | done ("street", §13) | done | none |
| softmax | done (bars were accent and a literal blue) | HTML figure; faint greys replaced | no SVG | no neurons | done | controls boxes now sunken; temperature not yet the shared pinned bar | none |
| counting parameters | done (learned only where weights are real; counts in greyscale's no-sign case, as the LLM heads; class hues for naive Bayes; no accent on data) | done | done (all SVGs 1:1) | no neurons | done | done (sunken controls, white readouts) | none |
| fitting complex shapes | done (new, built to the rules: data ink, fits vermillion, truth a soft grey band, miss curves neutral) | done | done (both SVGs 1:1) | no neurons | done | done (shared pinned bar, sunken controls, white readouts) | none |
| fastText, training, decision tree, random forest, XGBoost, overview | — | — | — | — | done | — | — |

The **Words** column was swept across every example at once when §13 was
written; re-check it in each example's pass.

## Open decisions

Questions put to the maintainer and not yet answered. Ask again when the
example comes up rather than deciding alone.

- **tanh in the activation example.** It is in the pinned bar for the first
  two panels, where it looks almost identical to sigmoid. Its real
  difference shows in a deep chain (×0.10 after 8 layers against sigmoid's
  ×6·10⁻⁶). Options: move the tanh chain to the RNN example, framed as time
  steps next to the LSTM's gate-versus-content split; add it to "Why ReLU
  won" after all; or take it out of the bar.
- **One pinned bar.** The attention example uses `shared/controls.css`; the
  transformers (`.tf-controls`) and activation (`.af-controls`) examples
  still carry their own copies. Move both onto the shared one (and the
  "surfaces" rule above applies to all three).
- **Tree examples' class colours.** `shared/trees/palette.ts` still has its
  own class palette, and its first hue is a green close to sage. When the
  decision tree, random forest and XGBoost examples have their pass, move
  them onto `--ml-class-1…3` so a class is the same colour on every
  classifier page.
- **SVM extras.** The SVM example fixes C at 1 and is linear only. A C slider
  (wide street with points inside it, against a narrow one that separates
  everything) and a kernel toggle (a curved boundary that can split the
  checkerboard) were left out to keep the page small.
