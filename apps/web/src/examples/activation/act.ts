// The arithmetic behind the activation-functions example.
//
// Three things, all small enough to write out by hand:
//
//   1. The activation functions themselves, and their slopes.
//   2. A one-input network — one number in, one hidden layer of n neurons,
//      one number out — fitted to a curve with a hump in it. The fit runs in the
//      browser, deterministically, so the figure shows the BEST that each
//      activation can do with n neurons rather than whatever a student's
//      hand-set weights happen to reach. That is what makes "adding neurons
//      to a linear network changes nothing" a finding rather than a claim.
//   3. A deep chain of single neurons, for the "why ReLU won" panel: the
//      same input pushed through L layers of each activation, with how much
//      each layer still responds to a change in the input.
//
// No library. Every number the page draws comes from here.

export type Act = "none" | "relu" | "sigmoid" | "tanh";

export const ACTS: Act[] = ["none", "relu", "sigmoid", "tanh"];

export const ACT_NAME: Record<Act, string> = {
  none: "None (linear)",
  relu: "ReLU",
  sigmoid: "Sigmoid",
  tanh: "Tanh",
};

export function act(kind: Act, z: number): number {
  if (kind === "relu") return z > 0 ? z : 0;
  if (kind === "sigmoid") return 1 / (1 + Math.exp(-z));
  // tanh is the sigmoid stretched to −1..1 and centred on zero:
  // tanh(z) = 2·sigmoid(2z) − 1.
  if (kind === "tanh") return Math.tanh(z);
  return z;
}

/** The slope of the activation at z: how much a small change in the sum
 *  still moves the output. */
export function slope(kind: Act, z: number): number {
  if (kind === "relu") return z > 0 ? 1 : 0;
  if (kind === "sigmoid") {
    const s = 1 / (1 + Math.exp(-z));
    return s * (1 - s);
  }
  if (kind === "tanh") {
    const t = Math.tanh(z);
    return 1 - t * t;
  }
  return 1;
}

// ── The two curves to fit ─────────────────────────────────────────────────
//
// Panel 2 fits a curve with a hump in it, because a straight line cannot
// make one. There are two, chosen by the page's Neuroscience switch; both are
// illustrative shapes, not measurements. A small fixed jitter keeps the
// points looking measured rather than drawn with a ruler — seeded, so every
// viewer sees the same points.
//
//   coffee   How much you enjoy a cup of coffee against its temperature: too
//            cold is flat, too hot is unpleasant, and there is a sweet spot
//            near 66 °C. Everyone has felt this curve. The default.
//   cortex   An orientation-tuned neuron in visual cortex: it fires most for a
//            bar at its preferred angle, falling to a low spontaneous rate on
//            either side. The textbook tuning curve.
//
// Both peak off-centre, so the best straight line visibly tilts rather than
// lying flat — which would read as the network doing nothing.

export interface Point {
  /** The input in its own units: degrees of tilt, or degrees Celsius. */
  at: number;
  /** The same, scaled to 0–1: what the network is fed. */
  x: number;
  /** The response, 0–1: firing rate, or enjoyment. */
  y: number;
}

export interface Curve {
  id: "coffee" | "cortex";
  /** The input's range, in its own units. */
  min: number;
  max: number;
  points: Point[];
}

const jitter = (i: number) => 0.028 * Math.sin(i * 12.9898 + 4.1) * Math.cos(i * 3.3);

function curve(id: Curve["id"], min: number, max: number, n: number, f: (at: number) => number): Curve {
  const points = Array.from({ length: n }, (_, i) => {
    const at = min + ((max - min) * i) / (n - 1);
    return { at, x: (at - min) / (max - min), y: Math.max(0, f(at) + jitter(i)) };
  });
  return { id, min, max, points };
}

/** Enjoyment of coffee against temperature, 10–95 °C: a slow rise from cold,
 *  a sweet spot near 66 °C, a sharper fall once it scalds. */
export const COFFEE = curve("coffee", 10, 95, 26, (t) => {
  const w = t < 66 ? 20 : 10;
  return 0.06 + 0.86 * Math.exp(-(((t - 66) / w) ** 2));
});

/** A visual-cortex neuron preferring bars tilted at 60°, over 0–180°. */
export const CORTEX = curve("cortex", 0, 180, 25, (deg) =>
  0.08 + 0.84 * Math.exp(-(((deg - 60) / 26) ** 2)),
);

// ── The one-input network ────────────────────────────────────────────────

export interface Net1D {
  /** Per hidden neuron: its input weight and its bias. */
  w: number[];
  b: number[];
  /** Per hidden neuron: its weight into the output. */
  v: number[];
  /** The output's bias. */
  c: number;
}

export interface Pass1D {
  z: number[];
  h: number[];
  y: number;
}

export function run1D(net: Net1D, kind: Act, x: number): Pass1D {
  const z = net.w.map((w, i) => w * x + net.b[i]!);
  const h = z.map((zi) => act(kind, zi));
  let y = net.c;
  for (let i = 0; i < h.length; i++) y += net.v[i]! * h[i]!;
  return { z, h, y };
}

/** Mean absolute miss against the tuning points. */
export function miss(net: Net1D, kind: Act, pts: Point[]): number {
  let s = 0;
  for (const p of pts) s += Math.abs(run1D(net, kind, p.x).y - p.y);
  return s / pts.length;
}

