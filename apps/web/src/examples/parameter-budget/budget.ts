// Parameter arithmetic.
//
// The point of this example is that "how many parameters does this model have"
// is not a mystery number quoted in a press release — it is a shape fact you
// can derive from the picture in about ten seconds. Every count here is
// computed from layer widths, never looked up.

export interface Layer {
  /** Neurons in this layer. */
  width: number;
}

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

/** Count the parameters of a fully-connected stack.
 *
 *  Between two layers every neuron connects to every neuron, so the weights
 *  are a rectangle: from x to. Each destination neuron also gets one bias.
 *  That is the entire rule, and it is why widening a middle layer costs so
 *  much more than widening an end one — a middle layer pays twice, once on
 *  each side. */
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

/** Memory for a parameter count at a given precision. */
export function bytesFor(params: number, bytesPerParam: number): number {
  return params * bytesPerParam;
}

export interface Precision {
  name: string;
  bytes: number;
  note: string;
}

export const PRECISIONS: Precision[] = [
  { name: "float32", bytes: 4, note: "how models are usually trained" },
  { name: "float16", bytes: 2, note: "the common shipping format" },
  { name: "int8", bytes: 1, note: "quantized — most of the gallery's weights" },
  { name: "int4", bytes: 0.5, note: "aggressive; quality starts to suffer" },
];

/** Human-readable byte size. */
export function formatBytes(b: number): string {
  if (b < 1024) return `${b.toFixed(0)} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b < 1024 ** 4) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  return `${(b / 1024 ** 4).toFixed(1)} TB`;
}

/** Human-readable parameter count. */
export function formatParams(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)}M`;
  if (n < 1e12) return `${(n / 1e9).toFixed(n < 1e10 ? 1 : 0)}B`;
  return `${(n / 1e12).toFixed(1)}T`;
}

/** Reference points for the scale ladder.
 *
 *  Counts for the gallery's own models are computed, not quoted. The published
 *  models are as reported by their authors; where a figure is an estimate
 *  rather than a published number it says so, because a confidently wrong
 *  number is worse than an honest range. */
export interface Reference {
  name: string;
  params: number;
  note: string;
  /** True when this is one of the gallery's own models. */
  ours?: boolean;
  /** True when the number is an informed estimate rather than published. */
  estimated?: boolean;
}

export const REFERENCES: Reference[] = [
  {
    name: "This page's autoencoder",
    params: 196 * 16 + 16 + 16 * 196 + 196,
    note: "the training example — trained live in your browser",
    ours: true,
  },
  {
    name: "Digit recognizer",
    params: 400 * 25 + 25 + 25 * 25 + 25 + 25 * 11 + 11,
    note: "the gallery's MNIST network, 97% accurate",
    ours: true,
  },
  {
    name: "Word embedding table",
    params: 2112 * 32,
    note: "2,112 words at 32 dimensions, as shipped here",
    ours: true,
  },
  {
    name: "BERT base",
    params: 110e6,
    note: "2018 — the model that made transformers mainstream",
  },
  {
    name: "GPT-2",
    params: 1.5e9,
    note: "2019 — considered too dangerous to release, briefly",
  },
  {
    name: "GPT-3",
    params: 175e9,
    note: "2020 — the jump that started the current era",
  },
  {
    name: "Llama 3.1 405B",
    params: 405e9,
    note: "2024 — open weights, runnable if you have the hardware",
  },
];
