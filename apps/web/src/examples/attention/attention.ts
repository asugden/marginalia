// The attention computation, written out step by step.
//
// One head, no batching, no multi-head stacking — and every intermediate kept,
// because the intermediates are the lesson. A production implementation fuses
// all of this into a couple of matrix multiplications; here each stage is a
// separate array the visualization can draw.
//
// Weights come from ./train/build-head.mjs and ship as a static JSON asset.
// See ./README.md for what is real (the embeddings, the arithmetic) and what
// was designed (the behaviour the head was fitted to produce).

/** Raw weights JSON as emitted by build-head.mjs. */
export interface RawHead {
  meta: {
    eDim: number;
    qkDim: number;
    vDim: number;
    note: string;
    source: { name: string; by: string; license: string; url: string };
  };
  sentences: string[];
  vocab: string[];
  /** Row-major [vocab x eDim]. */
  embeddings: number[];
  /** Row-major [qkDim x eDim]. */
  Wq: number[];
  /** Row-major [qkDim x eDim]. */
  Wk: number[];
  /** Row-major [vDim x eDim]. */
  Wv: number[];
}

export interface Head {
  eDim: number;
  qkDim: number;
  vDim: number;
  sentences: string[];
  vocab: string[];
  embed: Map<string, Float32Array>;
  Wq: Float32Array;
  Wk: Float32Array;
  Wv: Float32Array;
  meta: RawHead["meta"];
}

export function loadHead(raw: RawHead): Head {
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
    Wq: new Float32Array(raw.Wq),
    Wk: new Float32Array(raw.Wk),
    Wv: new Float32Array(raw.Wv),
    meta: raw.meta,
  };
}

/** Everything one forward pass produces, at every stage. */
export interface AttentionRun {
  tokens: string[];
  /** Per token: the embedding E (length eDim). */
  E: Float32Array[];
  /** Per token: the query Q = W_Q · E (length qkDim). */
  Q: Float32Array[];
  /** Per token: the key K = W_K · E (length qkDim). */
  K: Float32Array[];
  /** Per token: the value V = W_V · E (length vDim). */
  V: Float32Array[];
  /** scores[i][j] = Q_i · K_j, the raw dot product before scaling. */
  scores: number[][];
  /** scaled[i][j] = scores[i][j] / sqrt(qkDim). */
  scaled: number[][];
  /** weights[i][j] = softmax over row i of `scaled` (each row sums to 1). */
  weights: number[][];
  /** out[i] = sum_j weights[i][j] * V_j (length vDim). */
  out: Float32Array[];
  /** Number of dot products computed: n^2. The O(n^2) claim, as a count. */
  dotProducts: number;
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

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Softmax over one row. Identical arithmetic to the softmax example: subtract
 *  the max for numerical safety, exponentiate, divide by the sum. */
export function softmaxRow(row: number[]): number[] {
  const m = Math.max(...row);
  const e = row.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => (s === 0 ? 0 : x / s));
}

/** Run one attention head over a token list.
 *
 *  `causalMask` reproduces the triangular mask a text generator uses: a token
 *  may not attend to anything after it, because at generation time those
 *  tokens do not exist yet. Masked positions get -Infinity before the softmax,
 *  which makes their weight exactly zero. */
export function runAttention(
  head: Head,
  tokens: string[],
  causalMask = false,
): AttentionRun {
  const { eDim, qkDim, vDim } = head;
  const E = tokens.map(
    (t) => head.embed.get(t) ?? new Float32Array(eDim),
  );
  const Q = E.map((e) => matVec(head.Wq, qkDim, eDim, e));
  const K = E.map((e) => matVec(head.Wk, qkDim, eDim, e));
  const V = E.map((e) => matVec(head.Wv, vDim, eDim, e));

  const n = tokens.length;
  const scaleBy = 1 / Math.sqrt(qkDim);
  const scores: number[][] = [];
  const scaled: number[][] = [];
  const weights: number[][] = [];

  for (let i = 0; i < n; i++) {
    const rowScores: number[] = [];
    const rowScaled: number[] = [];
    for (let j = 0; j < n; j++) {
      const s = dot(Q[i]!, K[j]!);
      rowScores.push(s);
      // The mask is applied after scaling and before the softmax.
      rowScaled.push(causalMask && j > i ? -Infinity : s * scaleBy);
    }
    scores.push(rowScores);
    scaled.push(rowScaled);
    weights.push(softmaxRow(rowScaled));
  }

  const out = weights.map((row) => {
    const o = new Float32Array(vDim);
    for (let j = 0; j < n; j++) {
      const w = row[j]!;
      if (w === 0) continue;
      const v = V[j]!;
      for (let d = 0; d < vDim; d++) o[d]! += w * v[d]!;
    }
    return o;
  });

  return { tokens, E, Q, K, V, scores, scaled, weights, out, dotProducts: n * n };
}

/** Cosine similarity, used to describe how far a token's output has moved from
 *  its own value vector — i.e. how much context it absorbed. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : d / den;
}
