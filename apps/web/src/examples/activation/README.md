# Example: Activation Functions

A standalone, static, interactive page on what an activation function does
and why a network needs one. Mounted at `/examples/activation-function`. No
backend, no weights file: every number is computed in the browser by
`act.ts`.

It follows the [deep neural network](../mnist-mlp/README.md) example's
shape — a controls column on the left, one live figure on the right — in
three panels, with one sticky bar choosing the activation (none, ReLU,
sigmoid, tanh) for the first two, and a right-aligned **Neuroscience**
switch that changes both of them. The bar is sticky only within those two panels
and scrolls away before the third, which compares activations itself.

## What it shows

1. **One neuron.** Three inputs (greyscale tiles), three weights (sage /
   plum connections, each labelled), a bias, the sum written out beside the
   Σ, then the activation drawn as a curve with the sum marked on it, and
   the output. Every number is a slider. The Neuroscience switch swaps the
   gutter captions for the biology — other cells' firing, synapses that
   excite or inhibit, a cell body that adds, a firing rate — and adds one
   short reading of the curve (a floor at zero; a ceiling at a maximum
   rate). The drawing itself does not change.
2. **Add neurons.** A curve with a hump in it, fitted by a network with one
   input, n hidden neurons and one output. By default it is how much someone
   enjoys a cup of coffee against its temperature (too cold, just right near
   66 °C, too hot), which needs no background; with the Neuroscience switch
   on it is an idealised orientation tuning curve (a visual-cortex neuron
   firing most for a bar at 60°). Both peak off-centre so the best straight
   line visibly tilts. Each fit is the best that n neurons and
   that activation can do, found by gradient descent in the browser from a
   deterministic start, so it is the same for every viewer. Each hidden
   neuron's own response is drawn under it. With no activation the side
   column collapses the whole network into one slope and intercept computed
   from its weights, the average miss does not move as neurons are added,
   and the page asks "what is the dumbest non-linear function you can think
   of?" with a button that switches to ReLU.
3. **Why ReLU won.** A sigmoid chain and a ReLU chain of single neurons,
   weight 1 and no bias throughout. Move the input: the sigmoid chain's
   values all drift to 0.66, and the bar beside each neuron — how much it
   moves when the input moves, the product of the slopes above it — shrinks
   at least fourfold a layer. The ReLU chain passes the change on whole.

## Colour

Per `docs/style.md` §11: inputs greyscale, weights sage/plum, sums and
outputs vermillion/cerulean, a network's output curve vermillion, the
tuning-curve dots ink (data as it arrived). The activation function's own
curve is drawn in ink: it is a shape, not a datum. The accent is UI only.

## Files

- `act.ts` — the activation functions and slopes, the tuning curve, the
  one-input network with its fit (least squares for the output layer, then
  Adam on everything) and collapse, and the deep chain.
- `NeuronPanel.tsx`, `GrowPanel.tsx`, `DepthPanel.tsx` — the three panels.
- `draw.tsx` — shared SVG pieces: the activation glyph, the neuron, the
  oriented-bar stimulus, a weight pill.
- `ActivationPage.tsx` — the page, the sticky activation bar.
- `activation.css` — layout and figure styling; page chrome comes from the
  digit recognizer's stylesheet.
