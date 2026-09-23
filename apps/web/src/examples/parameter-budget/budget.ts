// Parameter arithmetic.
//
// The point of this example is that "how many parameters does this model have"
// is not a mystery number quoted in a press release — it is a shape fact you
// can derive from the picture in about ten seconds. Every count here is
// computed from a model's shape, never looked up, except the published models
// on the ladder, which are as their authors reported them.

// ── The smallest models ─────────────────────────────────────────────────

/** Linear regression: one weight per feature, plus one starting value. */
export function countLinear(features: number): number {
  return features + 1;
}

/** Logistic regression: the same line as linear regression, squeezed into a
 *  probability. Squeezing adds nothing to learn, so the count is the same. */
export function countLogistic(features: number): number {
  return features + 1;
}

/** A linear support vector machine, as in the SVM example: one weight per
 *  feature and a bias, the same count as logistic regression. It fits them
 *  differently (the widest street), not with more numbers. */
export function countSvm(features: number): number {
  return features + 1;
}

/** Gaussian naive Bayes: for each class, how common it is, and a centre and
 *  a spread for every feature. The naive Bayes example fits exactly these. */
export function countNaiveBayes(features: number, classes: number): number {
  return classes + 2 * features * classes;
}

// ── Boosted trees ───────────────────────────────────────────────────────

/** One full tree of a given depth, as XGBoost grows it and saves it. Every
 *  question learns two things, which feature to ask about and the cut-off
 *  on it, and every leaf learns an answer. The depth and the number of trees
 *  are chosen by a person, so they are not parameters. */
export function countTree(depth: number): { questions: number; leaves: number; total: number } {
  const leaves = 2 ** depth;
  const questions = leaves - 1;
  return { questions, leaves, total: 2 * questions + leaves };
}

/** Boosted trees: the count grows with the trees and their depth, and the
 *  number of features never enters it. */
export function countBoosted(trees: number, depth: number): number {
  return trees * countTree(depth).total;
}

// ── Fully connected networks ────────────────────────────────────────────

export interface LayerCount {
  from: number;
  to: number;
  /** from * to */
  weights: number;
  /** one per destination neuron */
  biases: number;
  total: number;
}

export interface ArchCount {
  widths: number[];
  layers: LayerCount[];
  weights: number;
  biases: number;
  total: number;
}

/** Count the parameters of a stack of fully connected layers.
 *
 *  Between two layers every neuron connects to every neuron, so the weights
 *  are a rectangle: from x to. Each destination neuron also gets one bias.
 *  That is the entire rule, and it is why widening a middle layer costs so
 *  much more than widening an end one — a middle layer pays twice, once on
 *  each side. Each destination neuron is, on its own, a logistic regression
 *  over the layer before it: one weight per input, plus one. */
export function countDense(widths: number[]): ArchCount {
  const layers: LayerCount[] = [];
  let weights = 0;
  let biases = 0;
  for (let i = 0; i + 1 < widths.length; i++) {
    const from = widths[i]!;
    const to = widths[i + 1]!;
    const w = from * to;
    const b = to;
    layers.push({ from, to, weights: w, biases: b, total: w + b });
    weights += w;
    biases += b;
  }
  return { widths, layers, weights, biases, total: weights + biases };
}

// ── Convolutional networks ──────────────────────────────────────────────

/** One convolution: `from` maps in, `to` maps out, a k × k kernel for every
 *  pair. Its weights are a from × to matrix whose every cell is a k × k
 *  kernel, and the size of the image never enters: the same kernels slide
 *  over every position. */
export interface Conv {
  from: number;
  to: number;
  k: number;
}

/** A convolutional network as the figure draws it: layers, and between
 *  each pair the weights (one block's convolutions, repeated `times`). */
export interface ConvShape {
  layers: Array<{ name: string; sub: string; maps?: { n: number; size: number }; neurons?: number }>;
  gaps: Array<{ convs: Conv[]; times: number; total: number; note: string }>;
}

/** The convolutional network example's digit recognizer: two layers of
 *  3 × 3 kernels, then two fully connected layers. 2,691 in all. */
export const DIGIT_CNN: ConvShape = {
  layers: [
    { name: "input", sub: "a 20 × 20 drawing", maps: { n: 1, size: 20 } },
    { name: "conv 1", sub: "8 maps, 18 × 18", maps: { n: 8, size: 18 } },
    { name: "conv 2", sub: "8 maps, 7 × 7", maps: { n: 8, size: 7 } },
    { name: "fully connected", sub: "24 neurons", neurons: 24 },
    { name: "output", sub: "11 answers", neurons: 11 },
  ],
  gaps: [
    { convs: [{ from: 1, to: 8, k: 3 }], times: 1, total: 72 + 8,
      note: "1 map across, 8 down, each cell a 3 × 3 kernel · + 8 biases" },
    { convs: [{ from: 8, to: 8, k: 3 }], times: 1, total: 576 + 8,
      note: "8 maps across, 8 down, each cell a 3 × 3 kernel · + 8 biases" },
    { convs: [{ from: 72, to: 24, k: 1 }], times: 1, total: 1728 + 24,
      note: "72 across (8 pooled maps of 3 × 3), 24 down · + 24 biases" },
    { convs: [{ from: 24, to: 11, k: 1 }], times: 1, total: 264 + 11,
      note: "24 across, 11 down · + 11 biases" },
  ],
};

export const DIGIT_CNN_TOTAL = DIGIT_CNN.gaps.reduce((a, g) => a + g.total, 0);

