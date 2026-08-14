# Example: digit recognizer

A standalone, static, interactive page that visualizes a real neural
network classifying a hand-drawn digit in real time. Mounted at
`/examples/digit-recognizer`. No backend, no auth, no course context —
it loads a pre-trained model as a static JSON asset and runs the whole
forward pass in the browser.

It is registered as an **example** (see `../registry.ts`), not a module:
an example is a self-contained illustration an instructor can point
students at, near-identical for every viewer, with no data model or
course wiring.

## What it shows

The network is drawn top-to-bottom: **input at the top, output at the
bottom** (the house style; some references draw it the other way).

- **Input (top):** a 20×20 grid that is *also* the drawing surface. You
  draw a digit directly onto the model's input layer with the mouse; a
  soft brush produces antialiased grayscale. Before the forward pass the
  drawing is **normalized the way the training data is** — cropped to its
  ink, size-scaled, and recentred by centre-of-mass — so a stroke drawn
  anywhere at any size matches the training distribution (this is what
  makes a plain vertical line reliably read as "1", etc.). The grid shows
  the *normalized* image, i.e. exactly what the network sees.
- **Two hidden layers:** 25 circles each. A circle is a neuron, shaded
  white→black by its (ReLU) activation, normalized per layer for
  contrast.
- **Output (bottom):** 11 circles — digits 0–9 plus a **blank** class so
  an empty or scribbled canvas has somewhere to go instead of forcing a
  confident wrong digit. The winner is ringed; a side panel shows the
  softmax ranking.
- **Weights as edges:** one line per weight, **red = positive, blue =
  negative**, opacity/width scaled by magnitude. The dense input→hidden
  layer alone has 10k weights, so only weights whose magnitude clears a
  threshold are drawn; a "connection detail" slider moves the threshold
  (it trims weak weights of *either* sign). This keeps the SVG light and
  is faithful to how such visualizations are usually presented.

Rendered as **SVG** (crisp at any zoom, exportable), kept smooth by
thresholding edges and memoizing the static geometry so a redraw only
recolors nodes and swaps the visible edge set.

**Hover to explain (one path at a time).** Hovering an output tile dims
the whole network and traces one legible story through it (see
`tracePath` in `NetworkView.tsx`). "Contribution" of an edge a→b is
`weight(a,b) × activation(a)` — how much a actually pushed b on *this*
input, not just the wired weight.
- Hover the **winning** tile → a positive **2 → 1 → 1** tree: the two
  input pixels, one hidden-1 neuron, and one hidden-2 neuron that pushed
  the win up the most. Bottoms out at two outlined pixels.
- Hover a **wrong** tile → a wider negative subgraph (up to 2 hidden-2,
  up to 4 hidden-1, 2 pixels). It's deliberately wider because it isn't
  obvious that a negative hidden-2→output edge can be explained by
  upstream contributions of *either* sign; the red/blue mix on the
  hidden-1→hidden-2 edges makes that visible. Pixels are chosen by weight
  magnitude (one is typically inked, one blank — presence and absence
  both matter).

While a path is shown, hovering any of its highlighted edges pops a
tooltip with that connection's **weight**, the source's **activation**,
and their product (**contribution = weight × activation**) — the same
quantity the trace ranks edges by.

## Architecture

- `net.ts` — the model type, the input `normalize()` step, and a
  hand-written forward pass (affine → ReLU → affine → ReLU → affine →
  softmax) that returns *every* intermediate activation for the renderer.
  No ML library: the forward pass is ~30 lines, and a framework would
  both hide the intermediate activations the visualization needs and add
  ~1 MB to a page whose whole payload is a few tens of KB. `normalize()`
  MUST stay in sync with `train/train.mjs`'s `normalize20()` — training
  and inference apply the identical transform.
- `NetworkView.tsx` — the SVG. Owns the input-grid drawing (pointer
  events → a 20×20 ink buffer with a soft brush → `onInput`) and renders
  all layers + thresholded edges.
- `DigitRecognizerPage.tsx` — loads the weights, runs the forward pass
  (coalesced to one pass per frame), and shows the prediction + controls.
- `weights.json` — the trained model, committed so the page is fully
  static. Also copied to `public/examples/digit-recognizer/` (the
  browser fetches it from there).
- `train/train.mjs` — the offline trainer that produced `weights.json`.

## The model

A fully-connected network (multilayer perceptron), **400 → 25 → 25 →
11**, ReLU hidden layers, softmax output. It reaches ~97% test accuracy
on standard handwritten-digit data — genuinely good, and honestly
imperfect: it will misread messy or unusual writing, which is the point.
Nothing is faked; the guess is a live computation from what was drawn.

There are deliberately no convolutions here — this mirrors the classic
fully-connected demo. A convolutional version (which can *show* its
feature maps) is a natural second example.

## Regenerating the weights

Pure Node (≥18), no dependencies — it downloads the dataset and gunzips
it itself:

```
node apps/web/src/examples/mnist-mlp/train/train.mjs
```

It writes `weights.json` next to the runtime code. After regenerating,
copy it into `public/`:

```
cp apps/web/src/examples/mnist-mlp/weights.json \
   apps/web/public/examples/digit-recognizer/weights.json
```

Training is deterministic (fixed PRNG seed), so a re-run reproduces the
same weights. The downloaded dataset is cached under
`train/.mnist-cache/` and is gitignored.

## Adding another example

1. Create a folder here with its page component.
2. Add an entry to `../registry.ts` (slug, title, blurb, tags, lazy
   `Page`).
3. The index page (`/examples`) and the route wiring in
   `apps/web/src/main.tsx` pick it up from the registry.
