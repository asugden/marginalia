# Example: Convolutional Neural Network

A sibling of the MLP `mnist-mlp` example, mounted at
`/examples/cnn-digit-recognizer`. Same input grid, same chrome, same
live-inference plumbing — but the model is a small **convolutional**
network, and the visualization shows kernels, feature maps, and pooling
instead of a fully-connected weight web.

Registered in `../registry.ts`. Fully static + unauthenticated: it loads
`cnn-weights.json` and runs the whole forward pass in the browser.

## Architecture (deliberately tiny, so every part is showable)

```
input   20×20×1        the drawing grid
conv1   8 × 3×3, ReLU  → 18×18×8 feature maps
pool1   2×2 max        →  9×9×8
conv2   8 × 3×3, ReLU  →  7×7×8
pool2   2×2 max        →  3×3×8  (flatten = 72)
dense   72 → 24, ReLU
output  24 → 11        (0–9 + blank), softmax
```

~98% test accuracy. Eight kernels per conv layer is the sweet spot: few
enough to show *all* of them, enough that several conv-1 kernels settle
into recognizable **edge detectors** (e.g. a right-vs-left vertical
gradient, a diagonal). They're genuinely learned, not hand-set.

## What it shows (top → bottom)

- **input** — the 20×20 drawing grid (also the drawing surface).
- **conv 1** — each of the 8 kernels drawn as a 3×3 sage/plum weight
  swatch above its live feature map. Kernels are clickable.
- **pool 1 / conv 2 / pool 2** — the feature maps at each stage,
  shrinking. Conv-2 maps mix all 8 channels; we show the maps, not the
  8×3×3 stacks, to stay legible.
- **dense** — 24 rounded-rect neurons (same style as the MLP hidden
  layers).
- **output** — 11 tiles (0–9 + blank), winner filled with the accent.

Colour follows the shared figure scales (`docs/style.md` §11): the drawing
is greyscale (input); kernels and connections are learned weights, sage
positive and plum negative; the dense neurons and the output are computed
and never negative after the ReLU or softmax, so they run paper to
vermillion. The same vocabulary as the MLP example.

**One deliberate exception: the feature maps stay greyscale** (per-map
normalized for contrast). A feature map is an image of the drawing as a
kernel sees it; in grey, the digit's shadow carries through every layer the
way it does in the input, which is what the figure is for. The kernel
scan's ReLU output is one cell of a feature map, so it is grey too.

Figure text takes the shared voices (`examples/shared/figure.css`,
`docs/style.md` §12): layer names are labels, the kernel scan's part names
are labels, its values are numbers, and its explanations are notes. The
figure is 1000 units wide in a ~750 px column, so it declares
`--fig-scale: 1.33` (in `mnist-mlp/digit-recognizer.css`, shared with the
MLP example) for its text to land at the stated sizes. The
"show wiring" bands and toggle are structure, not data, and take the design
system's `--purple-600`.

## Connections between layers

- **pool2 → dense** and **dense → output** are *fully connected*, so
  they're drawn as real sage/plum lines (thresholded to the strongest few
  hundred by contribution = weight × source activation), exactly like the
  MLP example.
- **conv/pool connections are local** (a conv cell sees a 3×3 patch; a
  pool cell a 2×2 patch). Drawing them all would be noise, so they're
  revealed on **hover**: hovering any feature-map cell highlights its
  receptive field in the layer above (3×3 for a conv cell, 2×2 for a pool
  cell). A conv-**2** cell's receptive field is a 3×3 across *all 8*
  pool-1 channels at once, so its hover box lights up on every pool-1 map
  — the honest depth-8 window. This is the accurate way to show locality
  without clutter.

## The kernel scan (the teaching moment)

Click a conv-1 kernel → it arms "scan mode." Moving over the input grid
positions a **3×3 window**, and a panel shows the convolution *visually*:
the **3×3 image patch** (greyscale, the input) **×** the **3×3 kernel**
(sage/plum) → the **3×3 products** (vermillion adds, cerulean takes away)
→ one **output neuron**: the sum (signed, so vermillion or cerulean), then
the ReLU (greyscale, as the feature-map cell it becomes). This is the "how a 3×3 kernel operates on a grid" idea from
CNN-Explainer's *Understanding Hyperparameters*, tied to the digit the
student actually drew.

## The conv-2 kernel (3×3×8) — how it's shown honestly

