// One transformer block, written out step by step, with every intermediate
// kept — the same stance as the attention example's forward pass. A framework
// would fuse all of this; here each stage is a separate array the page draws.
//
// The block is the encoder block of "Attention Is All You Need":
//
//   x  = E + position                   (positions are the attention page's job)
//   a  = W_O · [head_0(x) ; head_1(x) ; … ]      several heads, stacked, folded
//   x1 = norm(x + a)                    add & norm
//   m  = memory(x1), one word at a time  the feed-forward layer
//   x2 = norm(x1 + m)                   add & norm
//
// No mask (that is the LLM example's job) and no cross-attention (only
// encoder–decoder models have it). See ./README.md.

import { cosine, dot, softmaxRow } from "../attention/attention.js";

export { cosine, dot };

/** Raw JSON as emitted by train/build-heads.mjs. */
export interface RawHeads {
  meta: {
    eDim: number;
    qkDim: number;
    vDim: number;
    heads: number;
    note: string;
    source: { name: string; by: string; license: string; url: string };
  };
  sentences: string[];
  vocab: string[];
  /** Row-major [vocab x eDim]. */
  embeddings: number[];
  heads: { name: string; gloss: string; Wq: number[]; Wk: number[]; Wv: number[] }[];
  /** Row-major [eDim x (heads * vDim)]. */
  Wo: number[];
}

export interface HeadSpec {
  name: string;
  gloss: string;
  Wq: Float32Array;
  Wk: Float32Array;
  Wv: Float32Array;
}

export interface Model {
  eDim: number;
  qkDim: number;
  vDim: number;
  sentences: string[];
  vocab: string[];
  embed: Map<string, Float32Array>;
  heads: HeadSpec[];
  Wo: Float32Array;
  meta: RawHeads["meta"];
}

export function loadModel(raw: RawHeads): Model {
  const { eDim } = raw.meta;
  const embed = new Map<string, Float32Array>();
  raw.vocab.forEach((w, i) => {
    embed.set(w, new Float32Array(raw.embeddings.slice(i * eDim, (i + 1) * eDim)));
  });
  return {
    eDim,
    qkDim: raw.meta.qkDim,
    vDim: raw.meta.vDim,
    sentences: raw.sentences,
    vocab: raw.vocab,
    embed,
    heads: raw.heads.map((h) => ({
      name: h.name,
      gloss: h.gloss,
      Wq: new Float32Array(h.Wq),
      Wk: new Float32Array(h.Wk),
      Wv: new Float32Array(h.Wv),
    })),
    Wo: new Float32Array(raw.Wo),
    meta: raw.meta,
  };
}

/** One head's pass over the sentence: the attention pattern and each word's
 *  output, i.e. the whole attention example collapsed to two arrays. */
export interface HeadRun {
  /** weights[i][j]: how much word i takes from word j (rows sum to 1). */
  weights: number[][];
  /** out[i]: the head's output for word i (length vDim). */
  out: Float32Array[];
}

/** Everything one block computes, at every stage. */
export interface BlockRun {
  tokens: string[];
  /** The embeddings that went in (length eDim each). */
  E: Float32Array[];
  /** One run per head, in order. */
  heads: HeadRun[];
  /** Per word: the heads' outputs stacked end to end (heads * vDim). */
  stacked: Float32Array[];
  /** Per word: W_O · stacked (eDim) — the attention layer's contribution. */
  attn: Float32Array[];
  /** Per word: E + attn, before normalising. */
  sum1: Float32Array[];
  /** Per word: norm(E + attn) — what the memory layer receives. */
  x1: Float32Array[];
  /** The memory layer, per word. */
  memory: MemoryRun[];
  /** Per word: x1 + memory output, before normalising. */
  sum2: Float32Array[];
  /** Per word: the block's output. */
  x2: Float32Array[];
}

function matVec(M: Float32Array, rows: number, cols: number, v: Float32Array) {
  const out = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let s = 0;
    const off = r * cols;
    for (let c = 0; c < cols; c++) s += M[off + c]! * v[c]!;
    out[r] = s;
  }
  return out;
}

export function runHead(model: Model, head: HeadSpec, E: Float32Array[]): HeadRun {
  const { eDim, qkDim, vDim } = model;
  const Q = E.map((e) => matVec(head.Wq, qkDim, eDim, e));
  const K = E.map((e) => matVec(head.Wk, qkDim, eDim, e));
  const V = E.map((e) => matVec(head.Wv, vDim, eDim, e));
  const n = E.length;
  const scaleBy = 1 / Math.sqrt(qkDim);
  const weights = Q.map((q) => softmaxRow(K.map((k) => dot(q, k) * scaleBy)));
  const out = weights.map((row) => {
    const o = new Float32Array(vDim);
    for (let j = 0; j < n; j++) {
      const w = row[j]!;
      const v = V[j]!;
      for (let d = 0; d < vDim; d++) o[d]! += w * v[d]!;
    }
    return o;
  });
  return { weights, out };
}

