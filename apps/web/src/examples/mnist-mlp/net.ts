// Hand-written forward pass for the digit-recognition example.
//
// Deliberately not a library. The whole point of the visualization is to read
// every intermediate activation and every weight, which a framework hides
// behind opaque tensor handles — and TF.js would add ~1 MB to a page whose
// entire payload is a few tens of KB. The math here is three affine layers
// with ReLU + softmax; that is genuinely all a small MLP is.
//
// Weights are produced offline by ./train/train.mjs and shipped as a static
// JSON asset. See ./README.md for the topology and the training story.

/** Raw weights JSON as emitted by train.mjs. Row-major matrices flattened:
 *  W1 is [H1 x IN], W2 is [H2 x H1], W3 is [OUT x H2]. */
export interface RawWeights {
  meta: {
    arch: [number, number, number, number];
    dim: number;
    labels: string[];
    activation: string;
    output: string;
  };
  W1: number[]; b1: number[];
  W2: number[]; b2: number[];
  W3: number[]; b3: number[];
}

/** A loaded network: typed arrays + dimensions, ready to run. */
export interface Net {
  IN: number; H1: number; H2: number; OUT: number;
  dim: number;
  labels: string[];
  W1: Float32Array; b1: Float32Array;
  W2: Float32Array; b2: Float32Array;
  W3: Float32Array; b3: Float32Array;
}

/** Everything the renderer needs from one forward pass: the input plus the
 *  post-activation values of every layer. Pre-activation (z) values aren't
 *  needed for drawing — nodes are colored by activation. */
export interface Activations {
  /** The NORMALIZED input the network actually saw (length IN, 0..1). The raw
   *  drawing is centred + size-normalized before the forward pass; this is that
   *  result, so the visualized input grid shows exactly what fed the net. */
  input: Float32Array;
  /** The raw drawing before normalization (length IN, 0..1), kept so callers
   *  can tell "did the user draw anything" independent of normalization. */
  raw: Float32Array;
  h1: Float32Array;    // length H1, ReLU output (>= 0)
  h2: Float32Array;    // length H2, ReLU output (>= 0)
  output: Float32Array; // length OUT, softmax (sums to 1)
}

// Normalize a dim x dim grayscale image (0..1) the way the training data is
// normalized: crop to the ink bounding box, bilinearly scale so the longer side
// is BOX cells, and paste centred by centre-of-mass. A stroke drawn anywhere at
// any size lands in the distribution the net trained on — the single biggest
// accuracy win for hand-drawn input.
//
// MUST stay equivalent to normalize20() in train/train.mjs — training and
// inference both depend on it. Change one, change the other.
const NORM_BOX = 16;
export function normalize(img: Float32Array, dim: number): Float32Array {
  const D = dim;
  const TH = 0.08;
  let minX = D, minY = D, maxX = -1, maxY = -1;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      if (img[y * D + x]! > TH) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img.slice(); // empty
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const scale = NORM_BOX / Math.max(bw, bh);
  const sw = Math.max(1, Math.round(bw * scale));
  const sh = Math.max(1, Math.round(bh * scale));

  const box = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const fx = minX + (i / sw) * bw;
      const fy = minY + (j / sh) * bh;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(D - 1, x0 + 1), y1 = Math.min(D - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const a = img[y0 * D + x0]!, b = img[y0 * D + x1]!;
      const c = img[y1 * D + x0]!, d = img[y1 * D + x1]!;
      box[j * sw + i] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    }
  }

  let m = 0, mx = 0, my = 0;
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const v = box[j * sw + i]!;
      m += v; mx += v * i; my += v * j;
    }
  }
  const comX = m > 0 ? mx / m : sw / 2;
  const comY = m > 0 ? my / m : sh / 2;
  const offX = Math.round(D / 2 - comX);
  const offY = Math.round(D / 2 - comY);

  const out = new Float32Array(D * D);
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const x = i + offX, y = j + offY;
      if (x >= 0 && x < D && y >= 0 && y < D) out[y * D + x] = box[j * sw + i]!;
    }
  }
  return out;
}

export function loadNet(raw: RawWeights): Net {
  const [IN, H1, H2, OUT] = raw.meta.arch;
  const f = (a: number[]) => Float32Array.from(a);
  return {
    IN, H1, H2, OUT,
    dim: raw.meta.dim,
    labels: raw.meta.labels,
    W1: f(raw.W1), b1: f(raw.b1),
    W2: f(raw.W2), b2: f(raw.b2),
    W3: f(raw.W3), b3: f(raw.b3),
  };
}

// out[i] = b[i] + sum_j W[i*cols + j] * x[j], then optional ReLU in place.
function affine(
  W: Float32Array, b: Float32Array, x: Float32Array,
  rows: number, cols: number, relu: boolean,
): Float32Array {
  const out = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    let s = b[i]!;
    const base = i * cols;
    for (let j = 0; j < cols; j++) s += W[base + j]! * x[j]!;
    out[i] = relu ? (s > 0 ? s : 0) : s;
  }
  return out;
}

function softmax(z: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < z.length; i++) if (z[i]! > max) max = z[i]!;
  const out = new Float32Array(z.length);
  let sum = 0;
  for (let i = 0; i < z.length; i++) { out[i] = Math.exp(z[i]! - max); sum += out[i]!; }
  for (let i = 0; i < z.length; i++) out[i]! /= sum;
  return out;
}

/** Run the network on a length-IN raw drawing (0..1) and return every
 *  activation. The drawing is normalized (centred + size-normalized) to match
 *  the training distribution before the forward pass; `activations.input` is
 *  that normalized image (what the net saw), `activations.raw` is the drawing. */
export function forward(net: Net, raw: Float32Array): Activations {
  const input = normalize(raw, net.dim);
  const h1 = affine(net.W1, net.b1, input, net.H1, net.IN, true);
  const h2 = affine(net.W2, net.b2, h1, net.H2, net.H1, true);
  const logits = affine(net.W3, net.b3, h2, net.OUT, net.H2, false);
  const output = softmax(logits);
  return { input, raw, h1, h2, output };
}

/** argmax of the output layer, as an index into net.labels. */
export function predict(a: Activations): number {
  let arg = 0, mx = -Infinity;
  for (let i = 0; i < a.output.length; i++) {
    if (a.output[i]! > mx) { mx = a.output[i]!; arg = i; }
  }
  return arg;
}
