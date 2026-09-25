# Example: Training

The only example in the gallery that ships **no weights**. It ships 240 digits
and a random number generator, and trains a real autoencoder in the browser
while the student watches. Mounted at `/examples/training`.

Nothing here is a replay of a run recorded offline. Press step and the
arithmetic happens: 6,484 parameters that started as noise get nudged toward
numbers that reproduce a handwritten digit.

## Why an autoencoder rather than a classifier

A classifier's error is a *number* — "you said 7, it was 3". An autoencoder's
error is a **picture**: the difference between what went in and what came out,
pixel by pixel, red where the model put too much ink and blue where too
little. That makes "how wrong is this, and in which direction" something a
student can see rather than take on faith, which is the hard part of teaching
training.

It also sets up the bottleneck argument twice: squeeze 196 numbers through 16
and the middle is forced to learn structure, exactly as in the
[word embeddings](../word2vec/README.md) example.

## The arc

1. **Random initialization.** At step 0 the input is a clean digit and the
   output is a noisy smudge, the average digit plus the random weights' noise. "Re-roll the
   dice" draws a fresh seed. Run two different seeds to convergence and they
   land in similar places — which is the useful thing to know about
   initialization, and is shown rather than asserted.

2. **How wrong, and which way.** Input → output → error, side by side. The
   error panel is the signal every weight's update is derived from.

3. **One number, going down.** The loss curve, log-scaled because the
   interesting progress spans orders of magnitude. A step-size slider is
   exposed with live commentary: measured, lr 1 falls steadily to ~0.018 in
   300 steps while lr 15 stalls around 0.05, so "too big a step overshoots" is
   something the student can produce on demand rather than be told.

4. **What the numbers became.** Each hidden neuron's 196 incoming weights drawn
   as an image. Static at step 0; strokes, curves and blobs after training.
   Nobody labelled a stroke — the task did it.

## On backpropagation

The gradients are exact — this is real backprop for a two-layer sigmoid
autoencoder under squared error, not an approximation.

But the page never says "chain rule". It says: each weight gets a number
telling it which way to move and how much, and we move it that way. That is
what a gradient *is*, and it is the honest half of the story that fits in one
example. The footer says plainly that where those numbers come from is the
next course.

## Measured behaviour

Each output pixel's bias starts at that pixel's average brightness (the
weights are random). Starting every output at 0.5 grey instead spends the
first three steps learning only that most pixels are blank: three quarters of
the error, none of the digit, and a curve that looks finished at step 3.

Error on a fixed 64 digits, hidden=16, seed 1234:

| step size | start | 30 steps | 100 steps | 300 steps |
|----------:|------:|---------:|----------:|----------:|
| 1         | 0.053 | 0.043    | 0.027     | **0.018** |
| 4         | 0.053 | 0.042    | 0.022     | 0.022     |
| 12        | 0.053 | 0.054    | 0.041     | 0.041     |
| 20        | 0.053 | 0.062    | 0.058     | 0.065     |

300 steps run in ~145 ms. "Run" defaults to ten steps a second, so the
reconstruction visibly sharpens and the curve bends while the student
watches; the **Fast** switch runs four steps a frame, for converging a demo
in a couple of seconds. Defaults are hidden=16, lr=1, batch=16.

## Colour

| Mark | Kind |
|---|---|
| the digit, and the reconstruction | input: paper to ink (the reconstruction is a recorded exception, style.md §11) |
| the error image | computed, signed: vermillion too much ink, cerulean too little |
| each neuron's incoming weights | learned, signed: sage and plum, against the neuron's largest weight |
| the loss curve, and the error readout | computed, non-negative: vermillion |

## Architecture

- `autoencoder.ts` — the model, a seeded PRNG, exact gradients, and
  `featureImage` for the learned-weights panel. No ML library: the whole thing
  is ~150 lines, and a framework would hide precisely the intermediates the
  page needs to draw.
- `DigitGrid.tsx` — a digit as a grid of cells, in the figure scale for what
  it holds (`input`, `value` for the error, `learned` for weights).
- `TrainingPage.tsx` — the page, the training loop (rAF-driven, several steps
  per frame), and the loss curve.
- `digits.json` — 240 images at 14×14, uint8, ~22 KB gzipped. Also copied to
  `public/examples/training/`.
- `train/build-digits.mjs` — the offline builder.

## Regenerating the digits

Needs the MNIST cache the digit-recognizer trainer downloads:

```
node apps/web/src/examples/mnist-mlp/train/train.mjs   # if the cache is cold
node apps/web/src/examples/training/train/build-digits.mjs
cp apps/web/src/examples/training/digits.json \
   apps/web/public/examples/training/digits.json
```

Deterministic: images are taken in file order with no sampling. They are
interleaved by class, so any prefix of the set stays balanced — the page can
train on a subset without quietly showing the model only zeros.
