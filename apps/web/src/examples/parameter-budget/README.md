# Example: Counting Parameters

A parameter budget explorer. Mounted at `/examples/parameter-budget`. Drag
layer widths and watch the arithmetic; nothing here is quoted that can be
computed.

## The confusion it targets

"A 405-billion-parameter model" is the unit everyone repeats and almost nobody
derives. Students hear it as a mystery quantity attached to a press release
rather than what it is: a **shape fact**, readable off an architecture diagram
in about ten seconds.

The rule is one line. Between two layers, every neuron connects to every
neuron, so the weights are a rectangle — `from × to` — plus one bias per
destination neuron. That's it. Once a student has that, every architecture
diagram becomes a budget they can audit.

## What it shows

1. **Your architecture.** Draggable layer widths with a live total. Input and
   output layers are drawn in grey (fixed by the task); hidden layers in the
   accent (the actual design choice). Presets map onto models the student has
   already met: the digit recognizer, the training autoencoder, plus a
   deliberately contrasting "wide and shallow" versus "narrow and deep".

2. **Where the numbers go.** One row per gap, with the multiplication spelled
   out and a share bar. For the digit recognizer, `400 × 25 = 10,000` fills
   the bar while `25 × 25 = 625` and `25 × 11 = 275` are slivers, and the 61
   biases are visibly a rounding error against 10,900 weights.

   The lesson the bars deliver: **a middle layer pays twice**, once on each
   side, so widening it is quadratic where widening an end layer is linear.
   That is why "wide and shallow" costs far more than "narrow and deep"
   despite doing less work.

3. **Parameters are physical.** Count × bytes-per-parameter = memory before
   the model runs. float32 / float16 / int8 / int4 side by side, which is why
   quantization is a commercial concern and not an academic one — and why the
   embedding tables elsewhere in the gallery are int8.

4. **How your model compares.** A log-scale ladder from the gallery's own
   models to a frontier one, with "your architecture" highlighted in place and
   updating live. The gap is about eight orders of magnitude, and the closing
   note makes the point that matters: the *mechanism* is identical. Every one
   of those 405 billion numbers is doing what the 6,484 in the
   [training example](../training/README.md) do.

## Honesty notes

Counts for the gallery's own models are **computed from their real
architectures**, not typed in — the digit recognizer is 400→25→25→11 = 10,961,
the autoencoder is 196→16→196 = 6,484, and the embedding table is 2,112 × 32 =
67,584. Each matches the corresponding page exactly. Published-model counts are
as reported by their authors.

The page models fully-connected layers only, and its footer says so.
Convolutional layers count differently (one small kernel shared across the
whole image, which is exactly why they are cheaper) and attention layers
differently again. The *principle* — parameters are a shape fact you can derive
— transfers; the specific formula does not.

## Architecture

- `budget.ts` — the counting (`countDense`), byte math, formatters, and the
  reference points for the ladder.
- `ParameterBudgetPage.tsx` — the page, the draggable architecture figure, the
  arithmetic table, the precision picker, and the ladder.

No data files and no trained weights: every number is arithmetic on the layer
widths currently on screen.