/** ResNet-50, from He et al. 2016, Table 1, counted exactly: 25,557,032,
 *  the published figure. Each convolution is followed by a normalisation
 *  layer with two numbers per map; the first block of each stage adds a
 *  1 × 1 shortcut from its input width to its output width. A stage's grids
 *  are one typical block's three convolutions. */
export const RESNET50: ConvShape = (() => {
  const layers: ConvShape["layers"] = [
    { name: "input", sub: "a 224 × 224 photo", maps: { n: 3, size: 224 } },
    { name: "first layer", sub: "64 maps, 112 × 112", maps: { n: 64, size: 112 } },
  ];
  const gaps: ConvShape["gaps"] = [
    { convs: [{ from: 3, to: 64, k: 7 }], times: 1, total: 7 * 7 * 3 * 64 + 2 * 64,
      note: "3 maps across, 64 down, each cell a 7 × 7 kernel" },
  ];
  const stages = [
    { mid: 64, out: 256, n: 3, size: 56 },
    { mid: 128, out: 512, n: 4, size: 28 },
    { mid: 256, out: 1024, n: 6, size: 14 },
    { mid: 512, out: 2048, n: 3, size: 7 },
  ];
  let inn = 64;
  stages.forEach((st, i) => {
    let total = 0;
    for (let b = 0; b < st.n; b++) {
      total += inn * st.mid + 9 * st.mid * st.mid + st.mid * st.out;
      total += 2 * (st.mid + st.mid + st.out);
      if (b === 0) total += inn * st.out + 2 * st.out;
      inn = st.out;
    }
    layers.push({
      name: `stage ${i + 1}`,
      sub: `${st.out.toLocaleString()} maps, ${st.size} × ${st.size}`,
      maps: { n: st.out, size: st.size },
    });
    gaps.push({
      convs: [
        { from: st.out, to: st.mid, k: 1 },
        { from: st.mid, to: st.mid, k: 3 },
        { from: st.mid, to: st.out, k: 1 },
      ],
      times: st.n,
      total,
      note: `${st.n} blocks, each 1 × 1 · 3 × 3 · 1 × 1`,
    });
  });
  layers.push({ name: "output", sub: "1,000 kinds of object", neurons: 1000 });
  gaps.push({ convs: [{ from: 2048, to: 1000, k: 1 }], times: 1, total: 2048 * 1000 + 1000,
    note: "2,048 across, 1,000 down · + 1,000 biases" });
  return { layers, gaps };
})();

export const RESNET50_TOTAL = RESNET50.gaps.reduce((a, g) => a + g.total, 0);

// ── Precision ───────────────────────────────────────────────────────────

export interface Precision {
  name: string;
  bits: number;
  note: string;
}

export const PRECISIONS: Precision[] = [
  { name: "32-bit", bits: 32, note: "how models are trained" },
  { name: "16-bit", bits: 16, note: "how most are shipped" },
  { name: "8-bit", bits: 8, note: "quantized" },
  { name: "4-bit", bits: 4, note: "quantized hard" },
  { name: "3-bit", bits: 3, note: "" },
  { name: "2-bit", bits: 2, note: "" },
];

/** Memory for a parameter count at a given precision. */
export function bytesFor(params: number, bits: number): number {
  return (params * bits) / 8;
}

/** Human-readable byte size. */
export function formatBytes(b: number): string {
  if (b < 1000) return `${b.toFixed(0)} B`;
  if (b < 1e6) return `${(b / 1e3).toFixed(b < 1e4 ? 1 : 0)} KB`;
  if (b < 1e9) return `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;
  if (b < 1e12) return `${(b / 1e9).toFixed(b < 1e10 ? 1 : 0)} GB`;
  return `${(b / 1e12).toFixed(1)} TB`;
}

/** Human-readable parameter count. */
export function formatParams(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)}M`;
  if (n < 1e12) return `${(n / 1e9).toFixed(n < 1e10 ? 1 : 0)}B`;
  return `${(n / 1e12).toFixed(1)}T`;
}

// ── The ladder ──────────────────────────────────────────────────────────

/** Reference points for the scale ladder.
 *
 *  Counts for the gallery's own models are computed, not quoted. The published
 *  models are as reported by their authors. */
export interface Reference {
  name: string;
  params: number;
  note: string;
  /** True when this is one of the gallery's own models. */
  ours?: boolean;
}

export const REFERENCES: Reference[] = [
  {
    name: "Naive Bayes, 2 features",
    params: countNaiveBayes(2, 2),
    note: "the naive Bayes example, two classes",
    ours: true,
  },
  {
    name: "Training autoencoder",
    params: countDense([196, 16, 196]).total,
    note: "the training example, trained live in your browser",
    ours: true,
  },
  {
    name: "Digit recognizer",
    params: countDense([400, 25, 25, 11]).total,
    note: "the deep neural network example",
    ours: true,
  },
  {
    name: "Word embedding table",
    params: 2112 * 32,
    note: "2,112 words at 32 numbers each, as shipped here",
    ours: true,
  },
  { name: "ResNet-50", params: RESNET50_TOTAL, note: "2015, recognises photos" },
  { name: "BERT base", params: 110e6, note: "2018" },
  { name: "GPT-2 XL", params: 1.5e9, note: "2019" },
  { name: "GPT-3", params: 175e9, note: "2020" },
  { name: "Llama 3.1 405B", params: 405e9, note: "2024, open weights" },
  { name: "Kimi K3", params: 2.8e12, note: "2026, open weights" },
];
