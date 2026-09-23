#!/usr/bin/env node
// Offline trainer for the recurrent-network example.
//
// Trains two tiny sequence models on the same job, twice each, and ships
// all four plus the weights they started from:
//
//   rnn       a plain tanh recurrent network — one state vector, carried forward
//   lstm      the same thing with a cell state and three gates
//   rnnFar    the plain network again, trained only on sentences where the
//             negation is far from the adjective (12–20 words)
//   lstmFar   the LSTM, trained on the same far-only sentences
//   rnnInit   the plain network before any training (same seed), so the page
//             can show what the gradient looks like when learning has to start
//
// The job: read a short review one word at a time and say whether it is
// positive. The catch that makes it a MEMORY task is negation with a gap:
// "the film was not, in the end, all that good" is negative, and the "not"
// has to survive every filler word between it and "good".
//
// The near-trained pair (gaps 0–6) both learn, and both turn out to carry the
// flag far past anything they saw. The far-trained pair is the classic
// experiment: with the dependency always distant, the plain network never
// learns to use the negation at all — it just reads the adjective — while
// the LSTM learns it in a few hundred steps. That is the vanishing gradient,
// measured, and the page shows it rather than asserting it.
//
// The sentences are synthetic — templates over a ~70-word vocabulary — and
// the page says so. What is real is everything computed from the shipped
// weights: every state, gate, verdict and gradient factor on the page comes
// out of these two networks running live in the browser.
//
// Pure Node (>=18), no deps. Deterministic (fixed PRNG seed).
//   node apps/web/src/examples/rnn/train/train.mjs
//   cp apps/web/src/examples/rnn/weights.json apps/web/public/examples/rnn/weights.json

import { writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "weights.json");

// ── Config ────────────────────────────────────────────────────────────────
const D = 8; // embedding width
const H = 12; // state width (both models)
const STEPS = 5000; // optimizer steps
const BATCH = 32; // sentences per step
const LR = 0.01;
const CLIP = 5; // gradient-norm clip — the exploding side of the lesson
const SEED = 7;
const MAX_TRAIN_GAP = 6; // filler words between negation and adjective, near-trained models
const FAR_GAP = [12, 20]; // the far-trained pair only ever sees gaps in this range
// How often a training sentence is negated. NOT one half: at exactly one half
// the label is a pure XOR of "was there a negation" and "is the adjective
// positive", no single word carries any signal on its own, and a plain tanh
// network sits at a flat point and never starts. At about a third the
// adjective alone gets it most of the way, and the network then learns to
// flip on the negation — which is the part of the job that needs memory.
const P_NEGATE = 0.35;
const MAX_REPORT_GAP = 24; // how far the report stretches the gap

