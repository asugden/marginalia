// The model taxonomy behind the complexity line.
//
// One ordered axis, from the simplest model anyone fits to the largest one
// anyone runs. Everything on it — cost, parameter count, training rows needed,
// feature count, and the loss of interpretability — moves together, which is
// the single claim the line is built to make.
//
// The numbers here are deliberately ROUGH: order-of-magnitude bands for someone
// deciding what to reach for first, not fitted values.

export interface ModelEntry {
  name: string;
  /** Gallery example this model links to, if one exists. */
  slug?: string;
}

export interface Family {
  id: string;
  label: string;
  /** Position along the axis, 0 (left dot) .. 1 (arrowhead). */
  pos: number;
  models: ModelEntry[];
  /** Gallery example the family label itself links to, if any. */
  slug?: string;
  /**
   * Which way the label column GROWS from its tick. The families are unevenly
   * spaced — the first two sit close together, then the axis opens up — so this
   * is declared per family rather than derived from position: each column grows
   * into whichever side has room beside it, and no two grow into each other.
   */
  lean: "left" | "right";
  /**
   * Which side of the axis the names hang on. Below by default; a family whose
   * tick crowds its neighbours' puts its names ABOVE the line, where the left
   * half of the figure is empty.
   */
  side?: "above";
}

/**
 * The divide. Left of this position you can point at the number that produced
 * an answer; right of it you can measure the behaviour but not narrate it.
 */
export const OPEN_BOX_EDGE = 0.4;

export const FAMILIES: Family[] = [
  {
    id: "regression",
    label: "Regression",
    pos: 0.05,
    // Nothing to its left but the dot; grows right toward the open axis.
    lean: "right",
    models: [{ name: "linear regression" }, { name: "logistic regression" }],
  },
  {
    id: "svm",
    label: "SVM",
    // The open-box models bunch up near regression and the axis then opens
    // out: the step from them to trees is far bigger than the steps between
    // them. Too close to share the space under the line, so SVM's names hang
    // above it.
    pos: 0.12,
    lean: "right",
    side: "above",
    slug: "svm",
    models: [{ name: "support vector machine" }],
  },
  {
    id: "naive-bayes",
    label: "Naive Bayes",
    pos: 0.19,
    // Below the line, starting just clear of Regression's longest name.
    lean: "right",
    slug: "naive-bayes",
    models: [],
  },
  {
    id: "trees",
    label: "Decision tree models",
    pos: 0.58,
    // Long gap on its right before Neural networks.
    lean: "right",
    // The family label is the door to the decision-tree lesson.
    slug: "decision-tree",
    models: [
      { name: "random forest", slug: "random-forest" },
      { name: "XGBoost", slug: "gradient-boosting" },
    ],
  },
  {
    id: "neural",
    label: "Neural networks",
    pos: 0.93,
    // Last family: grows left, back along the axis, so it clears the arrowhead.
    lean: "left",
    models: [
      { name: "fully connected", slug: "deep-neural-network" },
      { name: "CNNs", slug: "cnn-digit-recognizer" },
      { name: "RNNs / LSTMs", slug: "rnn" },
      { name: "transformers / LLMs", slug: "attention" },
    ],
  },
];

/** What increases as you move right. Stacked over the arrowhead; the loss of
 *  interpretability is drawn as its own bar, so it is not repeated here. */
export const AXIS_QUANTITIES = [
  "complexity",
  "cost",
  "rows of training data",
  "parameters",
  "features",
];

/**
 * Rough training-row floors per family. What an instructor says out loud: an
 * open-box model can be fitted on about a hundred rows, a tree ensemble wants
 * five hundred to a thousand before it is worth the trouble, and a neural
 * network needs an order of magnitude more again.
 */
export const ROW_FLOOR: Record<string, number> = {
  regression: 100,
  svm: 100,
  "naive-bayes": 100,
  trees: 500,
  neural: 10000,
};

/**
 * When plenty of rows makes the NEXT family worth it. Data is the other thing,
 * besides more features, that pays for a more complex model: a tree ensemble
 * beats a regression on a few columns once there are thousands of rows to learn
 * the interactions from. A network is a harder sell — on a handful of columns
 * XGBoost wins however much data there is — so it also wants a real number of
 * features before rows can tip it over. Rows only ever move the pick ONE family
 * right of where the feature count put it, and never left.
 */
export const ROW_PLENTY: Record<string, { rows: number; minFeatures: number }> = {
  trees: { rows: 10000, minFeatures: 1 },
  neural: { rows: 1000000, minFeatures: 20 },
};

export interface Band {
  familyId: string;
  /** Upper bound of the feature band; Infinity for the last. */
  maxFeatures: number;
  verdict: string;
  /** Said instead when plenty of rows, not the feature count, put you here. */
  verdictFromRows?: string;
}

/**
 * Feature count picks the family. The boundaries are deliberately blunt:
 *
 *   1–4    few enough to reason about by hand — open box
 *   5–100  more columns than a person can hold at once — XGBoost
 *   100+   reframe the problem, or go neural
 *
 * Five features and eight hundred rows is an XGBoost problem, and seventeen
 * features is basically never anything less. These are the numbers a designer
 * should leave with, not a practitioner's decision surface.
 */
export const BANDS: Band[] = [
  {
    familyId: "regression",
    maxFeatures: 4,
    verdict: "Few enough to read by hand. An open-box model will do, and you will be able to explain it.",
  },
  {
    familyId: "trees",
    maxFeatures: 100,
    verdict: "XGBoost. More columns than you can hold in your head, but nowhere near enough to need a network.",
    verdictFromRows: "XGBoost. Few enough columns to read by hand, but with this much data a tree ensemble will find interactions a regression cannot.",
  },
  {
    familyId: "neural",
    maxFeatures: Infinity,
    verdict: "Reframe the problem to need fewer features, or reach for a neural network — and bring a lot more data.",
    verdictFromRows: "A neural network starts to earn its keep. With this many rows it can learn what an ensemble would need hand-built features for.",
  },
];

export function classify(features: number, rows: number) {
  // Feature count picks the starting band. The last band is unbounded, so the
  // search always succeeds; the fallback only satisfies the compiler.
  let i = BANDS.findIndex((b) => features <= b.maxFeatures);
  if (i < 0) i = BANDS.length - 1;
  // Plenty of rows buys one step further right.
  const next = BANDS[i + 1];
  const plenty = next ? ROW_PLENTY[next.familyId] : undefined;
  const bumped = plenty !== undefined && rows >= plenty.rows && features >= plenty.minFeatures;
  const band = (bumped && next) || (BANDS[i] as Band);
  const family = FAMILIES.find((f) => f.id === band.familyId) ?? (FAMILIES[0] as Family);
  const neededRows = ROW_FLOOR[family.id] ?? 100;
  return { band, family, bumped, neededRows, starved: rows < neededRows };
}
