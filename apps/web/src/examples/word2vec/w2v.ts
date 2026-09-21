// Runtime for the word2vec example.
//
// Two jobs: turn a sentence into the (centre word, context word) training
// pairs a skip-gram model actually learns from, and run a small forward pass
// so the network figure has live numbers flowing through it.
//
// The embedding table is real (see ../shared/embeddings/train/distill.mjs).
// The *decoder* is not shipped — a real word2vec decoder is another full
// vocabulary-sized matrix, and the page's point is precisely that the decoder
// gets thrown away. So we synthesize one deterministically for the figure and
// say so on the page. Everything the student is invited to trust — neighbours,
// similarities, analogies — comes from the real table.

import type { Table } from "../shared/embeddings/embeddings.js";
import { cosine, nearest, vectorFor } from "../shared/embeddings/embeddings.js";

/** One word's bag of context: every word that appeared within `window` of it,
 *  counted, with order discarded.
 *
 *  This is the continuous-bag-of-words view of the training signal, and it is
 *  what the network figure downstream actually models: one word in, a *set* of
 *  context words out. Emitting (centre, context) pairs instead would be the
 *  skip-gram formulation — same underlying idea, but it hides the thing worth
 *  seeing here, which is that the target is a bag with no order in it. */
export function bagFor(
  occurrences: Array<{ before: string[]; target: string; after: string[] }>,
  window: number,
): Array<{ word: string; count: number }> {
  const counts = new Map<string, number>();
  for (const o of occurrences) {
    const left = o.before.slice(Math.max(0, o.before.length - window));
    const right = o.after.slice(0, window);
    for (const w of [...left, ...right]) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** A deterministic stand-in decoder for the network figure.
 *
 *  Built from the real embeddings rather than from noise: each word's decoder
 *  row is its own embedding. A trained decoder row scores "does the hidden
 *  layer look like the context this word appears in", and since words with
 *  similar contexts have similar embeddings, the word's own vector is a close
 *  enough stand-in for the figure — the softmax peaks on words related to the
 *  input, which is what a trained model does.
 *
 *  It is a stand-in, and the page says so. A real skip-gram decoder is learned
 *  alongside the encoder and is the same size as it — which is exactly why
 *  discarding it halves the model, the point the page is making. */
export function syntheticDecoder(
  table: Table,
  words: string[],
  dims: number,
): Float32Array {
  const out = new Float32Array(words.length * dims);
  words.forEach((w, r) => {
    const v = vectorFor(table, w);
    for (let c = 0; c < dims; c++) {
      // A real decoder row scores "how much does the hidden layer look like
      // this word's context". Using the word's own embedding as its decoder
      // row reproduces that behaviour closely enough for the figure: the
      // softmax then peaks on words whose vectors resemble the input's.
      out[r * dims + c] = v?.[c] ?? 0;
    }
  });
  return out;
}

/** Encoder rows for the words shown in the figure: each word's embedding,
 *  truncated to the dimensions the figure draws. */
export function encoderRows(
  table: Table,
  words: string[],
  dims: number,
): Float32Array {
  const out = new Float32Array(words.length * dims);
  words.forEach((w, r) => {
    const v = vectorFor(table, w);
    for (let c = 0; c < dims; c++) out[r * dims + c] = v?.[c] ?? 0;
  });
  return out;
}

export interface ForwardResult {
  /** The hidden layer: the input word's embedding row. */
  hidden: Float32Array;
  /** Softmax over the shown words. */
  outputs: number[];
}

/** One-hot in, embedding out, scores over the shown vocabulary.
 *
 *  This is the whole of a skip-gram forward pass. The one-hot input makes the
 *  first matrix multiply a *lookup* — multiplying a one-hot vector by a matrix
 *  just selects one row — which is why an embedding table and a weight matrix
 *  are the same object viewed two ways, and why the figure can label the
 *  hidden layer "the embedding" without cheating. */
export function forward(
  encoder: Float32Array,
  decoder: Float32Array,
  dims: number,
  wordCount: number,
  inputIndex: number,
): ForwardResult {
  const hidden = new Float32Array(dims);
  if (inputIndex >= 0) {
    for (let c = 0; c < dims; c++) hidden[c] = encoder[inputIndex * dims + c] ?? 0;
  }

  const logits = new Array<number>(wordCount).fill(0);
  for (let r = 0; r < wordCount; r++) {
    let s = 0;
    for (let c = 0; c < dims; c++) s += (decoder[r * dims + c] ?? 0) * hidden[c]!;
    // Vectors are unit length, so the dot product sits in [-1, 1]; this scale
    // gives a distribution that peaks on the input's own word while still
    // leaving visible mass on its neighbours, which is what a trained model
    // does and what the figure needs to show.
    logits[r] = s * 8;
  }
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return { hidden, outputs: exps.map((e) => (sum === 0 ? 0 : e / sum)) };
}

export { cosine, nearest, vectorFor };
