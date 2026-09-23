// The maths behind the fitting-complex-shapes example: two ways to build a
// curve out of simple pieces, the best fit of each for a given number of
// pieces, and the data both panels fit.
//
//   steps  A flat value per stretch of the input. This is every shape a
//          regression tree on one input can make: each leaf is one step, and
//          the thresholds between leaves are where the steps change.
//   bends  A straight line with corners in it. This is what a network with
//          one hidden layer of ReLU neurons adds up to: each neuron is a line
//          with one corner, and their sum has a corner wherever one of them
//          does.
//
// Both fits are exact for their piece count, and deterministic, so every
// viewer sees the same curve. Where the pieces change is found by dynamic
// programming over the sorted points (the best split into k stretches, each
// fitted on its own); the bends are then refitted as one continuous line with
// corners at those places, by least squares.

export type Kind = "steps" | "bends";

export interface Pt {
  x: number;
  y: number;
}

export interface Fitted {
  kind: Kind;
  /** Where the pieces change, in x. */
  knots: number[];
  /** Steps: one value per stretch (knots.length + 1). Bends: intercept,
   *  slope, then one change of slope per knot. */
  coef: number[];
}

/** How many numbers a model of this size stores. Steps: a tree with k leaves
 *  keeps k leaf values and k − 1 thresholds. Bends: n corners take n + 1 ReLU
 *  neurons (one of them always on, for the line's own slope), and a network
 *  with one input, n hidden neurons and one output keeps 3n + 1 numbers. */
export function paramsOf(kind: Kind, size: number): number {
  return kind === "steps" ? 2 * size - 1 : 3 * (size + 1) + 1;
}

/** The size a model starts at: one leaf, or a straight line with no corners. */
export function minSize(kind: Kind): number {
  return kind === "steps" ? 1 : 0;
}

/** The model the parameter count stands for, in words. */
export function modelOf(kind: Kind, size: number): string {
  if (kind === "steps") return size === 1 ? "a tree with 1 leaf" : `a tree with ${size} leaves`;
  const n = size + 1;
  return n === 1 ? "a network with 1 ReLU neuron" : `a network with ${n} ReLU neurons`;
}

export function predict(f: Fitted, x: number): number {
  if (f.kind === "steps") {
    let i = 0;
    while (i < f.knots.length && x >= f.knots[i]!) i++;
    return f.coef[i]!;
  }
  let y = f.coef[0]! + f.coef[1]! * x;
  for (let j = 0; j < f.knots.length; j++) y += f.coef[j + 2]! * Math.max(0, x - f.knots[j]!);
  return y;
}

export function rms(f: Fitted, pts: Pt[]): number {
  let s = 0;
  for (const p of pts) {
    const d = predict(f, p.x) - p.y;
    s += d * d;
  }
  return Math.sqrt(s / Math.max(1, pts.length));
}

/**
 * Every best fit of one kind, from the smallest model up to `maxSize`, for one
 * set of points. The dynamic programme is run once and each size read off it,
 * so a slider sweeping the size costs nothing.
 */
export function fitAll(kind: Kind, pts: Pt[], maxSize: number): Fitted[] {
  const sizes: number[] = [];
  for (let s = minSize(kind); s <= maxSize; s++) sizes.push(s);
  return fitSizes(kind, pts, sizes);
}

/** The best fit of one size only: cheap enough to rerun on every stroke. */
export function fitOne(kind: Kind, pts: Pt[], size: number): Fitted {
  return fitSizes(kind, pts, [size])[0]!;
}

function fitSizes(kind: Kind, pts: Pt[], sizes: number[]): Fitted[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const top = Math.max(...sizes);
  if (kind === "steps") {
    const n = sorted.length;
    const segs = segment(Math.min(top, n), n, constCost(sorted), false);
    return sizes.map((k) => {
      const cuts = segs(Math.min(k, n));
      const knots = cuts.map((i) => (sorted[i - 1]!.x + sorted[i]!.x) / 2);
      const coef: number[] = [];
      let from = 0;
      for (const to of [...cuts, n]) {
        let s = 0;
        for (let i = from; i < to; i++) s += sorted[i]!.y;
        coef.push(s / (to - from));
        from = to;
      }
      return { kind, knots, coef };
    });
  }
  // Bends: stretches share their end points, so n points give at most n − 1
  // stretches, and the corners sit on points (which lets the largest model
  // pass through every one).
  const maxSeg = Math.max(1, sorted.length - 1);
  const segs = segment(Math.min(top + 1, maxSeg), sorted.length, lineCost(sorted), true);
  return sizes.map((c) => {
    const knots = segs(Math.min(c + 1, maxSeg)).map((i) => sorted[i]!.x);
    return { kind, knots, coef: leastSquares(sorted, knots) };
  });
}

/** The largest size worth offering for n points: past it the fit already
 *  passes through every one. */
export function maxSizeFor(kind: Kind, n: number): number {
  return kind === "steps" ? n : Math.max(0, n - 2);
}

// ── Segmentation ─────────────────────────────────────────────────────────

type Cost = (from: number, to: number) => number;

/** Squared error of a flat value over points [from, to). */
function constCost(p: Pt[]): Cost {
  const s = [0];
  const ss = [0];
  for (const q of p) {
    s.push(s[s.length - 1]! + q.y);
    ss.push(ss[ss.length - 1]! + q.y * q.y);
  }
  return (a, b) => {
    const m = b - a;
    const sy = s[b]! - s[a]!;
    return ss[b]! - ss[a]! - (sy * sy) / m;
  };
}

