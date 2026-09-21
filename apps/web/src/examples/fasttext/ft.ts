// Runtime for the fastText example.
//
// One idea, and everything here serves it: a word is not an atom. fastText
// treats a word as a bag of character n-grams and builds its vector by adding
// up the pieces — which means it can embed a word it has never seen, because
// it has seen the pieces.
//
// See ./README.md for what is real (the word vectors, the arithmetic) and what
// is reconstructed (the n-gram vectors, recovered from the word table because
// the published release does not ship them).

import type { Table } from "../shared/embeddings/embeddings.js";
import { cosine, nearest, vectorFor } from "../shared/embeddings/embeddings.js";

/** The n-gram table exactly as ./train/build-ngrams.mjs writes it. */
export interface RawGrams {
  meta: {
    dim: number;
    count: number;
    minN: number;
    maxN: number;
    quantization: string;
    derivation: string;
    source: { name: string; by: string; license: string; url: string };
  };
  grams: string[];
  /** How many vocabulary words contain each gram. */
  counts: number[];
  vectors: number[];
}

export interface GramTable {
  dim: number;
  minN: number;
  maxN: number;
  grams: string[];
  counts: number[];
  vectors: Float32Array;
  index: Map<string, number>;
  meta: RawGrams["meta"];
}

export function loadGrams(raw: RawGrams): GramTable {
  const { dim } = raw.meta;
  const n = raw.grams.length;
  const vectors = new Float32Array(n * dim);
  for (let i = 0; i < n * dim; i++) vectors[i] = (raw.vectors[i] ?? 0) / 127;
  const index = new Map<string, number>();
  raw.grams.forEach((g, i) => index.set(g, i));
  return {
    dim,
    minN: raw.meta.minN,
    maxN: raw.meta.maxN,
    grams: raw.grams,
    counts: raw.counts,
    vectors,
    index,
    meta: raw.meta,
  };
}

/** The character n-grams of a word, in fastText's bracketed form.
 *
 *  The angle brackets matter: they make a prefix distinguishable from the same
 *  letters in the middle of a word. `<un` is "starts with un"; `un` on its own
 *  is just "contains un". Same for `ing>` versus `ing`. MUST stay in sync with
 *  gramsOf() in ./train/build-ngrams.mjs. */
export function gramsOf(word: string, minN = 3, maxN = 6): string[] {
  const padded = `<${word.toLowerCase().trim()}>`;
  const out: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= padded.length; i++) out.push(padded.slice(i, i + n));
  }
  return out;
}

export interface GramPiece {
  gram: string;
  /** Index into the gram table, or -1 if this piece was never seen. */
  index: number;
  /** How many vocabulary words contain it (0 when unseen). */
  count: number;
  /** How much this piece pulled the result — cosine(piece, total). */
  pull: number;
}

export interface BuiltWord {
  word: string;
  /** True when the word has its own entry in the word table. */
  inVocabulary: boolean;
  /** The vector, whether looked up or assembled. */
  vector: Float32Array | null;
  /** The pieces, with the ones that were never seen marked. */
  pieces: GramPiece[];
  /** How many pieces were recognized. */
  known: number;
}

/** Build a word's vector out of its character n-grams.
 *
 *  This is fastText's actual mechanism: sum the vectors of the pieces, then
 *  normalize. A word already in the vocabulary would have its own vector added
 *  to the sum too; here we keep the two separate so the page can show them
 *  side by side and ask whether the pieces alone got close. */
export function buildFromGrams(
  grams: GramTable,
  word: string,
): { vector: Float32Array | null; pieces: GramPiece[]; known: number } {
  const wanted = gramsOf(word, grams.minN, grams.maxN);
  const sum = new Float32Array(grams.dim);
  const pieces: GramPiece[] = [];
  let known = 0;

  for (const g of wanted) {
    const i = grams.index.get(g) ?? -1;
    if (i >= 0) {
      known++;
      const off = i * grams.dim;
      for (let k = 0; k < grams.dim; k++) sum[k]! += grams.vectors[off + k]!;
    }
    pieces.push({ gram: g, index: i, count: i >= 0 ? (grams.counts[i] ?? 0) : 0, pull: 0 });
  }

  if (known === 0) return { vector: null, pieces, known };

  // Normalize; every downstream use is cosine similarity.
  let norm = 0;
  for (let k = 0; k < grams.dim; k++) norm += sum[k]! * sum[k]!;
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < grams.dim; k++) sum[k]! /= norm;

  // How much did each piece pull toward the answer? This is what makes the
  // figure readable: the student can see that `ffee` did the work in
  // `coffeeshop`, not `<co` or `hop>`.
  for (const p of pieces) {
    if (p.index < 0) continue;
    const off = p.index * grams.dim;
    let d = 0;
    for (let k = 0; k < grams.dim; k++) d += sum[k]! * grams.vectors[off + k]!;
    p.pull = d;
  }

  return { vector: sum, pieces, known };
}

/** Everything the page needs about one typed word. */
export function analyze(
  table: Table,
  grams: GramTable,
  word: string,
): BuiltWord {
  const clean = word.toLowerCase().trim();
  const own = vectorFor(table, clean);
  const built = buildFromGrams(grams, clean);
  return {
    word: clean,
    inVocabulary: own !== null,
    vector: built.vector,
    pieces: built.pieces,
    known: built.known,
  };
}

export { cosine, nearest, vectorFor };
