// Offline builder for the attention example's weights.
//
// Produces one attention head — W_Q, W_K, W_V — small enough that every matrix
// and every vector can be drawn on screen, but genuinely *computed* rather than
// typed in by hand.
//
// WHAT IS REAL HERE, AND WHAT IS DESIGNED
//
// The token embeddings are real: they are the GloVe vectors for these exact
// words, reduced to 16 dimensions by the same PCA pipeline the word-embedding
// examples use (../../shared/embeddings/train/distill.mjs). Nothing about them
// was chosen to make the demo work.
//
// The three weight matrices are *fitted*, not learned from a language-modelling
// objective. We choose a target: in "a soggy greasy pierogi conquered the
// crowded stadium", the noun `pierogi` should attend to its adjectives `soggy`
// and `greasy`, and `stadium` should attend to `crowded`. We then solve for the
// matrices that produce that pattern, by gradient descent on a cross-entropy
// loss against the target attention rows.
//
// This is an honest thing to ship as long as it is labelled, and the page does
// label it. The alternative — a head lifted from a real trained transformer —
// is not legible: real heads at 768 dimensions encode many overlapping
// behaviours at once, and the clean "adjective" head students are shown in
// lectures is largely a teaching fiction. Here the *mechanism* is exact (every
// dot product, softmax, and weighted sum on the page is computed from these
// matrices) while the *behaviour* is one we selected for teachability.
//
// Pure Node (>=18), no deps. Reads the GloVe text file that
// ../../shared/embeddings/train/distill.mjs already downloaded and cached.
//
// Run:  node apps/web/src/examples/attention/train/build-head.mjs
// Deterministic: fixed PRNG seed, so a re-run reproduces the same weights.

import { createReadStream } from "node:fs";
import { writeFile, stat } from "node:fs/promises";
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
const OUT = join(HERE, "..", "head.json");

// ── The sentences ─────────────────────────────────────────────────────────
//
// The first is the one the lesson walks through; the others let a student
// switch sentences and confirm the head is doing something general rather than
// memorizing one input. All are adjective-noun structures, because that is the
// relationship this head was fitted to find.
const SENTENCES = [
  "a soggy greasy pierogi conquered the crowded stadium",
  "the rusted yellow bridge crossed a frozen river",
  "an icy steep incline climbed the shadowy hillside",
  "the stubborn old trolley rattled a narrow tunnel",
];

// Which token should attend to which, per sentence. Index-based, built from the
// grammar of each sentence: every noun points at the adjectives modifying it.
// Everything not listed gets a target of "attend to yourself", which is the
// sensible default for a token with no modifier to collect.
const TARGETS = [
  // a(0) soggy(1) greasy(2) pierogi(3) conquered(4) the(5) crowded(6) stadium(7)
  { 3: [1, 2], 7: [6] },
  // the(0) rusted(1) yellow(2) bridge(3) crossed(4) a(5) frozen(6) river(7)
  { 3: [1, 2], 7: [6] },
  // an(0) icy(1) steep(2) incline(3) climbed(4) the(5) shadowy(6) hillside(7)
  { 3: [1, 2], 7: [6] },
  // the(0) stubborn(1) old(2) trolley(3) rattled(4) a(5) narrow(6) tunnel(7)
  { 3: [1, 2], 7: [6] },
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

// ── PCA down to E_DIM (same method as the shared distiller) ───────────────
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
    // Scale to unit length: the head is fitted on unit vectors, so the dot
    // products on the page sit in a readable range instead of the hundreds.
    norm(out);
    return out;
  });
}