Each conv-2 filter is really a **3×3×8 stack**: a separate 3×3 for each of
the 8 incoming pool-1 channels. To compute one conv-2 output, you sum the
element-wise products of each channel's 3×3 window with that channel's
3×3, over all 8 channels, then add a bias and ReLU. Three affordances keep
this honest without cluttering the row:

- the **row swatch** above each conv-2 map is the channel-mean 3×3 — a
  compact summary of the filter's spatial shape (a subtle *stack* drawn
  behind it signals "there are 8 slices here");
- **hovering** a conv-2 cell boxes its 3×3 receptive field on **all 8**
  pool-1 maps at once;
- **clicking** a conv-2 kernel opens a popup showing **all 8** of its 3×3
  slices (one per channel) with the summation formula; click anywhere to
  dismiss.

The click-to-scan *arithmetic* panel stays conv-1 only, where the "one
kernel, one image" story is clean.

## "What deeper layers learn" (the face-network panel)

`FaceHierarchy.tsx` is a panel below the footer, with the same chrome as the
activation example's panels (Card, h2, sub, note). Our network is too small for
its second layer to be interpretable, so the panel sets it **beside** a
well-known larger network that shows the edges → parts → faces hierarchy:

> H. Lee, R. Grosse, R. Ranganath, A. Y. Ng. "Convolutional Deep Belief
> Networks for Scalable Unsupervised Learning of Hierarchical
> Representations." *ICML 2009.* doi:10.1145/1553374.1553453

