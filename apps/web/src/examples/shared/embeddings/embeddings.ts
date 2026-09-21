// Shared runtime for the word-embedding examples.
//
// Loads a distilled embedding table (see ./train/distill.mjs) and provides the
// handful of operations the teaching pages need: cosine similarity, nearest
// neighbours, and vector arithmetic for analogies.
//
// The table is real — the vectors come from a published model trained on
// billions of words — but reduced to 32 dimensions and quantized to one byte
// per number so the whole thing is ~80 KB over the wire. Every number the
// pages display is decoded from that table; nothing is hard-coded.

/** The distilled table exactly as ./train/distill.mjs writes it. */
export interface RawTable {
  meta: {
    dim: number;
    count: number;
    quantization: string;
    source: {
      name: string;
      by: string;
      trainedOn: string;
      license: string;
      url: string;
    };
    distillation: string;
  };
  words: string[];
  /** Row-major int8: word i occupies [i*dim, (i+1)*dim). */
  vectors: number[];
}

/** A loaded table: unit-length float vectors plus a word -> index map. */
export interface Table {
  dim: number;
  words: string[];
  /** Row-major, unit length. Word i occupies [i*dim, (i+1)*dim). */
  vectors: Float32Array;
  index: Map<string, number>;
  meta: RawTable["meta"];
}

/** Decode int8 -> float and re-normalize. Quantization perturbs the lengths
 *  very slightly; renormalizing here means cosine similarity is a plain dot
 *  product everywhere downstream. */
export function loadTable(raw: RawTable): Table {
  const { dim } = raw.meta;
  const n = raw.words.length;
  const vectors = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) {
    const off = i * dim;
    let norm = 0;
    for (let k = 0; k < dim; k++) {
      const v = (raw.vectors[off + k] ?? 0) / 127;
      vectors[off + k] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let k = 0; k < dim; k++) vectors[off + k] = (vectors[off + k] ?? 0) / norm;
    }
  }
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(raw.words[i]!, i);
  return { dim, words: raw.words, vectors, index, meta: raw.meta };
}

/** The vector for one word, or null if it isn't in the vocabulary. */
export function vectorFor(table: Table, word: string): Float32Array | null {
  const i = table.index.get(word.toLowerCase().trim());
  if (i === undefined) return null;
  return table.vectors.subarray(i * table.dim, (i + 1) * table.dim);
}

/** Cosine similarity. Table vectors are unit length, so for two of them this
 *  is a dot product; we divide by the norms anyway so callers can pass
 *  arbitrary vectors (an analogy result, a sum) without thinking about it. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export interface Neighbour {
  word: string;
  score: number;
  index: number;
}

/** Top-k most similar words to a vector.
 *
 *  `exclude` drops words from the result. This matters for honesty in the
 *  analogy demo: the conventional king - man + woman = queen trick only works
 *  if you exclude the three input words, because the nearest vector to the
 *  result is very often just `king` again. The page exposes that exclusion as
 *  a visible toggle rather than hiding it. */
export function nearest(
  table: Table,
  query: Float32Array,
  k: number,
  exclude: Iterable<string> = [],
): Neighbour[] {
  const skip = new Set<number>();
  for (const w of exclude) {
    const i = table.index.get(w.toLowerCase().trim());
    if (i !== undefined) skip.add(i);
  }

  // Normalize the query once; table rows are already unit length.
  let qn = 0;
  for (let i = 0; i < query.length; i++) qn += query[i]! * query[i]!;
  qn = Math.sqrt(qn) || 1;

  // A bounded insertion sort beats sorting the whole vocabulary: k is small
  // (<= 20) and the vocabulary is a couple of thousand words.
  const best: Neighbour[] = [];
  const { dim, vectors, words } = table;
  for (let i = 0; i < words.length; i++) {
    if (skip.has(i)) continue;
    const off = i * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += query[d]! * vectors[off + d]!;
    const score = dot / qn;
    if (best.length < k) {
      best.push({ word: words[i]!, score, index: i });
      best.sort((a, b) => b.score - a.score);
    } else if (score > best[best.length - 1]!.score) {
      best[best.length - 1] = { word: words[i]!, score, index: i };
      best.sort((a, b) => b.score - a.score);
    }
  }
  return best;
}

/** a - b + c, the classic analogy arithmetic. Returns the raw result vector;
 *  callers decide what to exclude when looking up its neighbours. */
export function analogy(
  a: Float32Array,
  b: Float32Array,
  c: Float32Array,
): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! - b[i]! + c[i]!;
  return out;
}

/** Project a set of vectors to 2D for plotting.
 *
 *  This is PCA over *only the words being shown*, which makes the picture
 *  responsive to the selection — pick a set of animals and the axes arrange
 *  themselves around animals. It is also why the picture must be read with
 *  care, and the pages say so: two words can look far apart in 2D while their
 *  actual similarity in full dimensionality is high. The plot is a shadow, not
 *  the thing itself.
 *
 *  Power iteration with deflation, same method as the offline distiller. No
 *  randomness: the seed direction is deterministic so the plot doesn't jitter
 *  between renders. */
export function projectTo2D(
  vectors: Float32Array[],
  dim: number,
): Array<{ x: number; y: number }> {
  const n = vectors.length;
  if (n === 0) return [];

  const mean = new Float64Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] = (mean[i] ?? 0) + (v[i] ?? 0);
  for (let i = 0; i < dim; i++) mean[i] = (mean[i] ?? 0) / n;

  const centred = vectors.map((v) => {
    const c = new Float64Array(dim);
    for (let i = 0; i < dim; i++) c[i] = (v[i] ?? 0) - (mean[i] ?? 0);
    return c;
  });

  const component = (data: Float64Array[], seed: number): Float64Array => {
    let v = new Float64Array(dim);
    for (let i = 0; i < dim; i++) v[i] = Math.sin((i + 1) * (seed + 1) * 0.7331) + 0.1;
    const norm = (x: Float64Array) => {
      let s = 0;
      for (let i = 0; i < dim; i++) s += x[i]! * x[i]!;
      s = Math.sqrt(s);
      if (s > 0) for (let i = 0; i < dim; i++) x[i] = x[i]! / s;
      return s;
    };
    norm(v);
    for (let it = 0; it < 64; it++) {
      const w = new Float64Array(dim);
      for (const x of data) {
        let d = 0;
        for (let i = 0; i < dim; i++) d += x[i]! * v[i]!;
        if (d === 0) continue;
        for (let i = 0; i < dim; i++) w[i] = w[i]! + x[i]! * d;
      }
      if (norm(w) === 0) break;
      v = w;
    }
    return v;
  };

  const pc1 = component(centred, 0);
  // Deflate, then find the next direction.
  for (const x of centred) {
    let d = 0;
    for (let i = 0; i < dim; i++) d += x[i]! * pc1[i]!;
    for (let i = 0; i < dim; i++) x[i] = x[i]! - d * pc1[i]!;
  }
  const pc2 = component(centred, 1);

  return vectors.map((v) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < dim; i++) {
      const c = (v[i] ?? 0) - (mean[i] ?? 0);
      x += c * pc1[i]!;
      y += c * pc2[i]!;
    }
    return { x, y };
  });
}
