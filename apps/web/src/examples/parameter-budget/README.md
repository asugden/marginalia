# Example: Counting Parameters

Mounted at `/examples/parameter-budget`. What a parameter is, how many a model
has, and where they go, for a reader who may never have heard the word.
Nothing here is quoted that can be computed.

## The confusion it targets

"A 405-billion-parameter model" is the unit everyone repeats and almost nobody
derives. It is a **shape fact**: once a reader can count the three parameters
of a linear regression, the same rule counts a neural network and a language
model.

## What it shows

1. **Models you can count by hand.** Linear regression, logistic regression, a
   linear support vector machine and naive Bayes on house sales, every
   parameter a square. A features slider adds squares.
2. **Trees, somewhere in between.** XGBoost's count, from trees and depth:
   each question a feature and a cut-off, each leaf an answer. The first ten trees are drawn,
   and a log strip puts them between the linear regression above and the
   network below. The count ignores the number of features; depth and tree count are chosen, not learned.
3. **A neural network is many logistic regressions.** A switch between two
   networks:
   - **Fully connected.** Top to bottom, as in the deep neural network
     example. Down the left, one bar per layer (the accent: it is a control),
     dragged sideways. In the middle, the layers as rows of shared neurons,
     more of them for a wider layer (roughly the square root). Beside each gap,
     its weights as a grid: a column per neuron above, a row per neuron below,
     every grid at one scale. The digit recognizer's grids are its real
     trained weights, one pixel each; other shapes are drawn as a flat count.
   - **Convolutional.** The same layout: names down the left, the layers in
     the middle (maps as tiles, a stack past eight), each gap's grid beside
     it, where every cell is a whole kernel. Two models: the convolutional
     network example's digit recognizer with its real kernels (2,691; the
     note compares 72 kernel weights with the 1,036,800 a fully connected
     layer would need), and ResNet-50 at one scale (25,557,032), linked to its
     drawing in that example (`#resnet`).
4. **Make it bigger!** Moved from the language models example: the grid of a
   real model's blocks and heads, and the table of published shapes whose
   rows pick the model.
5. **Where the parameters go.** The picked model split into word table,
   attention and fully connected layers on one scale, with sizes at 16-bit.
   For a mixture of experts, the part of the fully connected layers a word
   uses is filled and the idle experts are outlined. Not pinned: it follows
   the table's choice but is the only other panel that does.
6. **Smaller by rounding.** The digit recognizer's real weights rounded per
   neuron and scored live on 240 MNIST digits: 231, 231, 230, 227, 218, then
   69 at 2 bits.
7. **Smaller by copying.** The answer key against the teacher's odds, and
   the teacher's replies alone, asked once to 1,000 times: the tally drifts
   toward the odds, which is how a model can be copied through its replies.
8. **How your models compare.** A log ladder from three parameters to
   trillions.

## Colour

| Mark | Kind |
|---|---|
| the smallest models' squares; both digit recognizers' grids and wires | learned (sage / plum) |
| naive Bayes squares | its class's hue (the Category rule) |
| layer width bars | the accent: a control the reader drags |
| untrained grids, ResNet grids, split bars, ladder bars | a count with no values: greyscale's no-sign case, one strength |
| a tree question's feature and cut-off | the count grey (a pick) and flat sage (a position); leaves take sage or plum |
| accuracy bars, the teacher's bars and the tally | computed, the positive arm (vermillion) |
| the answer key's bar, the digit thumbnails | input (ink) |

The count grey follows the language models example's heads, which are drawn
in neutral ink as structure.

## Sources

- ResNet-50: He et al. 2016, Table 1, counted exactly (25,557,032).
- The convolutional digit recognizer: `/examples/cnn-digit-recognizer/cnn-weights.json`.
- Language models: open-weight splits are summed from the tensor shapes in
  each model's safetensors headers on Hugging Face (names sorted into word
  table, attention, fully connected and other; packed 4-bit tensors counted
  two per byte; quantization scales left out). Totals land on the published
  counts and the per-word counts within a few percent. GPT-2 XL, GPT-3 and
  Llama 3.1 405B are from their published shapes. See `models.ts`.

## Honesty notes

- Rounding is per neuron; 16-bit is left unrounded.
- The digits are 14 × 14, stretched to the recognizer's 20 × 20.
- Copying shows the training signal, not a trained student: a live student
  on 120 digits was too noisy to show a reliable gap.

## Files

- `budget.ts` — the counting (including ResNet-50), byte maths, ladder.
- `models.ts` — language models' shapes, sources and splits.
- `network.tsx` — the fully connected and convolutional network figures.
- `StackGrid.tsx`, `bigger.tsx`, `bigger.css` — "Make it bigger!" and the split.
- `quantize.ts` — rounding the digit recognizer and scoring it.
- `figures.tsx` — the smallest models, neurons' pictures, digits and bars.
- `ParameterBudgetPage.tsx` — the page.

Loads `/examples/deep-neural-network/weights.json` and
`/examples/training/digits.json`, both already shipped by other examples.