/** Squared error of the best straight line over points [from, to]. */
function lineCost(p: Pt[]): Cost {
  const n = p.length;
  const acc = Array.from({ length: 5 }, () => new Float64Array(n + 1));
  p.forEach((q, i) => {
    const v = [q.x, q.y, q.x * q.x, q.x * q.y, q.y * q.y];
    for (let k = 0; k < 5; k++) acc[k]![i + 1] = acc[k]![i]! + v[k]!;
  });
  return (a, b) => {
    const m = b - a + 1;
    if (m <= 2) return 0;
    const g = (k: number) => acc[k]![b + 1]! - acc[k]![a]!;
    const sx = g(0);
    const sy = g(1);
    const sxx = g(2) - (sx * sx) / m;
    const sxy = g(3) - (sx * sy) / m;
    const syy = g(4) - (sy * sy) / m;
    return Math.max(0, sxx > 1e-12 ? syy - (sxy * sxy) / sxx : syy);
  };
}

/**
 * The best split of the sorted points into k stretches, for every k up to
 * `maxK`. Returns a function from k to the indices where new stretches start.
 * With `shared`, neighbouring stretches share their boundary point (for a
 * continuous line); otherwise they partition the points.
 */
function segment(maxK: number, n: number, cost: Cost, shared: boolean): (k: number) => number[] {
  // best[k][j]: the least error covering points up to j with k stretches.
  // Partition: stretches are [i, j), j = 1..n. Shared: stretches are [i, j],
  // j = 1..n−1, and the next one starts at j again.
  const best: Float64Array[] = [];
  const from: Int32Array[] = [];
  const last = shared ? n - 1 : n;
  for (let k = 0; k <= maxK; k++) {
    best.push(new Float64Array(last + 1).fill(Infinity));
    from.push(new Int32Array(last + 1).fill(-1));
  }
  best[0]![0] = 0;
  for (let k = 1; k <= maxK; k++) {
    for (let j = k; j <= last; j++) {
      let b = Infinity;
      let arg = -1;
      for (let i = k - 1; i < j; i++) {
        const prev = best[k - 1]![i]!;
        if (prev === Infinity) continue;
        const c = prev + cost(i, j);
        if (c < b) {
          b = c;
          arg = i;
        }
      }
      best[k]![j] = b;
      from[k]![j] = arg;
    }
  }
  return (k) => {
    const cuts: number[] = [];
    let j = last;
    for (let kk = k; kk > 1; kk--) {
      j = from[kk]![j]!;
      cuts.unshift(j);
    }
    return cuts;
  };
}

/** Intercept, slope and one change of slope per knot, by least squares. */
function leastSquares(p: Pt[], knots: number[]): number[] {
  const m = knots.length + 2;
  const row = (x: number) => [1, x, ...knots.map((k) => Math.max(0, x - k))];
  const A = Array.from({ length: m }, () => new Float64Array(m + 1));
  for (const q of p) {
    const r = row(q.x);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) A[i]![j]! += r[i]! * r[j]!;
      A[i]![m]! += r[i]! * q.y;
    }
  }
  // A whisper of ridge keeps the system solvable when two knots crowd
  // together; it is far too small to change a fit you could see.
  for (let i = 0; i < m; i++) A[i]![i]! += 1e-9;
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    const d = A[c]![c]! || 1e-12;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / d;
      if (f === 0) continue;
      for (let j = c; j <= m; j++) A[r]![j]! -= f * A[c]![j]!;
    }
  }
  return A.map((r, i) => r[m]! / (r[i]! || 1e-12));
}

// ── Data ─────────────────────────────────────────────────────────────────

/** A seeded generator, so a "day" is the same for every viewer. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Samples across the drawing, 0..1 on both axes. */
export const DRAW_N = 120;

/** The shape the drawing starts as: one heartbeat on a monitor. */
export function heartbeat(): number[] {
  const bump = (x: number, at: number, w: number, h: number) => h * Math.exp(-(((x - at) / w) ** 2) / 2);
  return Array.from({ length: DRAW_N }, (_, i) => {
    const x = i / (DRAW_N - 1);
    return (
      0.32 +
      bump(x, 0.2, 0.035, 0.09) -
      bump(x, 0.385, 0.012, 0.06) +
      bump(x, 0.42, 0.013, 0.5) -
      bump(x, 0.455, 0.012, 0.12) +
      bump(x, 0.68, 0.055, 0.16)
    );
  });
}

/** Cars an hour past one spot on a commuter road, by hour of the day: quiet
 *  at night, a morning rush, a steady day, a longer evening rush. */
export function traffic(h: number): number {
  const g = (at: number, w: number) => Math.exp(-(((h - at) / w) ** 2) / 2);
  const day = 1 / (1 + Math.exp(-(h - 6.3) * 1.6)) / (1 + Math.exp((h - 21) * 1.1));
  return 60 + 380 * day + 560 * g(8, 1.0) + 620 * g(17.5, 1.4);
}

/** Counts in a day: one every half hour. */
export const COUNTS = 48;
/** How far one count strays from the usual, in cars an hour. */
export const SCATTER = 120;

/** Day `d`'s counts, each at the middle of its half hour. Day d + 1 is "the
 *  next day": the same road, the same times, different traffic. */
export function dayOf(d: number): Pt[] {
  const r = rng((d + 1) * 2654435761);
  return Array.from({ length: COUNTS }, (_, i) => {
    const x = ((i + 0.5) * 24) / COUNTS;
    return { x, y: Math.max(0, traffic(x) + SCATTER * gauss(r)) };
  });
}
