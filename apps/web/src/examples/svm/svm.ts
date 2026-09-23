// A linear support vector machine, and the reader's hand-placed line.
//
// Both are the same kind of classifier: one straight line, one class on each
// side. What the SVM adds is the rule for *which* line — the one that leaves
// the widest street between the classes. The street's edges are where
// w·x + b = ±1, its width is 2/‖w‖, and the points on or inside its edges are
// the support vectors: move any other point (without crossing the street) and
// the line does not change.
//
// With overlapping classes no line leaves an empty street, so this is the
// soft-margin SVM: it trades a wider street against points let inside it,
// with the trade set by C. C is fixed here; the page is about the street, not
// the tuning.
//
// Two classes only. Class 0 is y = −1 and class 1 is y = +1.

import { DOMAIN, clipLineToBox, type Point } from "../shared/classification/data.js";

// ── The reader's line ───────────────────────────────────────────────────────

export interface Line {
  p1: [number, number];
  p2: [number, number];
}

/** Signed distance from the line, positive on the left of p1 → p2. */
export function signedDistance(x: number[], line: Line): number {
  const dx = line.p2[0] - line.p1[0];
  const dy = line.p2[1] - line.p1[1];
  const len = Math.hypot(dx, dy) || 1;
  return (dx * (x[1]! - line.p1[1]) - dy * (x[0]! - line.p1[0])) / len;
}

/** A hand-drawn line has no say over which class goes on which side, so the
 *  page picks the way round that scores better on the points shown — which is
 *  what fitting would do, and one control fewer. */
export function orient(line: Line, points: Point[]): 0 | 1 {
  let leftIsOne = 0;
  for (const p of points) if ((signedDistance(p.x, line) > 0 ? 1 : 0) === p.y) leftIsOne++;
  return leftIsOne >= points.length - leftIsOne ? 1 : 0;
}

/** Predict with an oriented line: `left` is the class on the positive side. */
export function linePredict(x: number[], line: Line, left: 0 | 1): number {
  return signedDistance(x, line) > 0 ? left : 1 - left;
}

export interface Street {
  /** Distance to the nearest correctly classified point on each side, or null
   *  when a side has none. */
  left: number | null;
  right: number | null;
  leftIndex: number | null;
  rightIndex: number | null;
}

/** The reader's street: from their line out to the nearest point it gets right
 *  on each side. Points it gets wrong are ignored, as the soft-margin SVM lets
 *  them into its street — the score keeps that honest. */
export function streetOf(line: Line, left: 0 | 1, points: Point[]): Street {
  const s: Street = { left: null, right: null, leftIndex: null, rightIndex: null };
  points.forEach((p, i) => {
    const d = signedDistance(p.x, line);
    const predicted = d > 0 ? left : 1 - left;
    if (predicted !== p.y) return;
    if (d > 0 && (s.left === null || d < s.left)) {
      s.left = d;
      s.leftIndex = i;
    } else if (d <= 0 && (s.right === null || -d < s.right)) {
      s.right = -d;
      s.rightIndex = i;
    }
  });
  return s;
}

/** Where a fresh line starts: flat across the middle, so there is always a
 *  classifier on screen to drag. */
export function defaultLine(): Line {
  return { p1: [DOMAIN[0] + 0.6, 0], p2: [DOMAIN[1] - 0.6, 0] };
}

// ── The SVM ─────────────────────────────────────────────────────────────────

export interface SVMModel {
  w: [number, number];
  b: number;
  /** Indices into the training points with a non-zero multiplier: on the
   *  street's edge, inside it, or on the wrong side. */
  support: number[];
}

/** Soft-margin penalty. At this value a point inside the street costs about
 *  as much as a unit of street width, which on these datasets leaves a
 *  handful of support vectors on clean data and more where the classes
 *  overlap. */
const C = 1;
/** The bias rides along as a constant third feature so the whole fit is one
 *  coordinate-descent loop. That regularises the bias slightly; a larger
 *  constant makes the effect smaller. */
