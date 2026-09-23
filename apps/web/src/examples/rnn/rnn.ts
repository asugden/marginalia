// The recurrent networks, written out step by step, with every intermediate
// kept — the same stance as the attention and transformer examples. A
// framework would fuse each step into one call; here each state, gate and
// gradient factor is a separate array the page draws.
//
// Two models, both from ./train/train.mjs:
//
//   plain    h_t = tanh(Wx·x_t + Wh·h_{t-1} + b)           one state, carried
//   lstm     gates i, f, o, g from [x_t ; h_{t-1}]
//            c_t = f ⊙ c_{t-1} + i ⊙ g;  h_t = o ⊙ tanh(c_t)
//
// Both read a sentence one word at a time and, after the last word, say how
// positive it was: p = sigmoid(wo·h_T + bo). The page also applies that same
// readout to every intermediate state, which is "what would it say if the
// sentence stopped here" — a legitimate question of the same weights, not a
// second model.
//
// The gradient factors (see `plainFactors`) are the exact backward pass of the
// plain network from its output to each earlier state, reported as one
// multiplier per step. That is the calculator on the page, measured.

export interface RawPlain {
  emb: number[];
  Wx: number[];
  Wh: number[];
  b: number[];
  wo: number[];
  bo: number;
}
export interface RawLSTM {
  emb: number[];
  /** Row-major [4H x (D+H)], gate rows in the order i, f, o, g. */
  W: number[];
  b: number[];
  wo: number[];
  bo: number;
}
export interface RawWeights {
  meta: {
    embDim: number;
    stateDim: number;
    vocab: number;
    nearGap: [number, number];
    farGap: [number, number];
    pNegate: number;
    steps: number;
    batch: number;
    lr: number;
    clip: number;
    seed: number;
    note: string;
    /** Training loss every 250 steps, per model. */
    curves: Record<ModelKey, number[]>;
    report: {
      gap: number;
      rnn: Acc;
      lstm: Acc;
      rnnFar: Acc;
      lstmFar: Acc;
    }[];
  };
  vocab: string[];
  fillers: string[][];
  words: {
    subjects: string[][];
    verbs: string[];
    negations: string[];
    intensifiers: string[];
    positive: string[];
    negative: string[];
  };
  rnn: RawPlain;
  lstm: RawLSTM;
  rnnFar: RawPlain;
  lstmFar: RawLSTM;
  rnnInit: RawPlain;
  lstmInit: RawLSTM;
}
export type ModelKey = "rnn" | "lstm" | "rnnFar" | "lstmFar";
export interface Acc {
  neg: number;
  pos: number;
}

export interface PlainModel {
  kind: "plain";
  D: number;
  H: number;
  emb: Float32Array;
  Wx: Float32Array;
  Wh: Float32Array;
  b: Float32Array;
  wo: Float32Array;
  bo: number;
}
export interface LSTMModel {
  kind: "lstm";
  D: number;
  H: number;
  emb: Float32Array;
  W: Float32Array;
  b: Float32Array;
  wo: Float32Array;
  bo: number;
}

export interface Models {
  D: number;
  H: number;
  vocab: string[];
  index: Map<string, number>;
  fillers: string[][];
  words: RawWeights["words"];
  meta: RawWeights["meta"];
  plain: PlainModel;
  lstm: LSTMModel;
  plainFar: PlainModel;
  lstmFar: LSTMModel;
  plainInit: PlainModel;
  lstmInit: LSTMModel;
}

