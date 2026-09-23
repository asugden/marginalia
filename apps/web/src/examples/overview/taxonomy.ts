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
}

/**
 * The divide. Left of this position you can point at the number that produced
 * an answer; right of it you can measure the behaviour but not narrate it.
 */
export const OPEN_BOX_EDGE = 0.34;

export const FAMILIES: Family[] = [
  {
    id: "regression",
    label: "Regression",
    pos: 0.06,
    // Nothing to its left but the dot; grows right toward the open axis.
    lean: "right",
    models: [{ name: "linear regression" }, { name: "logistic regression" }],
  },
  {
    id: "margin",
    label: "SVM · Naive Bayes",
    pos: 0.24,
    // The long gap to Decision tree models is on its right, so it grows there
    // and leaves Regression's column room to its left.
    lean: "right",
    models: [
      { name: "support vector machine", slug: "svm" },
      { name: "naive Bayes", slug: "naive-bayes" },
    ],
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

/** What increases as you move right. Sits above the arrowhead. */
export const AXIS_QUANTITIES = [
  "complexity (decreasing interpretability)",
  "cost",
  "#rows of training data",
  "parameters",
  "#features",
];

/**
 * Rough training-row floors per family. What an instructor says out loud: an
 * open-box model can be fitted on about a hundred rows, a tree ensemble wants
 * five hundred to a thousand before it is worth the trouble, and a neural
 * network needs an order of magnitude more again.
 */
export const ROW_FLOOR: Record<string, number> = {
  regression: 100,
  margin: 100,
  trees: 500,
  neural: 10000,
};

export interface Band {
  familyId: string;
  /** Upper bound of the feature band; Infinity for the last. */
  maxFeatures: number;
  verdict: string;
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
  },
  {
    familyId: "neural",
    maxFeatures: Infinity,
    verdict: "Reframe the problem to need fewer features, or reach for a neural network — and bring a lot more data.",
  },
];

export function classify(features: number, rows: number) {
  // The last band is unbounded, so find() always succeeds; the fallback only
  // satisfies an index the compiler cannot prove.
  const band =
    BANDS.find((b) => features <= b.maxFeatures) ?? (BANDS[BANDS.length - 1] as Band);
  const family = FAMILIES.find((f) => f.id === band.familyId) ?? (FAMILIES[0] as Family);
  const neededRows = ROW_FLOOR[family.id] ?? 100;
  return { band, family, neededRows, starved: rows < neededRows };
}
