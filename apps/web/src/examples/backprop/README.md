# Example: Backpropagation

`/examples/backpropagation`. How a network finds which way to turn every
weight, shown by doing rather than told. It follows the concepts of a
scalar-by-scalar reference implementation (after Andrej Karpathy's
micrograd): every number is a value that remembers how it was made, the
chain rule multiplies local slopes, and gradients accumulate with `+=`.

## The panels

1. **Which way is up?** A traced drawing of Everest (`public/examples/
   backpropagation/everest.svg`). It opens at the fork with the ridge
   already climbed. The two ways on look alike; the altitude reveals which
   went up, and the way up carries on a step per click. Altitudes are
   illustrative.
2. **Two weights, one landscape.** A made-up error landscape over two
   weights, drawn in 3D (a shaded mesh, painter's algorithm, no library):
   one bottom, reached along a valley whose floor bends, with ripples on the
   walls that fade out along the floor. The point is that the steepest way
   down keeps changing, so the walk winds rather than running straight in;
   there are no false bottoms (in a space of millions of weights they may
   barely exist). Measured: every one of the 676 clickable starting cells
   ends at the same bottom, in at most 83 steps; from the default start the
   walk takes 77 steps and turns through about 390°. Ripples 1.5× larger
   start trapping walkers. Click to stand anywhere, drag sideways to turn;
   at each stop four test steps are drawn (green where the ground drops, red
   where it rises) and the step taken goes the steepest way down.
3. **One neuron, one fix.** The activation example's neuron, drawn with
   that example's own parts (`activation/draw.tsx`, `activation.css`) and
   its starting numbers, now with ReLU and a target. The weights are the
   only handles (inputs, bias and target stay put). Dragging is free, but
   every change costs its size squared, drawn as a square beside each weight
   (area = change²) and totalled. The reader's cheapest on-target fix is
   kept; "Set to backprop's fix" moves all three weights at once, each in
   proportion to its input, the cheapest exact fix: 0.20, against 0.31,
   0.69 and 2.78 for moving any one weight alone. Squared, not absolute,
   change is what makes the gradient the cheapest (with absolute change the
   cheapest fix would be to move only the biggest-input weight). Within
   0.05 of the target, the dragged weight snaps to the exact value that hits
   it, so the target is easy to land on and every recorded fix is exact (no
   near-miss can look cheaper than backprop's after rounding).
4. **The chain rule.** No numbers. One question, the derivative of the
   error with respect to one first-layer weight (x2 → B), with three closed
   layers between them drawn as a grey block. Clicking a layer opens it and
   the expression breaks apart there: opening hidden 1 or the output splits
   between layers (two derivatives side by side, multiplied); opening hidden
   2 splits within a layer (B reaches the output through E, F, G and H: one
   row per route, added). Every derivative is a block reading "derivative of
   A with respect to B" (never ∂ notation); a route's blocks take its colour
   on the figure and in the expression, shared ones stay ink outside the
   brackets. Routes through neurons that are off (F and G for seed 4's first
   example) are faded and tagged "off". Layers open and close in any order.
5. **Follow one path.** The chain rule. The weight joining hidden-1 neuron
   B to hidden-2 neuron E reaches the error by exactly one road (E, then the
   output), drawn dark on the network. Below, the road as five gauges with
   the link between each pair. "Nudge" adds 0.001 and every gauge shows its
   move, so each link is visibly the ratio of two moves; the product of the
   links (4.340) matches the error's measured move (4.342). The slider can
   switch E off, which zeroes a link and the product.
6. **Backwards through the network.** Click from the error back up; a neuron
   is ready (dashed ring) once everything it feeds is done. Each click shows
   its working with the numbers in: one line per neuron it feeds, weight ×
   slope × gradient, then the sum. Weights into a finished neuron switch to
   their gradient colour; hovering one shows its own working. Then one
   button steps every weight and the example's error falls (2.35 → 0.88).
7. **Repeat: training.** The reference code's four examples, 50 steps.

## The network

`[3, 4, 4, 1]`, ReLU hidden layers, a plain output (so a target of −1 is
reachable), weights drawn uniformly from −1..1 with seed 4. Seed 4 starts
wrong on the first example (−0.53 for a target of 1), has some neurons
switched off (so ×0 links appear), and trains cleanly. Many other seeds
switch most of their ReLUs off in the first few steps on these inputs.

The learning rate is 0.005, not the reference code's 0.05: that suits tanh,
but with ReLU and a plain output it overshoots (one step raises the first
example's error from 2.3 to 15.8). At 0.005 no step of training raises the
error.

## Files

- `content.ts` — every word, the data, the seed and the learning rate.
- `scalar.ts` — the scalar engine (`+`, `×`, ReLU, tanh, square), the network,
  one step, one training step.
- `net.ts` — the shared network: parameters, its first example, layout.
- `climb.ts` — the footsteps and fork, extracted unchanged from the original
  scrollytelling figure.
- `ClimbPanel`, `LandscapePanel`, `NeuronPanel`, `ChainRulePanel`, `ChainPanel`, `WalkPanel`,
  `TrainPanel`, `NetFigure` (the network drawing panels 4 and 5 share), `ui`.

## Colour

Weights are learned (sage / plum); activations, errors and gradients are
computed (vermillion / cerulean). The error landscape is the exception:
greyscale terrain, lighter with height (recorded in docs/style.md §11). The climb keeps the original figure's own colours (`--bp-up`
#71c6b1, `--bp-fork` #ecb842, `--bp-down` #d75a53, set on `.bp-page`), and
the landscape's test steps reuse them, so green means "better" in both.
Ready and selected neurons are ringed in ink, not the accent.