export function loadModels(raw: RawWeights): Models {
  const { embDim: D, stateDim: H } = raw.meta;
  const plain = (r: RawPlain): PlainModel => ({
    kind: "plain",
    D,
    H,
    emb: new Float32Array(r.emb),
    Wx: new Float32Array(r.Wx),
    Wh: new Float32Array(r.Wh),
    b: new Float32Array(r.b),
    wo: new Float32Array(r.wo),
    bo: r.bo,
  });
  const lstm = (r: RawLSTM): LSTMModel => ({
    kind: "lstm",
    D,
    H,
    emb: new Float32Array(r.emb),
    W: new Float32Array(r.W),
    b: new Float32Array(r.b),
    wo: new Float32Array(r.wo),
    bo: r.bo,
  });
  return {
    D,
    H,
    vocab: raw.vocab,
    index: new Map(raw.vocab.map((w, i) => [w, i])),
    fillers: raw.fillers,
    words: raw.words,
    meta: raw.meta,
    plain: plain(raw.rnn),
    lstm: lstm(raw.lstm),
    plainFar: plain(raw.rnnFar),
    lstmFar: lstm(raw.lstmFar),
    plainInit: plain(raw.rnnInit),
    lstmInit: lstm(raw.lstmInit),
  };
}

/** Lower-case, strip punctuation, split on whitespace. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Token ids, with -1 for words the models never saw. */
export function idsOf(models: Models, tokens: string[]): number[] {
  return tokens.map((t) => models.index.get(t) ?? -1);
}

/** Exactly `n` filler tokens, built from the same neutral phrases the models
 *  were trained on. Deterministic, so a given gap always reads the same. */