const BIAS = 3;

/** Fit a linear SVM by dual coordinate descent (Hsieh et al., 2008): cycle
 *  through the points, and for each one solve exactly for its multiplier with
 *  the others held fixed. Deterministic, dependency-free, and exact to within
 *  the tolerance for a few dozen points. */
export function fitSVM(points: Point[]): SVMModel {
  const n = points.length;
  const X = points.map((p) => [p.x[0]!, p.x[1]!, BIAS]);
  const y = points.map((p) => (p.y === 1 ? 1 : -1));
  const Q = X.map((x) => x[0]! * x[0]! + x[1]! * x[1]! + x[2]! * x[2]!);
  const alpha = new Array<number>(n).fill(0);
  let w0 = 0;
  let w1 = 0;
  let w2 = 0;

  for (let epoch = 0; epoch < 3000; epoch++) {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const xi = X[i]!;
      const G = y[i]! * (w0 * xi[0]! + w1 * xi[1]! + w2 * xi[2]!) - 1;
      const a = alpha[i]!;
      const PG = a === 0 ? Math.min(G, 0) : a === C ? Math.max(G, 0) : G;
      worst = Math.max(worst, Math.abs(PG));
      if (PG === 0) continue;
      const next = Math.min(Math.max(a - G / Q[i]!, 0), C);
      const step = (next - a) * y[i]!;
      alpha[i] = next;
      w0 += step * xi[0]!;
      w1 += step * xi[1]!;
      w2 += step * xi[2]!;
    }
    if (worst < 1e-5) break;
  }

  const support: number[] = [];
  alpha.forEach((a, i) => {
    if (a > 1e-6) support.push(i);
  });
  return { w: [w0, w1], b: w2 * BIAS, support };
}

export function svmPredict(x: number[], m: SVMModel): number {
  return m.w[0] * x[0]! + m.w[1] * x[1]! + m.b > 0 ? 1 : 0;
}

/** A point on the line w·x + b = level, and the line's direction. */
function lineAt(m: SVMModel, level: number): { p: [number, number]; dir: [number, number] } {
  const nn = m.w[0] * m.w[0] + m.w[1] * m.w[1] || 1e-9;
  const k = (level - m.b) / nn;
  return { p: [k * m.w[0], k * m.w[1]], dir: [-m.w[1], m.w[0]] };
}

/** The SVM's boundary clipped to the plot, for drawing. */
export function svmBoundary(m: SVMModel): [[number, number], [number, number]] | null {
  const { p, dir } = lineAt(m, 0);
  return clipLineToBox(p, [p[0] + dir[0], p[1] + dir[1]], DOMAIN[0], DOMAIN[1]);
}

/** The street as a long quadrilateral between w·x + b = −1 and +1, meant to be
 *  clipped to the plot by the caller. */
export function svmStreet(m: SVMModel): Array<[number, number]> {
  const far = 40 / (Math.hypot(m.w[0], m.w[1]) || 1e-9);
  const lo = lineAt(m, -1);
  const hi = lineAt(m, 1);
  const at = (l: typeof lo, t: number): [number, number] => [l.p[0] + l.dir[0] * t, l.p[1] + l.dir[1] * t];
  return [at(lo, -far), at(lo, far), at(hi, far), at(hi, -far)];
}

/** A line parallel to the reader's at a signed distance, as a long segment
 *  meant to be clipped by the caller. */
export function offsetLine(line: Line, d: number): [[number, number], [number, number]] {
  const dx = line.p2[0] - line.p1[0];
  const dy = line.p2[1] - line.p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ux = (dx / len) * 20;
  const uy = (dy / len) * 20;
  const cx = (line.p1[0] + line.p2[0]) / 2 + nx * d;
  const cy = (line.p1[1] + line.p2[1]) / 2 + ny * d;
  return [
    [cx - ux, cy - uy],
    [cx + ux, cy + uy],
  ];
}