/**
 * The linear network, collapsed. With no activation every hidden neuron is
 * w·x + b, and the output is a weighted sum of those — so the whole network,
 * however wide, is one slope and one intercept. This computes them from the
 * network's own weights, which is how the page shows the collapse instead of
 * asserting it.
 */
export function collapse(net: Net1D): { slope: number; intercept: number } {
  let slope = 0;
  let intercept = net.c;
  for (let i = 0; i < net.w.length; i++) {
    slope += net.v[i]! * net.w[i]!;
    intercept += net.v[i]! * net.b[i]!;
  }
  return { slope, intercept };
}

/**
 * The best n-neuron network for this activation, found the way any network
 * is: gradient descent on the squared error. It starts from a deterministic
 * guess — the neurons' turning points spread evenly across the range, the
 * output layer solved exactly for that guess — and refines everything with
 * Adam. Same inputs, same result, every time.
 */
export function fit(kind: Act, n: number, pts: Point[]): Net1D {
  // Steepness of the starting guess: a ReLU's bend or a sigmoid's step, placed
  // at evenly spaced points t across the range.
  const k = kind === "sigmoid" ? 14 : kind === "tanh" ? 7 : kind === "relu" ? 3 : 1;
  const w: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    w.push(k);
    b.push(-k * t);
  }
  const { v, c } = solveOutput(kind, w, b, pts);
  const net: Net1D = { w, b, v, c };
  adam(net, kind, pts, 2500, 0.02);
  return net;
}

/** Least squares for the output layer with the hidden layer held fixed. */
function solveOutput(
  kind: Act,
  w: number[],
  b: number[],
  pts: Point[],
): { v: number[]; c: number } {
  const n = w.length;
  const m = n + 1; // v_0..v_{n-1}, then c
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const rhs = new Array<number>(m).fill(0);
  for (const p of pts) {
    const f = w.map((wi, i) => act(kind, wi * p.x + b[i]!));
    f.push(1);
    for (let r = 0; r < m; r++) {
      rhs[r]! += f[r]! * p.y;
      for (let s = 0; s < m; s++) A[r]![s]! += f[r]! * f[s]!;
    }
  }
  // A little ridge keeps the solve well-posed when two neurons coincide, and
  // when "none" makes every hidden neuron a copy of the same line.
  for (let r = 0; r < m; r++) A[r]![r]! += 1e-4;
  const sol = gauss(A, rhs);
  return { v: sol.slice(0, n), c: sol[n]! };
}

function gauss(A: number[][], y: number[]): number[] {
  const n = y.length;
  const M = A.map((row, i) => [...row, y[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const d = M[col]![col]! || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / d;
      for (let s = col; s <= n; s++) M[r]![s]! -= f * M[col]![s]!;
    }
  }
  return M.map((row, i) => row[n]! / (M[i]![i]! || 1e-12));
}

function adam(net: Net1D, kind: Act, pts: Point[], steps: number, lr: number) {
  const n = net.w.length;
  const P = 3 * n + 1; // w, b, v, c
  const get = (j: number) =>
    j < n ? net.w[j]! : j < 2 * n ? net.b[j - n]! : j < 3 * n ? net.v[j - 2 * n]! : net.c;
  const set = (j: number, val: number) => {
    if (j < n) net.w[j] = val;
    else if (j < 2 * n) net.b[j - n] = val;
    else if (j < 3 * n) net.v[j - 2 * n] = val;
    else net.c = val;
  };
  const m = new Array<number>(P).fill(0);
  const s = new Array<number>(P).fill(0);
  const g = new Array<number>(P).fill(0);
  const b1 = 0.9;
  const b2 = 0.999;
  for (let t = 1; t <= steps; t++) {
    g.fill(0);
    for (const p of pts) {
      const { z, h, y } = run1D(net, kind, p.x);
      const e = (2 * (y - p.y)) / pts.length;
      for (let i = 0; i < n; i++) {
        const dz = e * net.v[i]! * slope(kind, z[i]!);
        g[i]! += dz * p.x;
        g[n + i]! += dz;
        g[2 * n + i]! += e * h[i]!;
      }
      g[3 * n]! += e;
    }
    for (let j = 0; j < P; j++) {
      m[j] = b1 * m[j]! + (1 - b1) * g[j]!;
      s[j] = b2 * s[j]! + (1 - b2) * g[j]! * g[j]!;
      const mh = m[j]! / (1 - b1 ** t);
      const sh = s[j]! / (1 - b2 ** t);
      set(j, get(j) - (lr * mh) / (Math.sqrt(sh) + 1e-8));
    }
  }
}

// ── The deep chain ───────────────────────────────────────────────────────
//
// L layers of one neuron each, every one with weight 1 and no bias, so the
// ONLY thing that differs between the two chains is the activation function.
// For each layer: its value, and how much it moves when the input moves —
// the product of every slope above it, which is exactly the number training
// uses to decide how to change the first layer's weight.

export interface ChainLayer {
  value: number;
  /** d(this layer) / d(input). */
  response: number;
}

export function chain(kind: Act, x: number, layers: number): ChainLayer[] {
  const out: ChainLayer[] = [];
  let a = x;
  let r = 1;
  for (let l = 0; l < layers; l++) {
    r *= slope(kind, a);
    a = act(kind, a);
    out.push({ value: a, response: r });
  }
  return out;
}