export function fillerRun(fillers: string[][], n: number): string[] {
  const out: string[] = [];
  // Longest phrases first for variety, then singles to land exactly on n.
  const byLen = [...fillers].sort((a, b) => b.length - a.length);
  let k = 0;
  while (out.length < n) {
    const room = n - out.length;
    const fits = byLen.filter((p) => p.length <= room);
    const phrase = fits[k % fits.length]!;
    out.push(...phrase);
    k += 3;
  }
  return out;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function embedding(m: PlainModel | LSTMModel, id: number): Float32Array {
  const e = new Float32Array(m.D);
  if (id >= 0) e.set(m.emb.subarray(id * m.D, (id + 1) * m.D));
  return e;
}

/** The readout: what the model would say from this state. */
export function readout(m: PlainModel | LSTMModel, h: Float32Array): number {
  let z = m.bo;
  for (let r = 0; r < m.H; r++) z += m.wo[r]! * h[r]!;
  return sigmoid(z);
}

// ── The plain network ─────────────────────────────────────────────────────

export interface PlainRun {
  ids: number[];
  /** Per word: its embedding (length D). */
  E: Float32Array[];
  /** States: hs[0] is the zero start, hs[t] is after word t. Length T+1. */
  hs: Float32Array[];
  /** Per state (aligned with hs): the readout, p(positive). */
  ps: number[];
}

/** One step of the plain network. Exposed so the page can keep stepping with
 *  no word at all (x = 0) — the "lights off" demonstration. */
export function plainStep(m: PlainModel, x: Float32Array, prev: Float32Array): Float32Array {
  const { D, H } = m;
  const h = new Float32Array(H);
  for (let r = 0; r < H; r++) {
    let a = m.b[r]!;
    for (let c = 0; c < D; c++) a += m.Wx[r * D + c]! * x[c]!;
    for (let c = 0; c < H; c++) a += m.Wh[r * H + c]! * prev[c]!;
    h[r] = Math.tanh(a);
  }
  return h;
}

export function runPlain(m: PlainModel, ids: number[]): PlainRun {
  const E = ids.map((id) => embedding(m, id));
  const hs: Float32Array[] = [new Float32Array(m.H)];
  for (const x of E) hs.push(plainStep(m, x, hs[hs.length - 1]!));
  return { ids, E, hs, ps: hs.map((h) => readout(m, h)) };
}

/** The exact backward pass from the output to every earlier state, as one
 *  multiplier per step.
 *
 *  g_T = wo (how the output depends on the last state); then, stepping back,
 *  g_{t-1} = Whᵀ · (g_t ⊙ (1 − h_t²)). `factors[t]` is ‖g_{t-1}‖ / ‖g_t‖, the
 *  amount the training signal is multiplied by on its way back past word t
 *  (1-based; factors[0] unused). `remaining[t]` is ‖g_t‖ / ‖g_T‖: how much of
 *  the signal is left when it reaches the state after word t, i.e. the running
 *  product of the factors — the calculator's display. */
export interface PlainGradient {
  factors: number[];
  remaining: number[];
}

export function plainFactors(m: PlainModel, run: PlainRun): PlainGradient {
  const { H } = m;
  const T = run.ids.length;
  const norm = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  let g: Float32Array = Float32Array.from(m.wo);
  const gT = norm(g) || 1;
  const factors = new Array<number>(T + 1).fill(1);
  const remaining = new Array<number>(T + 1).fill(1);
  remaining[T] = 1;
  for (let t = T; t >= 1; t--) {
    const h = run.hs[t]!;
    const da = new Float32Array(H);
    for (let r = 0; r < H; r++) da[r] = g[r]! * (1 - h[r]! * h[r]!);
    const prev = new Float32Array(H);
    for (let r = 0; r < H; r++) {
      const d = da[r]!;
      if (d === 0) continue;
      for (let c = 0; c < H; c++) prev[c]! += d * m.Wh[r * H + c]!;
    }
    const before = norm(g);
    const after = norm(prev);
    factors[t] = before === 0 ? 0 : after / before;
    remaining[t - 1] = after / gT;
    g = prev;
  }
  return { factors, remaining };
}

// ── The LSTM ──────────────────────────────────────────────────────────────

export interface LSTMStep {
  /** Gates and candidate, each length H. */
  i: Float32Array;
  f: Float32Array;
  o: Float32Array;
  g: Float32Array;
  /** The cell — the notebook — after this word. */
  c: Float32Array;
  /** What the network says out loud after this word. */
  h: Float32Array;
}
export interface LSTMRun {
  ids: number[];
  E: Float32Array[];
  steps: LSTMStep[];
  /** Readout per step, plus the zero-start readout at index 0. Length T+1. */
  ps: number[];
}

export function runLSTM(m: LSTMModel, ids: number[]): LSTMRun {
  const { D, H } = m;
  const Z = D + H;
  const E = ids.map((id) => embedding(m, id));
  let h = new Float32Array(H);
  let c = new Float32Array(H);
  const steps: LSTMStep[] = [];
  const ps = [readout(m, h)];
  for (const x of E) {
    const zin = new Float32Array(Z);
    zin.set(x, 0);
    zin.set(h, D);
    const i = new Float32Array(H);
    const f = new Float32Array(H);
    const o = new Float32Array(H);
    const g = new Float32Array(H);
    for (let r = 0; r < H; r++) {
      let zi = m.b[r]!;
      let zf = m.b[H + r]!;
      let zo = m.b[2 * H + r]!;
      let zg = m.b[3 * H + r]!;
      for (let k = 0; k < Z; k++) {
        const v = zin[k]!;
        zi += m.W[r * Z + k]! * v;
        zf += m.W[(H + r) * Z + k]! * v;
        zo += m.W[(2 * H + r) * Z + k]! * v;
        zg += m.W[(3 * H + r) * Z + k]! * v;
      }
      i[r] = sigmoid(zi);
      f[r] = sigmoid(zf);
      o[r] = sigmoid(zo);
      g[r] = Math.tanh(zg);
    }
    const cNew = new Float32Array(H);
    const hNew = new Float32Array(H);
    for (let r = 0; r < H; r++) {
      cNew[r] = f[r]! * c[r]! + i[r]! * g[r]!;
      hNew[r] = o[r]! * Math.tanh(cNew[r]!);
    }
    steps.push({ i, f, o, g, c: cNew, h: hNew });
    h = hNew;
    c = cNew;
    ps.push(readout(m, h));
  }
  return { ids, E, steps, ps };
}

/** Mean of a gate vector: how open the valve is, 0..1. */
export function mean(v: Float32Array): number {
  let s = 0;
  for (let k = 0; k < v.length; k++) s += v[k]!;
  return v.length ? s / v.length : 0;
}

/** The largest |value| across some vectors, for a shared colour scale. */
export function maxAbs(vs: Float32Array[]): number {
  let m = 0;
  for (const v of vs) for (let k = 0; k < v.length; k++) m = Math.max(m, Math.abs(v[k]!));
  return m || 1;
}
