// Everything the Backpropagation example says — edit freely.
//
// Content only. Every number on the page is computed live (./scalar.ts), so
// the words should point at things to do and look at, and leave the figures
// to show what happens. Prose accepts `backticks`, *emphasis*, blank-line
// paragraphs, and "1." / "-" lists.
//
// The arc: climb a mountain by always taking the steepest step; the same
// idea on a model's error, in 3D; one neuron (the activation example's) and
// how its error answers a nudged weight; one path through a network, where
// the nudges multiply (the chain rule); then the whole network, walked
// backwards one neuron at a time; then training.

export const LEDE = `
A network learns by nudging every weight a little in whichever direction makes
its error smaller. Finding that direction for thousands of weights at once is
*backpropagation*.`;

// ── Panel 1: the climb ─────────────────────────────────────────────────
export const CLIMB_PANEL = {
  title: "Which way is up?",
  standfirst: `
You are climbing in fog and can only feel the ground under your feet. You have
made it this far. Which way at the fork?`,
  step: "Take a step",
  reset: "Start again",
  altitudeLabel: "Altitude",
  forkPrompt: "Which way at the fork?",
  note: `
The drawing is traced from a photograph of Everest. Altitudes are
illustrative.`,
};

/** Metres at the bottom and top of the drawing, for the altitude readout. */
export const ALTITUDE = { bottom: 5200, top: 8849 };

// ── Panel 2: the landscape ─────────────────────────────────────────────
export const LANDSCAPE_PANEL = {
  title: "Two weights, one landscape",
  standfirst: `
A model with two weights is a walker on a landscape: one weight moves you east
and west, the other north and south, and the height is the model's error. The
walker wants the lowest point. Click anywhere on the surface to stand there,
then step. Drag sideways to turn the view.`,
  step: "Take the steepest step down",
  run: "Walk to the bottom",
  reset: "Reset",
  w1: "weight 1",
  w2: "weight 2",
  height: "error",
  errorLabel: "Error here",
  stepsLabel: "Steps taken",
  note: `
The landscape is made up for the picture. A network with a million weights
walks the same way, on a landscape with a million directions to step in.`,
};

// ── Panel 3: one neuron ────────────────────────────────────────────────
export const NEURON_PANEL = {
  title: "One neuron, one fix",
  standfirst: `
The neuron from the activation example, now with a target. The weights are the
only thing you can change: drag them until the output hits the target. Every
change costs its size squared. Find the cheapest fix.`,
  targetLabel: "target",
  errorLabel: "error",
  costLabel: "Total change",
  yourFix: "Your cheapest fix",
  backpropFix: "Backprop's fix",
  onTarget: "on target",
  setBackprop: "Set to backprop's fix",
  reset: "Reset weights",
  note: `
Each square's area is how far that weight has moved, squared, so one big change
costs more than several small ones.`,
};

// ── Panel 4: the chain rule ────────────────────────────────────────────
export const CHAIN_RULE_PANEL = {
  title: "The chain rule",
  standfirst: `
How much does the error change when this one weight changes? That is one
derivative, but the weight is far from the error. Click a layer to break the
question apart there.`,
  reset: "Close all layers",
  start: "Click a layer to open it.",
  between: "Between layers, the derivatives multiply.",
  within: "Within a layer, the routes add.",
  derivativeOf: "derivative of",
  withRespectTo: "with respect to",
  off: "off",
  note: `
Each block is one derivative, and its colour matches the part of the network
it covers. A route through a neuron that is off adds nothing.`,
};

// ── Panel 4: one path (the chain rule) ─────────────────────────────────
export const CHAIN_PANEL = {
  title: "Follow one path",
  standfirst: `
Inside a network, a weight only reaches the error through other neurons. Drag
the highlighted weight and watch the nudge travel along the path.`,
  reset: "Reset",
  measuredLabel: "The error moved",
  productLabel: "Multiply the links",
  note: `
Each link scales the nudge it passes on. Multiply the links and you get how far
the error moves, without moving anything. That is the *chain rule*.`,
};

// ── Panel 5: the whole network ─────────────────────────────────────────
export const WALK_PANEL = {
  title: "Backwards through the network",
  standfirst: `
Now every weight at once. Start at the error and click your way back up: a
neuron is ready once everything it feeds is done.`,
  reset: "Start again",
  update: "Step every weight downhill",
  workLabel: "The working",
  startHint: "Click the error to begin.",
  doneHint: "Every weight has its direction.",
  note: `
A neuron that feeds several others hears back along every path, and adds them
up. Working backwards means each neuron is computed once and reused by every
neuron before it, instead of re-walking every path.`,
};

// ── Panel 6: training ──────────────────────────────────────────────────
export const TRAIN_PANEL = {
  title: "Repeat: training",
  standfirst: `
Training is that walk on repeat, over every example. Four examples, each with a
target of 1 or −1.`,
  stepOne: "Step",
  runAll: "Run 50 steps",
  reset: "Reset",
  stepLabel: "Step",
  lossLabel: "Total error",
  predLabel: "Predictions",
  note: `
Each step: run all four examples forward, add up their errors, walk backwards
to find every weight's direction, and step.`,
};

/** The four training examples and their targets, as in the reference code. */
export const DATA: number[][] = [
  [2, 3, -5],
  [3, -5, 0.5],
  [0.5, 1, 1],
  [1, 1, -5],
];
export const TARGETS = [1, -1, -1, 1];
export const SIZES = [3, 4, 4, 1];
/** Chosen because it starts wrong, has some neurons off, and trains cleanly. */
export const SEED = 4;
/** Smaller than the reference code's 0.05, which suits tanh (it flattens out).
 *  With ReLU and a plain output, 0.05 overshoots on these inputs: one step
 *  raises the first example's error from 2.3 to 15.8. At 0.005 every step of
 *  training lowers the error. */
export const LEARNING_RATE = 0.005;
export const STEPS = 50;