/** Layer normalisation: shift to mean 0, scale to unit spread. The learned
 *  gain and bias a real model adds are left out — they are one more thing to
 *  draw and change nothing about the idea. */
export function layerNorm(x: Float32Array): Float32Array {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i]!;
  mean /= n;
  let vr = 0;
  for (let i = 0; i < n; i++) vr += (x[i]! - mean) ** 2;
  const sd = Math.sqrt(vr / n) || 1;
  return Float32Array.from(x, (v) => (v - mean) / sd);
}

export function add(a: Float32Array, b: Float32Array): Float32Array {
  return Float32Array.from(a, (v, i) => v + b[i]!);
}

/** Root-mean-square size of a vector, for the "how big are these numbers"
 *  readout beside the add & norm step. */
export function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / (x.length || 1));
}

// ── The feed-forward layer as a key–value memory ──────────────────────────
//
// A real feed-forward layer is  W_2 · relu(W_1 · x) : expand, threshold,
// contract. Read row by row, that is a bank of memories: row i of W_1 is a
// KEY that fires when the input resembles it, and column i of W_2 is the
// VALUE that fires adds to the output. (Geva et al., 2021; Meng et al.,
// 2022 locate factual associations in exactly these layers.)
//
// This page has no trained feed-forward layer, and 16 dimensions of GloVe
// leave nothing to train one on. So the memory here is DESIGNED, and labelled
// as such on the page: one drawer per word the model knows, keyed on that
// word's embedding, whose value nudges the output toward that word. It shows
// the mechanism exactly — sparse keys firing, values summed, one word at a
// time with no cross-talk — while the contents are a stand-in for the
// thousands of learned drawers a real layer has.

export interface MemoryRun {
  /** Per drawer: how strongly its key fired (0 when closed). */
  activation: Float32Array;
  /** Indices of the drawers that opened, strongest first. */
  open: number[];
  /** Σ activation × value: what the memory adds to the word. */
  out: Float32Array;
}

/** Keys fire on cosine similarity above a threshold; a real layer's ReLU
 *  does the same job with a learned bias. */
const MEMORY_THRESHOLD = 0.3;

export function runMemory(model: Model, x: Float32Array): MemoryRun {
  const keys = model.vocab.map((w) => model.embed.get(w)!);
  const activation = new Float32Array(keys.length);
  keys.forEach((k, i) => {
    const c = cosine(x, k);
    activation[i] = Math.max(0, c - MEMORY_THRESHOLD) / (1 - MEMORY_THRESHOLD);
  });
  const open = Array.from(activation, (a, i) => ({ a, i }))
    .filter((d) => d.a > 0)
    .sort((p, q) => q.a - p.a)
    .map((d) => d.i);
  const out = new Float32Array(model.eDim);
  for (const i of open) {
    const v = keys[i]!;
    const a = activation[i]!;
    for (let d = 0; d < model.eDim; d++) out[d]! += a * v[d]!;
  }
  return { activation, open, out };
}

/** One full encoder block over a token list. `mutedHeads` zeroes the listed
 *  heads' outputs, for the "switch a head off" demonstration. */
export function runBlock(
  model: Model,
  tokens: string[],
  mutedHeads: ReadonlySet<number> = new Set(),
): BlockRun {
  const { eDim, vDim } = model;
  const E = tokens.map((t) => model.embed.get(t) ?? new Float32Array(eDim));
  const heads = model.heads.map((h) => runHead(model, h, E));
  const H = heads.length;

  const stacked = tokens.map((_, i) => {
    const s = new Float32Array(H * vDim);
    heads.forEach((h, k) => {
      if (mutedHeads.has(k)) return;
      s.set(h.out[i]!, k * vDim);
    });
    return s;
  });
  const attn = stacked.map((s) => matVec(model.Wo, eDim, H * vDim, s));
  const sum1 = E.map((e, i) => add(e, attn[i]!));
  const x1 = sum1.map(layerNorm);
  const memory = x1.map((x) => runMemory(model, x));
  const sum2 = x1.map((x, i) => add(x, memory[i]!.out));
  const x2 = sum2.map(layerNorm);

  return { tokens, E, heads, stacked, attn, sum1, x1, memory, sum2, x2 };
}

/** The words a vector most resembles, for readouts. */
export function nearest(model: Model, x: Float32Array, k = 3): { word: string; sim: number }[] {
  return model.vocab
    .map((word) => ({ word, sim: cosine(x, model.embed.get(word)!) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}
