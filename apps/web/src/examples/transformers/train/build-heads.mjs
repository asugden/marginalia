#!/usr/bin/env node
// Builds the multi-head asset for the transformers example.
//
// The attention example ships ONE head, fitted so that nouns attend to their
// adjectives. A transformer runs several heads side by side, each free to find
// a different relationship, so this example needs a few more. It ships three:
//
//   A  adjectives → noun        copied verbatim from the attention example, so
//                               the two pages agree to the last digit
//   B  the little words → noun  "a" and "the" find the noun they belong to
//   C  the verb → its nouns     the verb finds who did it and to what
//
// plus W_O, the matrix that folds the heads' stacked outputs back to the
// model's width. Like W_V in the attention example, W_O is a fixed random
// projection: there is nothing to fit it against without the rest of a
// network, and the page says so.
//
// Heads B and C are fitted exactly the way head A was (same sentences, same
// embeddings, same procedure, same "unbalance" step that keeps W_Q and W_K
// from looking identical). The pipeline below is a copy of the one in
// ../../attention/train/build-head.mjs rather than an import, because that
// script runs on import and this one must not regenerate the attention head.
//
// The embeddings are recomputed and then CHECKED against the attention
// example's — same vocabulary, same PCA, so they must match — and the
// attention example's array is what gets written, byte for byte.
//
// Pure Node (>=18), no deps. Needs the GloVe file the shared distiller caches:
//   node apps/web/src/examples/shared/embeddings/train/distill.mjs
//   node apps/web/src/examples/transformers/train/build-heads.mjs
//   cp apps/web/src/examples/transformers/heads.json \
//      apps/web/public/examples/transformers/heads.json

import { createReadStream } from "node:fs";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const GLOVE = join(
  HERE,
  "..",
  "..",
  "shared",
  "embeddings",
  "train",
  ".vectors-cache",
  "glove.6B.300d.txt",
);
const ATTENTION_HEAD = join(HERE, "..", "..", "attention", "head.json");
const OUT = join(HERE, "..", "heads.json");

// ── Config ────────────────────────────────────────────────────────────────
const E_DIM = 16;
const QK_DIM = 8;
const V_DIM = 16;
const STEPS = 4000;
const LR = 0.08;
const SEED = 1234;

// The attention example's sentences, verbatim. Token positions:
//   0    1        2       3        4          5    6        7
//   a    soggy    greasy  pierogi  conquered  the  crowded  stadium
//   the  rusted   yellow  bridge   crossed    a    frozen   river
//   an   icy      steep   incline  climbed    the  shadowy  hillside
//   the  stubborn old     trolley  rattled    a    narrow   tunnel
const HEADS = [
  {
    name: "adjectives → noun",
    gloss: "a noun collects the words that describe it",
    copyFromAttention: true,
  },
  {
    name: "little words → noun",
    gloss: "“a” and “the” find the noun they belong to",
    targets: [
      { 0: [3], 5: [7] },
      { 0: [3], 5: [7] },
      { 0: [3], 5: [7] },
      { 0: [3], 5: [7] },
    ],
    seed: SEED + 1,
  },
  {
    name: "verb → its nouns",
    gloss: "the verb finds who did it, and to what",
    targets: [{ 4: [3, 7] }, { 4: [3, 7] }, { 4: [3, 7] }, { 4: [3, 7] }],
    seed: SEED + 2,
  },
];

