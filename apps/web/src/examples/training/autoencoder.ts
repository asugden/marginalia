// A real autoencoder, trained live in the browser.
//
// This is the only example in the gallery that ships no weights: it ships data
// and starts from random noise, because the whole lesson is that the numbers
// begin meaningless and become meaningful. Nothing here is a replay of a
// training run recorded offline — press step and the arithmetic happens.
//
// WHY AN AUTOENCODER RATHER THAN A CLASSIFIER
//
// A classifier's error is a number: "you said 7, it was 3". An autoencoder's
// error is a *picture* — the difference between what went in and what came
// out, pixel by pixel. That makes "how wrong is this parameter, and in which
// direction" something a student can see rather than take on faith, which is
// the hard part of teaching training.
//
// It also sets up the word-embedding example: squeeze 196 numbers through a
// waist of 16 and the waist is forced to learn structure. Same bottleneck,
// same argument.
//
// ON BACKPROPAGATION
//
// The gradients below are exact — this is real backprop, not an approximation.
// But the page never says "chain rule". It says: each weight gets a number
// telling it which way to move and how much, and we move it that way. That is
// what a gradient IS, and it is the honest half of the story that fits in one
// example. Where those numbers come from is the next course.

/** Raw digit set as emitted by ./train/build-digits.mjs. */
export interface RawDigits {
  meta: {
    dim: number;
    count: number;
    quantization: string;
    source: { name: string; by: string; url: string };
    note: string;
  };
  labels: number[];
  images: number[];
}

export interface DigitSet {
  dim: number;
  /** Pixel count per image (dim * dim). */
  size: number;
  count: number;
  labels: number[];
  /** Row-major: image i occupies [i*size, (i+1)*size), values 0..1. */
  images: Float32Array;
  meta: RawDigits["meta"];
}

export function loadDigits(raw: RawDigits): DigitSet {
  const { dim } = raw.meta;
  const size = dim * dim;
  const images = new Float32Array(raw.images.length);
  for (let i = 0; i < raw.images.length; i++) images[i] = (raw.images[i] ?? 0) / 255;
  return {
    dim,
    size,
    count: raw.labels.length,
    labels: raw.labels,
    images,
    meta: raw.meta,
  };
}

/** The model: 196 -> hidden -> 196, sigmoid throughout.
 *
 *  Sigmoid rather than ReLU on purpose. The output has to land in 0..1 to be
 *  an image, and using the same activation on both layers means there is one
 *  fewer thing to explain. At this size it trains fine. */
export interface Model {
  inSize: number;
  hidden: number;
  /** [hidden x inSize] */
  W1: Float32Array;
  b1: Float32Array;
  /** [inSize x hidden] */
  W2: Float32Array;
  b2: Float32Array;
}

/** Deterministic PRNG (mulberry32) so a given seed always produces the same
 *  starting noise — "re-roll the dice" has to be reproducible in a lecture. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fresh random weights.
 *
 *  Scaled by 1/sqrt(fan-in) — the standard initialization. Too large and the
 *  sigmoids saturate and nothing moves; too small and every output starts
 *  identical. Worth knowing that this scale is a real choice, not a detail:
 *  the page's "re-roll" button shows different seeds converging to similar
 *  results, which is the point about initialization that matters. */