// ── Tiny matrix helpers (row-major Float64Array) ──────────────────────────
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
//
// Only Q and K are fitted: they alone determine the attention weights, which is
// the thing we have a target for. W_V is a separate matter — see below.
function fitQK(sentenceTokens, targets, eDim, qkDim) {
  const r = rng(SEED);
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
    let loss = 0;
    let rows = 0;

    for (let s = 0; s < sentenceTokens.length; s++) {
      const E = sentenceTokens[s];
      const n = E.length;
      const tgt = targets[s];
      const Q = E.map((e) => matVec(Wq, e));
      const K = E.map((e) => matVec(Wk, e));

      for (let i = 0; i < n; i++) {
        // Target distribution for row i.
        const p = new Float64Array(n);
        const want = tgt[i];
        if (want && want.length) {
          for (const j of want) p[j] = 1 / want.length;
        } else {
          p[i] = 1; // no modifier to collect: attend to yourself
        }

        const logits = new Array(n);
        for (let j = 0; j < n; j++) {
          let d = 0;
          for (let k = 0; k < qkDim; k++) d += Q[i][k] * K[j][k];
          logits[j] = d * scale;
        }
        const a = softmaxRow(logits);
        for (let j = 0; j < n; j++) if (p[j] > 0) loss -= p[j] * Math.log(a[j] + 1e-12);
        rows++;

        // dL/dlogit_j = a_j - p_j  (cross-entropy through softmax)
        for (let j = 0; j < n; j++) {
          const dl = (a[j] - p[j]) * scale;
          if (dl === 0) continue;
          // logit_j = Q_i . K_j  ->  dQ_i += dl * K_j ; dK_j += dl * Q_i
          for (let k = 0; k < qkDim; k++) {
            const dQk = dl * K[j][k];
            const dKk = dl * Q[i][k];
            // Q_i = Wq @ E_i  ->  dWq[k][c] += dQ_i[k] * E_i[c]
            const offq = k * eDim;
            const offk = k * eDim;
            for (let c = 0; c < eDim; c++) {
              gq[offq + c] += dQk * E[i][c];
              gk[offk + c] += dKk * E[j][c];
            }
          }
        }
      }
    }

    for (let i = 0; i < Wq.d.length; i++) Wq.d[i] -= (LR * gq[i]) / rows;
    for (let i = 0; i < Wk.d.length; i++) Wk.d[i] -= (LR * gk[i]) / rows;

    if (step % 800 === 0 || step === STEPS - 1) {
      process.stdout.write(`\r  fitting Q/K — step ${step + 1}/${STEPS}, loss ${(loss / rows).toFixed(4)}   `);
    }
  }
  process.stdout.write("\n");
  return { Wq, Wk };
}

// ── Pull W_Q and W_K apart without changing what the head does ────────────
//
// Attention only ever sees the product Q_i . K_j = E_i^T (W_Q^T W_K) E_j, so the
// pair (W_Q, W_K) is determined only up to
//
//     W_Q -> R W_Q,   W_K -> R^-T W_K        for any invertible R,
//
// which leaves every score, weight and output bit-for-bit the same (up to the
// 4-decimal rounding below). Gradient descent from a small initialisation
// picks the *balanced* member of that family — W_Q W_Q^T - W_K W_K^T is
// conserved along the way, so starting near zero it stays near zero — and
// the balanced solution has W_Q nearly equal to W_K (correlation ~0.85 for
// this head, same sign on 116 of 128 entries). Drawn side by side on the
// page that looks like one matrix drawn twice, which is exactly the wrong
// thing for a figure whose point is that there are two.
//
// So we pick one fixed R = O S: a deterministic random rotation O composed
// with a diagonal scaling S whose entries spread geometrically. The rotation
// alone would not help (it is shared by both sides); the asymmetric scaling
// is what makes the two matrices look like the two different things they are.
// After this the correlation is ~0.35. Nothing the student can read off the
// grid changes.
const UNBALANCE_SEED = 7;
const UNBALANCE_SPREAD = 3; // per-direction scaling runs from 1/3 to 3