// ── The tiny language ─────────────────────────────────────────────────────
const SUBJECTS = [
  ["the", "film"],
  ["the", "book"],
  ["the", "meal"],
  ["this", "show"],
  ["that", "game"],
  ["the", "play"],
  ["the", "hotel"],
  ["the", "concert"],
];
const VERBS = ["was", "is", "seemed", "felt", "looked"];
const NEGATIONS = ["not", "never", "hardly"];
const INTENSIFIERS = ["really", "very", "quite", "truly", "so"];
// Neutral filler phrases. They carry no sentiment; their only job is to put
// distance between the negation and the adjective it flips.
const FILLERS = [
  ["honestly"],
  ["frankly"],
  ["overall"],
  ["somehow"],
  ["in", "the", "end"],
  ["all", "that"],
  ["to", "be", "fair"],
  ["by", "any", "measure"],
  ["if", "i", "am", "honest"],
  ["on", "reflection"],
  ["in", "my", "view"],
  ["as", "it", "turned", "out"],
];
const POSITIVE = ["good", "great", "lovely", "brilliant", "wonderful", "fun", "superb"];
const NEGATIVE = ["bad", "awful", "dull", "boring", "terrible", "poor", "weak"];

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
const rand = rng(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

/** Exactly `n` filler tokens, built from whole phrases. Single-word phrases
 *  exist, so any n is reachable. */
function fillerTokens(n) {
  const out = [];
  while (out.length < n) {
    const room = n - out.length;
    const fits = FILLERS.filter((p) => p.length <= room);
    out.push(...pick(fits));
  }
  return out;
}

/** One training sentence. `gap` fixes the filler count; `negate` fixes the
 *  template when given, otherwise both are drawn at random from `range`. */
function sample({ gap = null, negate = null, range = [0, MAX_TRAIN_GAP] } = {}) {
  const positive = rand() < 0.5;
  const adj = pick(positive ? POSITIVE : NEGATIVE);
  const neg = negate ?? rand() < P_NEGATE;
  const g = gap ?? range[0] + Math.floor(rand() * (range[1] - range[0] + 1));
  const lead = rand() < 0.15 ? fillerTokens(1 + Math.floor(rand() * 3)) : [];
  const intens = rand() < 0.3 ? [pick(INTENSIFIERS)] : [];
  const toks = [
    ...lead,
    ...pick(SUBJECTS),
    pick(VERBS),
    ...(neg ? [pick(NEGATIONS)] : []),
    ...fillerTokens(g),
    ...intens,
    adj,
  ];
  return { toks, label: (neg ? !positive : positive) ? 1 : 0 };
}

const VOCAB = [
  ...new Set([
    ...SUBJECTS.flat(),
    ...VERBS,
    ...NEGATIONS,
    ...INTENSIFIERS,
    ...FILLERS.flat(),
    ...POSITIVE,
    ...NEGATIVE,
  ]),
].sort();
const INDEX = new Map(VOCAB.map((w, i) => [w, i]));
const V = VOCAB.length;

// ── Parameters and Adam ───────────────────────────────────────────────────
function param(size, scale) {
  const v = new Float64Array(size);
  for (let i = 0; i < size; i++) v[i] = (rand() * 2 - 1) * scale;
  return { v, g: new Float64Array(size), m: new Float64Array(size), s: new Float64Array(size) };
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function adamStep(params, step) {
  // Global-norm clipping first: the practical answer to exploding gradients.
  let norm = 0;
  for (const p of params) for (let i = 0; i < p.g.length; i++) norm += p.g[i] * p.g[i];
  norm = Math.sqrt(norm);
  const scale = norm > CLIP ? CLIP / norm : 1;
  const b1 = 0.9;
  const b2 = 0.999;
  for (const p of params) {
    for (let i = 0; i < p.v.length; i++) {
      const g = p.g[i] * scale;
      p.m[i] = b1 * p.m[i] + (1 - b1) * g;
      p.s[i] = b2 * p.s[i] + (1 - b2) * g * g;
      const mh = p.m[i] / (1 - b1 ** step);
      const sh = p.s[i] / (1 - b2 ** step);
      p.v[i] -= (LR * mh) / (Math.sqrt(sh) + 1e-8);
      p.g[i] = 0;
    }
  }
  return norm;
}

// ── The plain recurrent network ───────────────────────────────────────────
//   h_t = tanh(Wx·x_t + Wh·h_{t-1} + b);  logit = wo·h_T + bo
function makeRNN() {
  return {
    emb: param(V * D, 0.5),
    Wx: param(H * D, 1 / Math.sqrt(D)),
    Wh: param(H * H, 1 / Math.sqrt(H)),
    b: param(H, 0),
    wo: param(H, 1 / Math.sqrt(H)),
    bo: param(1, 0),
  };
}

function rnnForward(P, ids) {
  const hs = [new Float64Array(H)];
  for (const id of ids) {
    const prev = hs[hs.length - 1];
    const h = new Float64Array(H);
    for (let r = 0; r < H; r++) {
      let a = P.b.v[r];
      for (let c = 0; c < D; c++) a += P.Wx.v[r * D + c] * P.emb.v[id * D + c];
      for (let c = 0; c < H; c++) a += P.Wh.v[r * H + c] * prev[c];
      h[r] = Math.tanh(a);
    }
    hs.push(h);
  }
  const hT = hs[hs.length - 1];
  let logit = P.bo.v[0];
  for (let r = 0; r < H; r++) logit += P.wo.v[r] * hT[r];
  return { hs, logit, p: sigmoid(logit) };
}

function rnnBackward(P, ids, fwd, y) {
  const { hs, p } = fwd;
  const T = ids.length;
  const dlogit = p - y;
  P.bo.g[0] += dlogit;
  let dh = new Float64Array(H);
  for (let r = 0; r < H; r++) {
    P.wo.g[r] += dlogit * hs[T][r];
    dh[r] = dlogit * P.wo.v[r];
  }
  for (let t = T; t >= 1; t--) {
    const h = hs[t];
    const prev = hs[t - 1];
    const id = ids[t - 1];
    const da = new Float64Array(H);
    for (let r = 0; r < H; r++) da[r] = dh[r] * (1 - h[r] * h[r]);
    const dprev = new Float64Array(H);
    for (let r = 0; r < H; r++) {
      P.b.g[r] += da[r];
      for (let c = 0; c < D; c++) {
        P.Wx.g[r * D + c] += da[r] * P.emb.v[id * D + c];
        P.emb.g[id * D + c] += da[r] * P.Wx.v[r * D + c];
      }
      for (let c = 0; c < H; c++) {
        P.Wh.g[r * H + c] += da[r] * prev[c];
        dprev[c] += da[r] * P.Wh.v[r * H + c];
      }
    }
    dh = dprev;
  }
}

// ── The LSTM ──────────────────────────────────────────────────────────────
//   z = W·[x_t ; h_{t-1}] + b, split into i, f, o, g
//   c_t = f ⊙ c_{t-1} + i ⊙ tanh(g);  h_t = o ⊙ tanh(c_t)
const Z = D + H;
function makeLSTM() {
  const b = param(4 * H, 0);
  // Forget gate starts open (bias +1): the standard trick, and the one the
  // page's story turns on — the notebook keeps what it has unless told not to.
  for (let r = H; r < 2 * H; r++) b.v[r] = 1;
  return {
    emb: param(V * D, 0.5),
    W: param(4 * H * Z, 1 / Math.sqrt(Z)),
    b,
    wo: param(H, 1 / Math.sqrt(H)),
    bo: param(1, 0),
  };
}

function lstmForward(P, ids) {
  const steps = [];
  let h = new Float64Array(H);
  let c = new Float64Array(H);
  for (const id of ids) {
    const zin = new Float64Array(Z);
    for (let k = 0; k < D; k++) zin[k] = P.emb.v[id * D + k];
    for (let k = 0; k < H; k++) zin[D + k] = h[k];
    const i = new Float64Array(H);
    const f = new Float64Array(H);
    const o = new Float64Array(H);
    const g = new Float64Array(H);
    for (let r = 0; r < H; r++) {
      let zi = P.b.v[r];
      let zf = P.b.v[H + r];
      let zo = P.b.v[2 * H + r];
      let zg = P.b.v[3 * H + r];
      for (let k = 0; k < Z; k++) {
        const x = zin[k];
        zi += P.W.v[r * Z + k] * x;
        zf += P.W.v[(H + r) * Z + k] * x;
        zo += P.W.v[(2 * H + r) * Z + k] * x;
        zg += P.W.v[(3 * H + r) * Z + k] * x;
      }
      i[r] = sigmoid(zi);
      f[r] = sigmoid(zf);
      o[r] = sigmoid(zo);
      g[r] = Math.tanh(zg);
    }
    const cNew = new Float64Array(H);
    const hNew = new Float64Array(H);
    for (let r = 0; r < H; r++) {
      cNew[r] = f[r] * c[r] + i[r] * g[r];
      hNew[r] = o[r] * Math.tanh(cNew[r]);
    }
    steps.push({ zin, i, f, o, g, cPrev: c, c: cNew, h: hNew });
    h = hNew;
    c = cNew;
  }
  let logit = P.bo.v[0];
  for (let r = 0; r < H; r++) logit += P.wo.v[r] * h[r];
  return { steps, h, logit, p: sigmoid(logit) };
}

function lstmBackward(P, ids, fwd, y) {
  const { steps, p } = fwd;
  const T = ids.length;
  const dlogit = p - y;
  P.bo.g[0] += dlogit;
  let dh = new Float64Array(H);
  let dc = new Float64Array(H);
  for (let r = 0; r < H; r++) {
    P.wo.g[r] += dlogit * fwd.h[r];
    dh[r] = dlogit * P.wo.v[r];
  }
  for (let t = T - 1; t >= 0; t--) {
    const s = steps[t];
    const id = ids[t];
    const dz = new Float64Array(4 * H);
    const dcPrev = new Float64Array(H);
    for (let r = 0; r < H; r++) {
      const tc = Math.tanh(s.c[r]);
      const d_o = dh[r] * tc;
      const dcr = dc[r] + dh[r] * s.o[r] * (1 - tc * tc);
      const d_f = dcr * s.cPrev[r];
      const d_i = dcr * s.g[r];
      const d_g = dcr * s.i[r];
      dz[r] = d_i * s.i[r] * (1 - s.i[r]);
      dz[H + r] = d_f * s.f[r] * (1 - s.f[r]);
      dz[2 * H + r] = d_o * s.o[r] * (1 - s.o[r]);
      dz[3 * H + r] = d_g * (1 - s.g[r] * s.g[r]);
      dcPrev[r] = dcr * s.f[r];
    }
    const dzin = new Float64Array(Z);
    for (let r = 0; r < 4 * H; r++) {
      P.b.g[r] += dz[r];
      for (let k = 0; k < Z; k++) {
        P.W.g[r * Z + k] += dz[r] * s.zin[k];
        dzin[k] += dz[r] * P.W.v[r * Z + k];
      }
    }
    for (let k = 0; k < D; k++) P.emb.g[id * D + k] += dzin[k];
    const dhPrev = new Float64Array(H);
    for (let k = 0; k < H; k++) dhPrev[k] = dzin[D + k];
    dh = dhPrev;
    dc = dcPrev;
  }
}

// ── Training ──────────────────────────────────────────────────────────────
const ids = (toks) => toks.map((w) => INDEX.get(w));

/** A copy of the parameter values, for the "before training" weights. */
const snapshot = (P) => Object.fromEntries(Object.entries(P).map(([k, p]) => [k, Float64Array.from(p.v)]));

function train(name, P, forward, backward, range) {
  const params = Object.values(P);
  const curve = [];
  process.stdout.write(`\n  training ${name}`);
  for (let step = 1; step <= STEPS; step++) {
    let loss = 0;
    for (let b = 0; b < BATCH; b++) {
      const { toks, label } = sample({ range });
      const x = ids(toks);
      const fwd = forward(P, x);
      loss += -(label * Math.log(fwd.p + 1e-9) + (1 - label) * Math.log(1 - fwd.p + 1e-9));
      backward(P, x, fwd, label);
    }
    for (const p of params) for (let i = 0; i < p.g.length; i++) p.g[i] /= BATCH;
    adamStep(params, step);
    if (step % 250 === 0) {
      curve.push(+(loss / BATCH).toFixed(3));
      if (step % 500 === 0) process.stdout.write(` ${(loss / BATCH).toFixed(3)}`);
    }
  }
  console.log();
  return curve;
}

/** Accuracy on sentences with exactly `gap` filler words, negated or not. */
function accuracy(P, forward, gap, negate, n = 200) {
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const { toks, label } = sample({ gap, negate });
    const fwd = forward(P, ids(toks));
    if ((fwd.p > 0.5 ? 1 : 0) === label) ok++;
  }
  return ok / n;
}

const PRESETS = [
  "the film was good",
  "the film was not good",
  "the film was not in the end all that good",
  "the meal was honestly wonderful",
  "the hotel was never by any measure bad",
  "the concert was not if i am honest as it turned out in my view good",
];

async function main() {
  console.log(`\nrecurrent example: ${V} words, embedding ${D}, state ${H}`);
  const rnn = makeRNN();
  const rnnInit = snapshot(rnn);
  const lstm = makeLSTM();
  const lstmInit = snapshot(lstm);
  const rnnFar = makeRNN();
  const lstmFar = makeLSTM();
  const near = [0, MAX_TRAIN_GAP];
  const curves = {
    rnn: train("plain rnn, gaps 0-6", rnn, rnnForward, rnnBackward, near),
    lstm: train("lstm, gaps 0-6", lstm, lstmForward, lstmBackward, near),
    rnnFar: train("plain rnn, gaps 12-20", rnnFar, rnnForward, rnnBackward, FAR_GAP),
    lstmFar: train("lstm, gaps 12-20", lstmFar, lstmForward, lstmBackward, FAR_GAP),
  };

  console.log("\n  accuracy on negated sentences by gap (unnegated in brackets)");
  console.log("  gap   rnn          lstm         rnnFar       lstmFar");
  const report = [];
  for (let gap = 0; gap <= MAX_REPORT_GAP; gap++) {
    const cell = (P, f) => ({ neg: accuracy(P, f, gap, true), pos: accuracy(P, f, gap, false) });
    const row = {
      gap,
      rnn: cell(rnn, rnnForward),
      lstm: cell(lstm, lstmForward),
      rnnFar: cell(rnnFar, rnnForward),
      lstmFar: cell(lstmFar, lstmForward),
    };
    report.push(row);
    const fmt = (c) => `${c.neg.toFixed(2)} (${c.pos.toFixed(2)})`;
    console.log(`  ${String(gap).padStart(3)}   ${fmt(row.rnn)}  ${fmt(row.lstm)}  ${fmt(row.rnnFar)}  ${fmt(row.lstmFar)}`);
  }

  console.log("\n  presets (p positive):");
  for (const s of PRESETS) {
    const x = ids(s.split(" "));
    const line = [
      ["rnn", rnnForward(rnn, x).p],
      ["lstm", lstmForward(lstm, x).p],
      ["rnnFar", rnnForward(rnnFar, x).p],
      ["lstmFar", lstmForward(lstmFar, x).p],
    ]
      .map(([n, p]) => `${n} ${p.toFixed(2)}`)
      .join("  ");
    console.log(`    ${line}   ${s}`);
  }

  const r4 = (arr) => Array.from(arr, (x) => +x.toFixed(4));
  const packRNN = (P) => ({
    emb: r4(P.emb.v ?? P.emb),
    Wx: r4(P.Wx.v ?? P.Wx),
    Wh: r4(P.Wh.v ?? P.Wh),
    b: r4(P.b.v ?? P.b),
    wo: r4(P.wo.v ?? P.wo),
    bo: +(P.bo.v ?? P.bo)[0].toFixed(4),
  });
  const packLSTM = (P) => ({
    emb: r4(P.emb.v ?? P.emb),
    /** Row-major [4H x (D+H)], gate rows in the order i, f, o, g. */
    W: r4(P.W.v ?? P.W),
    b: r4(P.b.v ?? P.b),
    wo: r4(P.wo.v ?? P.wo),
    bo: +(P.bo.v ?? P.bo)[0].toFixed(4),
  });
  const payload = {
    meta: {
      embDim: D,
      stateDim: H,
      vocab: V,
      nearGap: near,
      farGap: FAR_GAP,
      pNegate: P_NEGATE,
      steps: STEPS,
      batch: BATCH,
      lr: LR,
      clip: CLIP,
      seed: SEED,
      note:
        "Two tiny sequence models, each trained twice on synthetic template sentences to say whether a short review is positive. The near pair saw negations 0-6 filler words before the adjective; the far pair only ever saw 12-20. Everything the page shows is computed from these weights in the browser; the sentences are synthetic and the page says so.",
      /** Training loss every 250 steps, per model. */
      curves,
      report,
    },
    vocab: VOCAB,
    fillers: FILLERS,
    words: { subjects: SUBJECTS, verbs: VERBS, negations: NEGATIONS, intensifiers: INTENSIFIERS, positive: POSITIVE, negative: NEGATIVE },
    rnn: packRNN(rnn),
    lstm: packLSTM(lstm),
    rnnFar: packRNN(rnnFar),
    lstmFar: packLSTM(lstmFar),
    rnnInit: packRNN(rnnInit),
    lstmInit: packLSTM(lstmInit),
  };
  await writeFile(OUT, JSON.stringify(payload));
  const { size } = await stat(OUT);
  console.log(`\n  wrote ${OUT} (${(size / 1024).toFixed(1)} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