// ── Deterministic PRNG (mulberry32) ───────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Load the words we need from GloVe ─────────────────────────────────────
async function loadWords(words) {
  const want = new Set(words);
  const found = new Map();
  const rl = createInterface({
    input: createReadStream(GLOVE, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const sp = line.indexOf(" ");
    if (sp <= 0) continue;
    const w = line.slice(0, sp);
    if (!want.has(w) || found.has(w)) continue;
    const v = new Float64Array(300);
    let i = 0;
    let p = sp + 1;
    while (i < 300 && p < line.length) {
      let q = line.indexOf(" ", p);
      if (q === -1) q = line.length;
      v[i++] = +line.slice(p, q);
      p = q + 1;
    }
    found.set(w, v);
    if (found.size === want.size) break;
  }
  rl.close();
  const missing = [...want].filter((w) => !found.has(w));
  if (missing.length) throw new Error(`not in GloVe: ${missing.join(", ")}`);
  return found;
}

// ── PCA down to E_DIM (identical to the attention trainer) ────────────────
function reduceTo(vectors, srcDim, outDim, dropFirst = 1) {
  const n = vectors.length;
  const mean = new Float64Array(srcDim);
  for (const v of vectors) for (let i = 0; i < srcDim; i++) mean[i] += v[i];
  for (let i = 0; i < srcDim; i++) mean[i] /= n;
  const X = vectors.map((v) => {
    const c = new Float64Array(srcDim);
    for (let i = 0; i < srcDim; i++) c[i] = v[i] - mean[i];
    return c;
  });
  const norm = (x) => {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    s = Math.sqrt(s);
    if (s > 0) for (let i = 0; i < x.length; i++) x[i] /= s;
    return s;
  };
  const comps = [];
  for (let k = 0; k < outDim + dropFirst; k++) {
    let v = new Float64Array(srcDim);
    for (let i = 0; i < srcDim; i++) v[i] = Math.sin((i + 1) * (k + 1) * 0.7331) + 0.1;
    norm(v);
    for (let it = 0; it < 150; it++) {
      const w = new Float64Array(srcDim);
      for (const x of X) {
        let d = 0;
        for (let i = 0; i < srcDim; i++) d += x[i] * v[i];
        if (d === 0) continue;
        for (let i = 0; i < srcDim; i++) w[i] += x[i] * d;
      }
      if (norm(w) === 0) break;
      v = w;
    }
    comps.push(v);
    for (const x of X) {
      let d = 0;
      for (let i = 0; i < srcDim; i++) d += x[i] * v[i];
      for (let i = 0; i < srcDim; i++) x[i] -= d * v[i];
    }
  }
  const kept = comps.slice(dropFirst);
  return vectors.map((v) => {
    const out = new Float64Array(outDim);
    for (let k = 0; k < outDim; k++) {
      let d = 0;
      for (let i = 0; i < srcDim; i++) d += (v[i] - mean[i]) * kept[k][i];
      out[k] = d;
    }
    norm(out);
    return out;
  });
}

// ── Tiny matrix helpers ───────────────────────────────────────────────────
const mat = (rows, cols) => ({ rows, cols, d: new Float64Array(rows * cols) });

function matVec(M, v) {
  const out = new Float64Array(M.rows);
  for (let r = 0; r < M.rows; r++) {
    let s = 0;
    const off = r * M.cols;
    for (let c = 0; c < M.cols; c++) s += M.d[off + c] * v[c];
    out[r] = s;
  }
  return out;
}

function softmaxRow(z) {
  const m = Math.max(...z);
  const e = z.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

// ── Fit W_Q and W_K so the attention pattern matches the targets ──────────
function fitQK(sentenceTokens, targets, eDim, qkDim, seed) {
  const r = rng(seed);
  const Wq = mat(qkDim, eDim);
  const Wk = mat(qkDim, eDim);
  const init = (M) => {
    const scale = 1 / Math.sqrt(M.cols);
    for (let i = 0; i < M.d.length; i++) M.d[i] = (r() * 2 - 1) * scale;
  };
  init(Wq);
  init(Wk);
  const scale = 1 / Math.sqrt(qkDim);

  for (let step = 0; step < STEPS; step++) {
    const gq = new Float64Array(Wq.d.length);
    const gk = new Float64Array(Wk.d.length);
    let rows = 0;
    for (let s = 0; s < sentenceTokens.length; s++) {
      const E = sentenceTokens[s];
      const n = E.length;
      const tgt = targets[s];
      const Q = E.map((e) => matVec(Wq, e));
      const K = E.map((e) => matVec(Wk, e));
      for (let i = 0; i < n; i++) {
        const p = new Float64Array(n);
        const want = tgt[i];
        if (want && want.length) {
          for (const j of want) p[j] = 1 / want.length;
        } else {
          p[i] = 1;
        }
        const logits = new Array(n);
        for (let j = 0; j < n; j++) {
          let d = 0;
          for (let k = 0; k < qkDim; k++) d += Q[i][k] * K[j][k];
          logits[j] = d * scale;
        }
        const a = softmaxRow(logits);
        rows++;
        for (let j = 0; j < n; j++) {
          const dl = (a[j] - p[j]) * scale;
          if (dl === 0) continue;
          for (let k = 0; k < qkDim; k++) {
            const dQk = dl * K[j][k];
            const dKk = dl * Q[i][k];
            const off = k * eDim;
            for (let c = 0; c < eDim; c++) {
              gq[off + c] += dQk * E[i][c];
              gk[off + c] += dKk * E[j][c];
            }
          }
        }
      }
    }
    for (let i = 0; i < Wq.d.length; i++) Wq.d[i] -= (LR * gq[i]) / rows;
    for (let i = 0; i < Wk.d.length; i++) Wk.d[i] -= (LR * gk[i]) / rows;
  }
  return { Wq, Wk };
}

// ── Pull W_Q and W_K apart without changing the head (see the attention
//    trainer for the full argument: attention only sees W_Q^T W_K). ────────
function unbalance(Wq, Wk, seed, spread = 3) {
  const k = Wq.rows;
  const r = rng(seed);
  const O = [];
  for (let i = 0; i < k; i++) {
    const v = Array.from({ length: k }, () => r() * 2 - 1);
    for (const q of O) {
      let d = 0;
      for (let j = 0; j < k; j++) d += v[j] * q[j];
      for (let j = 0; j < k; j++) v[j] -= d * q[j];
    }
    let n = 0;
    for (let j = 0; j < k; j++) n += v[j] * v[j];
    n = Math.sqrt(n);
    O.push(v.map((x) => x / n));
  }
  const half = (k - 1) / 2;
  const s = Array.from({ length: k }, (_, i) => spread ** ((i - half) / half));
  const apply = (W, scaleOf) => {
    const out = mat(W.rows, W.cols);
    for (let i = 0; i < k; i++) {
      for (let c = 0; c < W.cols; c++) {
        let acc = 0;
        for (let j = 0; j < k; j++) acc += O[i][j] * scaleOf(j) * W.d[j * W.cols + c];
        out.d[i * W.cols + c] = acc;
      }
    }
    return out;
  };
  return { Wq: apply(Wq, (j) => s[j]), Wk: apply(Wk, (j) => 1 / s[j]) };
}

// W_V for the fitted heads, and W_O for the whole layer: fixed random
// projections, as in the attention example. Not fitted; the page says so.
function randomMatrix(rows, cols, seed) {
  const r = rng(seed);
  const M = mat(rows, cols);
  const scale = 1 / Math.sqrt(cols);
  for (let i = 0; i < M.d.length; i++) M.d[i] = (r() * 2 - 1) * scale;
  return M;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const attention = JSON.parse(await readFile(ATTENTION_HEAD, "utf8"));
  const SENTENCES = attention.sentences;
  const tokenized = SENTENCES.map((s) => s.split(" "));
  const vocab = [...new Set(tokenized.flat())].sort();
  if (vocab.join(" ") !== attention.vocab.join(" ")) {
    throw new Error("vocabulary differs from the attention example");
  }
  console.log(`\nbuilding ${HEADS.length} heads for ${SENTENCES.length} sentences, ${vocab.length} words`);

  console.log("  loading GloVe vectors");
  const raw = await loadWords(vocab);
  console.log(`  reducing 300d -> ${E_DIM}d and checking against the attention example`);
  const reduced = reduceTo(vocab.map((w) => raw.get(w)), 300, E_DIM);
  let worst = 0;
  reduced.forEach((v, i) => {
    for (let d = 0; d < E_DIM; d++) {
      worst = Math.max(worst, Math.abs(v[d] - attention.embeddings[i * E_DIM + d]));
    }
  });
  if (worst > 1e-3) throw new Error(`embeddings differ from the attention example by ${worst}`);
  console.log(`  embeddings match (largest difference ${worst.toExponential(1)})`);
  // Use the attention example's rounded values exactly, so E is identical
  // across the two pages.
  const embed = new Map(
    vocab.map((w, i) => [w, Float64Array.from(attention.embeddings.slice(i * E_DIM, (i + 1) * E_DIM))]),
  );
  const sentenceTokens = tokenized.map((toks) => toks.map((t) => embed.get(t)));

  const heads = [];
  for (const [h, spec] of HEADS.entries()) {
    let Wq, Wk, Wv;
    if (spec.copyFromAttention) {
      Wq = { rows: QK_DIM, cols: E_DIM, d: Float64Array.from(attention.Wq) };
      Wk = { rows: QK_DIM, cols: E_DIM, d: Float64Array.from(attention.Wk) };
      Wv = { rows: V_DIM, cols: E_DIM, d: Float64Array.from(attention.Wv) };
      console.log(`\n  head ${h} "${spec.name}": copied from the attention example`);
    } else {
      process.stdout.write(`\n  head ${h} "${spec.name}": fitting`);
      const fitted = fitQK(sentenceTokens, spec.targets, E_DIM, QK_DIM, spec.seed);
      ({ Wq, Wk } = unbalance(fitted.Wq, fitted.Wk, spec.seed + 50));
      Wv = randomMatrix(V_DIM, E_DIM, spec.seed + 99);
      console.log(" done");
    }

    // Report what each head actually does on the first sentence.
    const scale = 1 / Math.sqrt(QK_DIM);
    for (let s = 0; s < 1; s++) {
      const E = sentenceTokens[s];
      const toks = tokenized[s];
      const Q = E.map((e) => matVec(Wq, e));
      const K = E.map((e) => matVec(Wk, e));
      for (let i = 0; i < toks.length; i++) {
        const logits = E.map((_, j) => {
          let d = 0;
          for (let k = 0; k < QK_DIM; k++) d += Q[i][k] * K[j][k];
          return d * scale;
        });
        const a = softmaxRow(logits);
        const top = a
          .map((p, j) => ({ p, w: toks[j] }))
          .sort((x, y) => y.p - x.p)
          .slice(0, 2)
          .map((x) => `${x.w} ${(x.p * 100).toFixed(0)}%`)
          .join(", ");
        console.log(`      ${toks[i].padEnd(10)} -> ${top}`);
      }
    }

    heads.push({
      name: spec.name,
      gloss: spec.gloss,
      Wq: Array.from(Wq.d, (x) => +x.toFixed(4)),
      Wk: Array.from(Wk.d, (x) => +x.toFixed(4)),
      Wv: Array.from(Wv.d, (x) => +x.toFixed(4)),
    });
  }

  const Wo = randomMatrix(E_DIM, HEADS.length * V_DIM, SEED + 7);

  const payload = {
    meta: {
      eDim: E_DIM,
      qkDim: QK_DIM,
      vDim: V_DIM,
      heads: HEADS.length,
      note:
        "Three attention heads over the same 16d GloVe-derived embeddings as the attention example. Head 0 is that example's head verbatim; heads 1 and 2 were fitted by gradient descent to find other relationships. W_V for the fitted heads and W_O are fixed random projections, not fitted. The mechanism on the page is exact; the behaviour was chosen for teachability.",
      source: attention.meta.source,
    },
    sentences: SENTENCES,
    vocab,
    embeddings: attention.embeddings,
    heads,
    // Row-major [eDim x (heads * vDim)]: folds the stacked head outputs back
    // to the model's width.
    Wo: Array.from(Wo.d, (x) => +x.toFixed(4)),
  };
  await writeFile(OUT, JSON.stringify(payload));
  const { size } = await stat(OUT);
  console.log(`\n  wrote ${OUT} (${(size / 1024).toFixed(1)} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
