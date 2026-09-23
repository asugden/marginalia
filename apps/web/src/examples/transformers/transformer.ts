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

/** Raw JSON as emitted by train/build-facts.mjs: the fact layer's facts, and
 *  the outside-the-sentences words they point at, in the same 16-d space. */
export interface RawFacts {
  meta: { eDim: number; note: string };
  facts: Fact[];
  embeddings: Record<string, number[]>;
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
  /** The fact layer's facts; empty when no facts file was loaded. */
  facts: Fact[];
  /** Embeddings of the fact words, which appear in no sentence. */
  factEmbed: Map<string, Float32Array>;
}

export function loadModel(raw: RawHeads, rawFacts?: RawFacts): Model {
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
    facts: rawFacts?.facts ?? [],
    factEmbed: new Map(
      Object.entries(rawFacts?.embeddings ?? {}).map(([w, v]) => [w, new Float32Array(v)]),
    ),
  };
}

/** Fetch the heads and the fact layer, and load them as one model. Both the
 *  transformer and BERT pages run the same block, so both load both. */
export async function fetchModel(signal?: AbortSignal): Promise<Model> {
  const get = async (url: string) => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`${url.split("/").pop()} ${r.status}`);
    return r.json();
  };
  const [raw, facts] = await Promise.all([
    get("/examples/transformers/heads.json") as Promise<RawHeads>,
    get("/examples/transformers/facts.json") as Promise<RawFacts>,
  ]);
  return loadModel(raw, facts);
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
/** The mean and standard deviation of a word's numbers — the two things
 *  layerNorm resets, to 0 and 1. */
export function meanSd(x: Float32Array): { mean: number; sd: number } {
  const n = x.length || 1;
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i]!;
  mean /= n;
  let vr = 0;
  for (let i = 0; i < x.length; i++) vr += (x[i]! - mean) ** 2;
  return { mean, sd: Math.sqrt(vr / n) };
}

// ── The feed-forward layer, as a store of facts ───────────────────────────
//
// A real feed-forward layer is  W_2 · relu(W_1 · x + b) : widen, ReLU,
// narrow. Each hidden neuron fires for some pattern in the word it is shown
// (its row of W_1 and its bias) and, when it fires, adds something to the
// word (its column of W_2). Research that took trained models apart found
// individual neurons like this holding facts — the neurons that fire for
// "Eiffel Tower" add a push toward "Paris" — and found that editing them
// edits the fact (Geva et al., 2021; Meng et al., 2022).
//
// This page has no trained feed-forward layer: sixteen dimensions of GloVe
// leave nothing to train one on. So the layer here is DESIGNED, and the page
// says so. It has one hidden neuron per fact (facts.json, built by
// train/build-facts.mjs). A fact joins a word in the sentences to something
// NO sentence says — pierogi → polish, stadium → soccer — because that is
// the finding: attention can only mix in what is in the input; this layer
// adds what is not. A fact neuron's incoming weights point along its trigger
// word, so it fires for that word and for words near it; its outgoing
// weights add a push toward its fact word. Everything else is the real
// mechanism: a weighted sum, a bias, a ReLU, and the firing neurons' pushes
// added together, one word at a time.

export interface Fact {
  /** The word the neuron fires for. */
  from: string;
  /** The word it pushes toward when it fires. */
  to: string;
}


/** How closely the word has to match a trigger before the neuron fires: the
 *  bias. Below it the ReLU holds the neuron at zero. Low enough that a word
 *  fires a few neurons partly — about a quarter of them, on these sentences —
 *  with its own fact's neuron far ahead, rather than one neuron and nothing
 *  else. */
const FACT_THRESHOLD = 0.1;
/** How hard a fully firing neuron pushes toward its fact word. */
const FACT_PUSH = 0.9;

export interface FactNeuron {
  fact: Fact;
  /** Row of W_1: the trigger word's direction, scaled so w·x is the cosine
   *  match for a normalised input (whose length is always √16 = 4). */
  w: Float32Array;
  b: number;
  /** Column of W_2: the push toward the fact word. */
  v: Float32Array;
}

const NEURONS = new WeakMap<Model, FactNeuron[]>();

export function factNeurons(model: Model): FactNeuron[] {
  const cached = NEURONS.get(model);
  if (cached) return cached;
  const n = Math.sqrt(model.eDim);
  const unit = (x: Float32Array) => {
    const len = Math.hypot(...Array.from(x)) || 1;
    return Float32Array.from(x, (v) => v / len);
  };
  const gain = 1 / (1 - FACT_THRESHOLD);
  const neurons = model.facts.map((fact) => {
    const from = unit(model.embed.get(fact.from)!);
    const to = unit(factVector(model, fact.to));
    return {
      fact,
      w: Float32Array.from(from, (v) => (v * gain) / n),
      b: -FACT_THRESHOLD * gain,
      v: Float32Array.from(to, (v) => v * FACT_PUSH * n),
    };
  });
  NEURONS.set(model, neurons);
  return neurons;
}

/** A fact word's embedding: fact words live outside the sentence vocabulary. */
export function factVector(model: Model, word: string): Float32Array {
  const v = model.factEmbed.get(word) ?? model.embed.get(word);
  if (!v) throw new Error(`no embedding for fact word "${word}"`);
  return v;
}

export interface MemoryRun {
  /** Per neuron: its weighted sum plus bias, before the ReLU. */
  match: Float32Array;
  /** Per neuron: after the ReLU — 0 when it does not fire. */
  activation: Float32Array;
  /** Indices of the neurons that fired, strongest first. */
  open: number[];
  /** What the firing neurons add to the word. */
  out: Float32Array;
}

export function runMemory(model: Model, x: Float32Array): MemoryRun {
  const neurons = factNeurons(model);
  const match = new Float32Array(neurons.length);
  const activation = new Float32Array(neurons.length);
  neurons.forEach((nr, i) => {
    let z = nr.b;
    for (let d = 0; d < x.length; d++) z += nr.w[d]! * x[d]!;
    match[i] = z;
    activation[i] = Math.max(0, z);
  });
  const open = Array.from(activation, (a, i) => ({ a, i }))
    .filter((d) => d.a > 0)
    .sort((p, q) => q.a - p.a)
    .map((d) => d.i);
  const out = new Float32Array(model.eDim);
  for (const i of open) {
    const v = neurons[i]!.v;
    const a = activation[i]!;
    for (let d = 0; d < model.eDim; d++) out[d]! += a * v[d]!;
  }
  return { match, activation, open, out };
}

/** One full encoder block over a token list. `mutedHeads` zeroes the listed
 *  heads' outputs. */
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
