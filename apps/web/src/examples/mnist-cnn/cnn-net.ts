// Hand-written forward pass for the CNN digit-recognition example.
//
// Like the MLP example's net.ts, this is deliberately not a library: the whole
// point of the visualization is to read every intermediate — the kernels, each
// feature map, the pooled maps, the dense activations — which frameworks hide,
// and TF.js would add ~1 MB to a static page. The convolution/pool/dense math
// is just a few nested loops.
//
// Weights are produced offline by ./train/train.mjs and shipped as a static
// JSON asset. Unlike the MLP example, the drawing is fed to the conv stack RAW
// (not normalized/recentred): a convolution is translation-equivariant, so the
// feature maps line up pixel-for-pixel with the input grid the student drew.


export interface CNNRawWeights {
  meta: {
    dim: number; k: number; f1: number; f2: number;
    c1: number; p1: number; c2: number; p2: number;
    flat: number; dense: number; outN: number;
    labels: string[];
  };
  k1: number[]; b1: number[];
  k2: number[]; b2: number[];
  wd: number[]; bd: number[];
  wo: number[]; bo: number[];
}

export interface CNNNet {
  dim: number; k: number; f1: number; f2: number;
  c1: number; p1: number; c2: number; p2: number;
  flat: number; dense: number; outN: number;
  labels: string[];
  k1: Float32Array; b1: Float32Array;
  k2: Float32Array; b2: Float32Array;
  wd: Float32Array; bd: Float32Array;
  wo: Float32Array; bo: Float32Array;
}

/** All intermediates from one forward pass, for the renderer. Feature maps are
 *  stored flat, one channel after another (channel f at offset f*h*w). */
export interface CNNActivations {
  raw: Float32Array;    // the drawing, dim*dim
  input: Float32Array;  // what the conv stack saw (== raw; kept for symmetry)
  conv1: Float32Array;  // f1 * c1 * c1  (post-ReLU)
  pool1: Float32Array;  // f1 * p1 * p1
  conv2: Float32Array;  // f2 * c2 * c2  (post-ReLU)
  pool2: Float32Array;  // f2 * p2 * p2
  flat: Float32Array;   // flat
  dense: Float32Array;  // dense (post-ReLU)
  output: Float32Array; // outN (softmax)
}

export function loadCNN(raw: CNNRawWeights): CNNNet {
  const f = (a: number[]) => Float32Array.from(a);
  const m = raw.meta;
  return {
    dim: m.dim, k: m.k, f1: m.f1, f2: m.f2,
    c1: m.c1, p1: m.p1, c2: m.c2, p2: m.p2,
    flat: m.flat, dense: m.dense, outN: m.outN,
    labels: m.labels,
    k1: f(raw.k1), b1: f(raw.b1),
    k2: f(raw.k2), b2: f(raw.b2),
    wd: f(raw.wd), bd: f(raw.bd),
    wo: f(raw.wo), bo: f(raw.bo),
  };
}

function relu(v: number): number { return v > 0 ? v : 0; }

/** 2x2 stride-2 max pool of a (h x w) channel-major map into (ph x pw). */
function maxPool(
  src: Float32Array, channels: number, h: number, w: number,
): { out: Float32Array; ph: number; pw: number } {
  const ph = Math.floor(h / 2), pw = Math.floor(w / 2);
  const out = new Float32Array(channels * ph * pw);
  for (let ch = 0; ch < channels; ch++) {
    for (let oy = 0; oy < ph; oy++) {
      for (let ox = 0; ox < pw; ox++) {
        let best = -Infinity;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const v = src[ch * h * w + (oy * 2 + dy) * w + (ox * 2 + dx)]!;
          if (v > best) best = v;
        }
        out[ch * ph * pw + oy * pw + ox] = best;
      }
    }
  }
  return { out, ph, pw };
}

export function forwardCNN(net: CNNNet, raw: Float32Array): CNNActivations {
  const { dim, k, f1, f2, c1, c2, dense, outN } = net;
  // Feed the RAW drawing straight into the conv stack — NOT a normalized
  // (cropped + magnified) copy. A convolution is translation-equivariant, so
  // the network reads the digit where you drew it, at the size you drew it, and
  // every feature map lines up pixel-for-pixel with the input grid above. (The
  // MLP example normalizes because a dense net isn't translation-invariant; a
  // CNN doesn't need it, and normalizing here made a small dot balloon into a
  // big blob in conv1 — the "funky upscaling" that broke pixel alignment.)
  const input = raw;

  // conv1 (valid, ReLU)
  const conv1 = new Float32Array(f1 * c1 * c1);
  for (let f = 0; f < f1; f++) {
    const kb = f * k * k;
    for (let oy = 0; oy < c1; oy++) for (let ox = 0; ox < c1; ox++) {
      let s = net.b1[f]!;
      for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++)
        s += net.k1[kb + ky * k + kx]! * input[(oy + ky) * dim + (ox + kx)]!;
      conv1[f * c1 * c1 + oy * c1 + ox] = relu(s);
    }
  }
  // pool1
  const { out: pool1, ph: p1 } = maxPool(conv1, f1, c1, c1);

  // conv2 (valid, ReLU) over the f1-channel pooled map
  const conv2 = new Float32Array(f2 * c2 * c2);
  for (let f = 0; f < f2; f++) {
    for (let oy = 0; oy < c2; oy++) for (let ox = 0; ox < c2; ox++) {
      let s = net.b2[f]!;
      for (let ch = 0; ch < f1; ch++) {
        const kb = (f * f1 + ch) * k * k;
        for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++)
          s += net.k2[kb + ky * k + kx]! * pool1[ch * p1 * p1 + (oy + ky) * p1 + (ox + kx)]!;
      }
      conv2[f * c2 * c2 + oy * c2 + ox] = relu(s);
    }
  }
  // pool2 -> flat
  const { out: pool2, ph: p2 } = maxPool(conv2, f2, c2, c2);
  const flat = pool2; // already channel-major flat of length f2*p2*p2

  // dense (ReLU)
  const denseA = new Float32Array(dense);
  for (let i = 0; i < dense; i++) {
    let s = net.bd[i]!; const base = i * net.flat;
    for (let j = 0; j < net.flat; j++) s += net.wd[base + j]! * flat[j]!;
    denseA[i] = relu(s);
  }
  // output (softmax)
  const logits = new Float32Array(outN);
  let max = -Infinity;
  for (let i = 0; i < outN; i++) {
    let s = net.bo[i]!; const base = i * dense;
    for (let j = 0; j < dense; j++) s += net.wo[base + j]! * denseA[j]!;
    logits[i] = s; if (s > max) max = s;
  }
  const output = new Float32Array(outN);
  let sum = 0;
  for (let i = 0; i < outN; i++) { output[i] = Math.exp(logits[i]! - max); sum += output[i]!; }
  for (let i = 0; i < outN; i++) output[i]! /= sum;

  return { raw, input, conv1, pool1, conv2, pool2, flat, dense: denseA, output };
}

export function predictCNN(a: CNNActivations): number {
  let arg = 0, mx = -Infinity;
  for (let i = 0; i < a.output.length; i++) if (a.output[i]! > mx) { mx = a.output[i]!; arg = i; }
  return arg;
}