The figure follows the diagram's vocabulary so students can place the layers.
The layer names run down the left in the diagram's `.fig-label--lg` voice
(input, conv 1, pool 1, …, fully connected). Two columns share those rows:
**this network** (its real conv-1 kernels and conv-2 channel-mean swatches,
drawn exactly as above) and **a face network** (the paper's images). The
pooling rows are shaded bands, so it is clear that layers sit *between* the
pictures. Each conv row gives the kernel size and receptive field, which
answers "are the kernels still 3×3?" (no). The sizes come from the paper's
§4.4 footnote: conv 1 is 24 × 10×10 (learned on natural images) with a 3×3
pool; conv 2 is 40 × 10×10×24 with a 2×2 pool; conv 3 is 24 × 14×14×40 with a
2×2 pool. The receptive fields (10, ≈40, ≈120 px) follow from those numbers.
The figure is drawn 1:1 (760 wide, no `--fig-scale`).

- `public/examples/cnn-digit-recognizer/lee2009-layer1-edges.png`: Fig. 2
  (top), the whole 133×23 strip of first-layer bases.
- `…/lee2009-layer2-parts.png`: Fig. 3, the "faces" column, second-layer
  bases, the middle 3 of 5 rows (24 of 40).
- `…/lee2009-layer3-faces.png`: Fig. 3, the "faces" column, third-layer
  bases, the middle 2 of 4 rows (12 of 24).

These were pulled with `pdfimages` from the authors' PDF and cropped. They are
reproduced for teaching commentary with full attribution in the panel's note,
and they are a small part of the paper. This is a fair-use reliance, not a
licence. Anyone redistributing a deployment should make their own call. The
note says that the model is a convolutional DBN trained without labels, not a
supervised CNN like ours, and that the conv-2/3 tiles are projections into
pixel space rather than raw weights.

## "Pooling and stride" (interactive panel)

`PoolingStride.tsx` sits between the face panel and the ResNet panel. It is a
sibling of the kernel scan: a fixed 8×8 feature map (a diagonal stroke, with
values 0–9 so students can take the max by eye), a pooling window, and the map
it makes. The middle column reads top to bottom like the scan card: the
window's cells, then "keep the largest", then one output cell. Students choose
the window (2×2, 3×3) and the stride (1, 2, 3), then move over either map or
press Play. A one-line note names what the setting does (the windows tile,
overlap, or skip), and cells no window reaches are hatched. The panel's note
introduces a stride on a *convolution*, which is how the ResNet panel below
shrinks its maps. The maps are greyscale, following the feature-map exception;
the window, its largest cell and its output cell take the accent (the selected
state).

## "A modern network" (the ResNet-50 panel)

`ResNetStack.tsx` is a second panel below the face panel. It answers the
question the face network raises ("do big CNNs use big kernels?") with the
standard modern backbone, drawn top to bottom in the diagram's voice. The
layers run input, conv 1 (7×7, the only kernel larger than 3×3), pool 1, four
stages, pool 2 (a global average), and fully connected. Each stage draws **one**
bottleneck block in full: 1×1 → 3×3 → 1×1, with the skip connection
(`--purple-600`, structure, like the diagram's wiring) into a ⊕. Vertical
ellipses stand for the blocks left out ("N more blocks like this one"). Kernels
are sage/plum swatches with illustrative (fixed pseudo-random) weights, with
depth tiles behind them; the panel says the colours are illustrative. Sizes are from He et al., "Deep Residual Learning for Image
Recognition," CVPR 2016, Table 1. Nothing is reproduced from the paper except
those numbers.

## "Inside a block: the 1×1 kernel" (the deep-dive panel)

`OneByOne.tsx` sits under the ResNet panel and zooms into one block. The idea
it teaches is that a kernel always reaches through every map below it, so a
1×1 kernel is a *recipe* that mixes maps at each position. Two figures share
one layout (`MixFigure`), top to bottom: N maps, one sage/plum weight under
each map with lines converging on the new map, then the new map with the
arithmetic at the boxed position.

1. **Three maps.** A 10×10 synthetic colour photo (sky, grass, apple, flower)
   is split into red, green and blue maps. The recipes are greyscale
   (0.3, 0.6, 0.1, the standard luma weights rounded), red − green, and
   blue − yellow. The photo is drawn in colour because it *is* a colour photo;
   the maps are greyscale.
2. **More than three.** The eight conv-1 maps this page computes from the
   student's drawing (a canned 7 until they draw), with a 1×1×8 kernel whose
   weights the student clicks to cycle +1 / 0 / −1.

A short table then gives the bottleneck's weight counts: 69,632 for
1×1×256 ×64, 3×3×64 ×64 and 1×1×64 ×256, against 589,824 for one plain
3×3×256 ×256 layer. The ResNet panel above it explains why the maps double
at each stage (one map per kernel; the paper's constant-cost rule), draws the
maps as stacks that shrink and deepen, writes every kernel's depth, and ends
in neuron rows with ellipses for pool 2 and the fully connected layer.

## Architecture (code)

- `cnn-net.ts` — the model type + a hand-written conv/pool/dense forward
  pass returning *every* intermediate (kernels, all feature maps, pooled
  maps, dense activations) for the renderer. **The drawing is fed to the
  conv stack RAW** — not normalized/recentred like the MLP. A convolution
  is translation-equivariant, so the feature maps line up pixel-for-pixel
  with the input grid the student drew (normalizing here magnified a small
  dot into a big blob in conv1, breaking that alignment). No ML library,
  for the same reasons as the MLP example.
- `CNNNetworkView.tsx` — the SVG. Draws every layer + the kernel-scan
  interaction (3×3 window + arithmetic panel).
- `FaceHierarchy.tsx` — the face-network comparison figure + its citation.
- `PoolingStride.tsx` — the interactive pooling/stride panel.
- `ResNetStack.tsx` — the ResNet-50 top-to-bottom figure + its citation.
- `OneByOne.tsx` — the 1×1-kernel deep dive (colour mixing, then 8 maps).
- `CNNDigitRecognizerPage.tsx` — chrome, readout, and scan controls;
  reuses `../mnist-mlp/digit-recognizer.css`.
- `../shared/useGridDraw.ts` — the shared "draw on an SVG grid" hook,
  used by both examples.
- `cnn-weights.json` — the trained model (committed; also copied to
  `public/examples/cnn-digit-recognizer/`).
- `train/train.mjs` — the offline pure-Node trainer (forward + backprop
  through conv/pool/dense written out by hand; no deps).

## Regenerating the weights

Pure Node (≥18), no dependencies — it downloads MNIST and gunzips it:

```
node apps/web/src/examples/mnist-cnn/train/train.mjs
cp apps/web/src/examples/mnist-cnn/cnn-weights.json \
   apps/web/public/examples/cnn-digit-recognizer/cnn-weights.json
```

Deterministic (fixed PRNG seed). The dataset cache under
`train/.mnist-cache/` is gitignored.

**Known simplification (train/infer mismatch):** the trainer still applies
`normalize20()` to the MNIST digits, but inference feeds the raw drawing
(so the feature maps align with what the student drew). In practice this
is fine — MNIST digits are already reasonably centred at 20×20, so the
trained kernels work well on raw, reasonably-drawn input (verified in the
browser). If you ever want train and inference to match exactly, drop
`normalize20()` from `train.mjs`'s data path and bump `AUGMENT` (jitter
supplies the translation variety normalization used to remove), then
retrain.