export function initModel(inSize: number, hidden: number, seed: number): Model {
  const r = rng(seed);
  const gauss = () => {
    // Box-Muller from the seeded uniform, so initialization is normal and
    // reproducible.
    const u = Math.max(r(), 1e-9);
    const v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const W1 = new Float32Array(hidden * inSize);
  const W2 = new Float32Array(inSize * hidden);
  const s1 = 1 / Math.sqrt(inSize);
  const s2 = 1 / Math.sqrt(hidden);
  for (let i = 0; i < W1.length; i++) W1[i] = gauss() * s1;
  for (let i = 0; i < W2.length; i++) W2[i] = gauss() * s2;
  return {
    inSize,
    hidden,
    W1,
    b1: new Float32Array(hidden),
    W2,
    b2: new Float32Array(inSize),
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export interface Pass {
  /** The image that went in. */
  input: Float32Array;
  /** The bottleneck activations. */
  hidden: Float32Array;
  /** The reconstruction that came out. */
  output: Float32Array;
  /** output - input, per pixel: the error, as a picture. */
  error: Float32Array;
  /** Mean squared error over the pixels. */
  loss: number;
}

/** One forward pass, keeping everything the visualization needs. */
export function forward(m: Model, input: Float32Array): Pass {
  const hidden = new Float32Array(m.hidden);
  for (let h = 0; h < m.hidden; h++) {
    let z = m.b1[h]!;
    const off = h * m.inSize;
    for (let i = 0; i < m.inSize; i++) z += m.W1[off + i]! * input[i]!;
    hidden[h] = sigmoid(z);
  }

  const output = new Float32Array(m.inSize);
  const error = new Float32Array(m.inSize);
  let loss = 0;
  for (let o = 0; o < m.inSize; o++) {
    let z = m.b2[o]!;
    const off = o * m.hidden;
    for (let h = 0; h < m.hidden; h++) z += m.W2[off + h]! * hidden[h]!;
    const y = sigmoid(z);
    output[o] = y;
    const e = y - input[o]!;
    error[o] = e;
    loss += e * e;
  }
  return { input, hidden, output, error, loss: loss / m.inSize };
}

export interface StepResult {
  /** Mean loss over the batch, before the update. */
  loss: number;
  /** Largest absolute weight change this step — "how much did it move?". */
  biggestChange: number;
}

/** One gradient-descent step over a batch.
 *
 *  Exact gradients for a two-layer sigmoid autoencoder under squared error.
 *  The derivative of sigmoid(z) is y*(1-y), which is why the code carries the
 *  activations rather than the pre-activations. */
export function step(
  m: Model,
  images: Float32Array,
  indices: number[],
  lr: number,
): StepResult {
  const gW1 = new Float32Array(m.W1.length);
  const gb1 = new Float32Array(m.b1.length);
  const gW2 = new Float32Array(m.W2.length);
  const gb2 = new Float32Array(m.b2.length);
  let totalLoss = 0;

  for (const idx of indices) {
    const input = images.subarray(idx * m.inSize, (idx + 1) * m.inSize);
    const p = forward(m, input);
    totalLoss += p.loss;

    // Output layer: dL/dz = 2(y - t) * y(1 - y).
    const dz2 = new Float32Array(m.inSize);
    for (let o = 0; o < m.inSize; o++) {
      const y = p.output[o]!;
      dz2[o] = 2 * p.error[o]! * y * (1 - y);
    }
    for (let o = 0; o < m.inSize; o++) {
      const d = dz2[o]!;
      if (d === 0) continue;
      const off = o * m.hidden;
      for (let h = 0; h < m.hidden; h++) gW2[off + h]! += d * p.hidden[h]!;
      gb2[o]! += d;
    }

    // Hidden layer: push the error back through W2, then through the sigmoid.
    const dz1 = new Float32Array(m.hidden);
    for (let h = 0; h < m.hidden; h++) {
      let s = 0;
      for (let o = 0; o < m.inSize; o++) s += dz2[o]! * m.W2[o * m.hidden + h]!;
      const a = p.hidden[h]!;
      dz1[h] = s * a * (1 - a);
    }
    for (let h = 0; h < m.hidden; h++) {
      const d = dz1[h]!;
      if (d === 0) continue;
      const off = h * m.inSize;
      for (let i = 0; i < m.inSize; i++) gW1[off + i]! += d * input[i]!;
      gb1[h]! += d;
    }
  }

  const scale = lr / indices.length;
  let biggest = 0;
  const apply = (w: Float32Array, g: Float32Array) => {
    for (let i = 0; i < w.length; i++) {
      const delta = scale * g[i]!;
      w[i]! -= delta;
      const a = Math.abs(delta);
      if (a > biggest) biggest = a;
    }
  };
  apply(m.W1, gW1);
  apply(m.b1, gb1);
  apply(m.W2, gW2);
  apply(m.b2, gb2);

  return { loss: totalLoss / indices.length, biggestChange: biggest };
}

/** Mean loss across a set of images, without touching the weights. */
export function evaluate(
  m: Model,
  images: Float32Array,
  count: number,
): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += forward(m, images.subarray(i * m.inSize, (i + 1) * m.inSize)).loss;
  }
  return total / count;
}

/** What one hidden unit responds to, as an image.
 *
 *  The incoming weights of a unit, rescaled to 0..1 for display. This is the
 *  "what did it learn" picture: early on it is noise, and later it is strokes
 *  and blobs that recur across digits. */
export function featureImage(m: Model, unit: number): Float32Array {
  const off = unit * m.inSize;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < m.inSize; i++) {
    const w = m.W1[off + i]!;
    if (w < lo) lo = w;
    if (w > hi) hi = w;
  }
  const span = hi - lo || 1;
  const out = new Float32Array(m.inSize);
  for (let i = 0; i < m.inSize; i++) out[i] = (m.W1[off + i]! - lo) / span;
  return out;
}

/** Total learnable parameters. */
export function paramCount(m: Model): number {
  return m.W1.length + m.b1.length + m.W2.length + m.b2.length;
}