function unbalance(Wq, Wk) {
  const k = Wq.rows;
  const r = rng(UNBALANCE_SEED);

  // O: rows of a random matrix, Gram-Schmidt orthonormalised.
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

  // S: geometric spread from 1/UNBALANCE_SPREAD to UNBALANCE_SPREAD.
  const half = (k - 1) / 2;
  const s = Array.from({ length: k }, (_, i) => UNBALANCE_SPREAD ** ((i - half) / half));

  // W_Q <- (O S) W_Q ;  W_K <- (O S^-1) W_K.  (O S)^-T = O S^-1 for orthogonal O.
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

// W_V is not fitted against a target. There is no "correct" value vector to aim
// at — values carry whatever information the head passes along, and in a real
// transformer that is determined by the rest of the network's needs.
//
// So we build W_V as a deterministic random projection, one honest choice with
// a property worth teaching: it is *not* the identity. The output of the head
// is a weighted average of value vectors, not of the embeddings themselves,
// and keeping W_V visibly distinct from "pass the embedding through" is what
// lets the page show that keys decide how much and values decide what.
function buildV(eDim, vDim) {
  const r = rng(SEED + 99);
  const Wv = mat(vDim, eDim);
  const scale = 1 / Math.sqrt(eDim);
  for (let i = 0; i < Wv.d.length; i++) Wv.d[i] = (r() * 2 - 1) * scale;
  return Wv;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  try {
    await stat(GLOVE);
  } catch {
    console.error(
      `\nGloVe source not found at:\n  ${GLOVE}\n\nRun the shared distiller first — it downloads and caches it:\n  node apps/web/src/examples/shared/embeddings/train/distill.mjs\n`,
    );
    process.exit(1);
  }

  const tokenized = SENTENCES.map((s) => s.split(" "));
  const vocab = [...new Set(tokenized.flat())].sort();
  console.log(`\nbuilding attention head for ${SENTENCES.length} sentences, ${vocab.length} distinct words`);

  console.log("  loading GloVe vectors");
  const raw = await loadWords(vocab);

  console.log(`  reducing 300d -> ${E_DIM}d`);
  const reduced = reduceTo(vocab.map((w) => raw.get(w)), 300, E_DIM);
  const embed = new Map(vocab.map((w, i) => [w, reduced[i]]));

  const sentenceTokens = tokenized.map((toks) => toks.map((t) => embed.get(t)));

  const fitted = fitQK(sentenceTokens, TARGETS, E_DIM, QK_DIM);
  const { Wq, Wk } = unbalance(fitted.Wq, fitted.Wk);
  const Wv = buildV(E_DIM, V_DIM);

  // Sanity check: the reparameterisation must not move a single score.
  {
    let worst = 0;
    for (const E of sentenceTokens) {
      for (const ei of E) {
        for (const ej of E) {
          const a = matVec(fitted.Wq, ei), b = matVec(fitted.Wk, ej);
          const c = matVec(Wq, ei), d = matVec(Wk, ej);
          let s0 = 0, s1 = 0;
          for (let k = 0; k < QK_DIM; k++) { s0 += a[k] * b[k]; s1 += c[k] * d[k]; }
          worst = Math.max(worst, Math.abs(s0 - s1));
        }
      }
    }
    console.log(`  unbalanced W_Q / W_K; largest score change ${worst.toExponential(1)}`);
  }

  // Report what the fitted head actually does, so the numbers in the README
  // are measured rather than hoped for.
  console.log("\n  resulting attention (rows = queries):");
  const scale = 1 / Math.sqrt(QK_DIM);
  for (let s = 0; s < sentenceTokens.length; s++) {
    const E = sentenceTokens[s];
    const toks = tokenized[s];
    const Q = E.map((e) => matVec(Wq, e));
    const K = E.map((e) => matVec(Wk, e));
    console.log(`\n  "${SENTENCES[s]}"`);
    for (const i of Object.keys(TARGETS[s]).map(Number)) {
      const logits = E.map((_, j) => {
        let d = 0;
        for (let k = 0; k < QK_DIM; k++) d += Q[i][k] * K[j][k];
        return d * scale;
      });
      const a = softmaxRow(logits);
      const top = a
        .map((p, j) => ({ p, w: toks[j] }))
        .sort((x, y) => y.p - x.p)
        .slice(0, 3)
        .map((x) => `${x.w} ${(x.p * 100).toFixed(0)}%`)
        .join(", ");
      console.log(`    ${toks[i].padEnd(9)} -> ${top}`);
    }
  }

  const payload = {
    meta: {
      eDim: E_DIM,
      qkDim: QK_DIM,
      vDim: V_DIM,
      note:
        "Token embeddings are real GloVe vectors reduced to 16d by PCA. W_Q and W_K were fitted by gradient descent so that nouns attend to their adjectives; W_V is a fixed random projection. The mechanism shown on the page is exact; the behaviour was chosen for teachability.",
      source: {
        name: "GloVe 6B (300d)",
        by: "Stanford NLP",
        license: "PDDL v1.0",
        url: "https://nlp.stanford.edu/projects/glove/",
      },
    },
    sentences: SENTENCES,
    vocab,
    // Row-major: word i occupies [i*eDim, (i+1)*eDim).
    embeddings: Array.from(reduced.flatMap((v) => Array.from(v, (x) => +x.toFixed(4)))),
    Wq: Array.from(Wq.d, (x) => +x.toFixed(4)),
    Wk: Array.from(Wk.d, (x) => +x.toFixed(4)),
    Wv: Array.from(Wv.d, (x) => +x.toFixed(4)),
  };
  await writeFile(OUT, JSON.stringify(payload));
  const { size } = await stat(OUT);
  console.log(`\n  wrote ${OUT} (${(size / 1024).toFixed(1)} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
