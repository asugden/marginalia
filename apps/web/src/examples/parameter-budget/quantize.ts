// Rounding a real model, live.
//
// The digit recognizer's weights (the deep neural network example) are
// rounded to fewer bits and then scored on the 240 real handwritten digits
// the training example ships. Nothing is precomputed: the accuracy the page
// shows is this network, rounded this much, reading these digits.
//
// Rounding is per neuron, which is how real quantization works: each neuron's
// incoming weights share one scale (the largest of them), and every weight is
// snapped to the nearest of the evenly spaced levels that many bits allow.

import { forward, loadNet, predict, type Net, type RawWeights } from "../mnist-mlp/net.js";
import { loadDigits, type RawDigits } from "../training/autoencoder.js";

export const WEIGHTS_URL = "/examples/deep-neural-network/weights.json";
export const DIGITS_URL = "/examples/training/digits.json";

export interface DigitBank {
  count: number;
  labels: number[];
  /** The 14 x 14 originals, for thumbnails. */
  small: Float32Array[];
  /** The same digits at the recognizer's 20 x 20. */
  inputs: Float32Array[];
}

/** Stretch a 14 x 14 digit to the recognizer's 20 x 20 (bilinear). The
 *  recognizer then centres and scales it exactly as it does a drawing. */
function upsample(img: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(to * to);
  const r = (from - 1) / (to - 1);
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      const fx = x * r, fy = y * r;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(from - 1, x0 + 1), y1 = Math.min(from - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const g = (a: number, b: number) => img[b * from + a]!;
      out[y * to + x] =
        g(x0, y0) * (1 - tx) * (1 - ty) + g(x1, y0) * tx * (1 - ty) +
        g(x0, y1) * (1 - tx) * ty + g(x1, y1) * tx * ty;
    }
  }
  return out;
}

export function makeBank(raw: RawDigits, dim: number): DigitBank {
  const set = loadDigits(raw);
  const small: Float32Array[] = [];
  const inputs: Float32Array[] = [];
  for (let i = 0; i < set.count; i++) {
    const img = set.images.slice(i * set.size, (i + 1) * set.size);
    small.push(img);
    inputs.push(upsample(img, set.dim, dim));
  }
  return { count: set.count, labels: set.labels, small, inputs };
}

/** Snap each row's weights to `bits` bits, one scale per row (per neuron). */
function roundRows(W: Float32Array, cols: number, bits: number): Float32Array {
  if (bits >= 16) return W; // 16-bit changes nothing this network can feel
  const levels = 2 ** (bits - 1) - 1; // levels either side of zero
  const out = new Float32Array(W.length);
  for (let r = 0; r * cols < W.length; r++) {
    let max = 0;
    for (let c = 0; c < cols; c++) max = Math.max(max, Math.abs(W[r * cols + c]!));
    const step = max / levels || 1;
    for (let c = 0; c < cols; c++) {
      out[r * cols + c] = Math.round(W[r * cols + c]! / step) * step;
    }
  }
  return out;
}

export function roundNet(raw: RawWeights, bits: number): Net {
  const net = loadNet(raw);
  return {
    ...net,
    W1: roundRows(net.W1, net.IN, bits),
    W2: roundRows(net.W2, net.H1, bits),
    W3: roundRows(net.W3, net.H2, bits),
  };
}

/** How many of the bank's digits the network reads correctly. */
export function score(net: Net, bank: DigitBank): number {
  let right = 0;
  for (let i = 0; i < bank.count; i++) {
    if (predict(forward(net, bank.inputs[i]!)) === bank.labels[i]) right++;
  }
  return right;
}

/** The network's probabilities for one digit, 0–9 (the "blank" output is
 *  folded away and the rest renormalised). */
export function answer(net: Net, input: Float32Array): number[] {
  const out = Array.from(forward(net, input).output).slice(0, 10);
  const s = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((p) => p / s);
}
