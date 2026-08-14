# Example: digit recognizer — convolutional (CNN)

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
- **conv 1** — each of the 8 kernels drawn as a 3×3 red/blue weight
  swatch above its live feature map. Kernels are clickable.
- **pool 1 / conv 2 / pool 2** — the feature maps at each stage,
  shrinking. Conv-2 maps mix all 8 channels; we show the maps, not the
  8×3×3 stacks, to stay legible.
- **dense** — 24 rounded-rect neurons (same style as the MLP hidden
  layers).
- **output** — 11 tiles (0–9 + blank), winner filled with the accent.

Feature maps shade white→black by activation (per-map normalized for
contrast). Kernel weights use the same red = positive / blue = negative
vocabulary as the MLP example.

## Connections between layers

- **pool2 → dense** and **dense → output** are *fully connected*, so
  they're drawn as real red/blue lines (thresholded to the strongest few
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
the **3×3 image patch** (grayscale) **×** the **3×3 kernel** (red/blue)
→ the **3×3 products** (grayscale by magnitude) → one **output neuron**
(sum + ReLU). This is the "how a 3×3 kernel operates on a grid" idea from
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
