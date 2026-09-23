// Gaussian naive Bayes: the fitted model, and the reader's hand-fitted one.
//
// The data (the true distributions, sampling, scoring) lives in
// shared/classification/data.ts, shared with the SVM example.
//
// The whole model is small enough to hold in your hands, which is what the
// page is built on: for each class, a prior and one (mean, spread) per
// feature. The reader sets the means and spreads by dragging curves; fitting
// sets them from the sample in closed form. Both are scored by the same rule,
// so "you vs naive Bayes" is a like-for-like comparison of two sets of curves.
//
// The "naive" part: the features are assumed independent given the class, so
// the per-class density in 2D is the product of two 1D curves — an ellipse
// aligned to the axes. When the true class is a tilted cloud, no amount of
// data fixes that; the model has no parameter that could turn the ellipse.

import { DOMAIN, normalPdf, type Point } from "../shared/classification/data.js";

/** The entire model: for each class a prior and one (mean, variance) per
 *  feature. There is no covariance term anywhere, and that absence is the
 *  whole lesson. */
export interface NBModel {
  dim: number;
  priors: number[];
  /** [class][feature] */
  means: number[][];
  /** [class][feature] */
  vars: number[][];
}

/** Variance floor. Guards against a class with one point (or a perfectly
 *  co-linear one) collapsing to a zero-width spike. */
const VAR_FLOOR = 0.02;

/** The priors are the share of each class in the sample, for the fitted model
 *  and the reader's alike: the reader sets shapes, not class frequencies. */
export function samplePriors(points: Point[], nClasses: number): number[] {
  const counts = new Array(nClasses).fill(0);
  for (const p of points) counts[p.y]!++;
  return counts.map((c) => c / Math.max(points.length, 1));
}

export function fitNaiveBayes(points: Point[], nClasses: number, dim: number): NBModel {
  const means = Array.from({ length: nClasses }, () => new Array(dim).fill(0));
  const vars = Array.from({ length: nClasses }, () => new Array(dim).fill(0));
  const counts = new Array(nClasses).fill(0);

  for (const p of points) {
    counts[p.y]!++;
    for (let d = 0; d < dim; d++) means[p.y]![d] += p.x[d]!;
  }
  for (let c = 0; c < nClasses; c++) {
    for (let d = 0; d < dim; d++) means[c]![d] /= Math.max(counts[c]!, 1);
  }
  for (const p of points) {
    for (let d = 0; d < dim; d++) {
      const diff = p.x[d]! - means[p.y]![d]!;
      vars[p.y]![d] += diff * diff;
    }
  }
  for (let c = 0; c < nClasses; c++) {
    for (let d = 0; d < dim; d++) {
      vars[c]![d] = Math.max(vars[c]![d]! / Math.max(counts[c]!, 1), VAR_FLOOR);
    }
  }
  return { dim, priors: samplePriors(points, nClasses), means, vars };
}

/** Log posterior (up to the constant evidence term) for each class. Summing
 *  logs of the per-feature Gaussians *is* the independence assumption. */
export function nbLogPosteriors(x: number[], m: NBModel): number[] {
  const out: number[] = [];
  for (let c = 0; c < m.priors.length; c++) {
    if (m.priors[c]! === 0) {
      out.push(-Infinity);
      continue;
    }
    let lp = Math.log(m.priors[c]!);
    for (let d = 0; d < m.dim; d++) {
      const v = m.vars[c]![d]!;
      const diff = x[d]! - m.means[c]![d]!;
      lp += -0.5 * Math.log(2 * Math.PI * v) - (diff * diff) / (2 * v);
    }
    out.push(lp);
  }
  return out;
}

export function nbPredict(x: number[], m: NBModel): number {
  const lp = nbLogPosteriors(x, m);
  let best = 0;
  for (let c = 1; c < lp.length; c++) if (lp[c]! > lp[best]!) best = c;
  return best;
}

/** One class's curve along one feature — what is drawn beside the plot.
 *  Scaled by the class prior, the same units as the true curves, so where one
 *  class's curve is highest, naive Bayes votes for that class *on that feature
 *  alone*. */
export function nbMarginal(m: NBModel, c: number, d: number, x: number): number {
  return m.priors[c]! * normalPdf(x, m.means[c]![d]!, m.vars[c]![d]!);
}

// ── The reader's curves ─────────────────────────────────────────────────────

/** What the reader drags: a centre and a spread (standard deviation) per class
 *  per feature. */
export interface Curves {
  /** [class][feature] */
  means: number[][];
  /** [class][feature] */
  sds: number[][];
}

export const SD_MIN = 0.15;
export const SD_MAX = 3;

/** Starting curves: evenly spaced, one unit wide, so there is always a model
 *  on screen to drag rather than an empty strip and an instruction to read. */
export function defaultCurves(nClasses: number, dim: number): Curves {
  const [lo, hi] = DOMAIN;
  const at = (c: number) => lo + ((c + 1) * (hi - lo)) / (nClasses + 1);
  return {
    means: Array.from({ length: nClasses }, (_, c) => new Array(dim).fill(at(c))),
    sds: Array.from({ length: nClasses }, () => new Array(dim).fill(1)),
  };
}

/** The reader's curves as a model, with the sample's priors. */
export function curvesModel(curves: Curves, priors: number[], dim: number): NBModel {
  return {
    dim,
    priors,
    means: curves.means,
    vars: curves.sds.map((row) => row.map((s) => s * s)),
  };
}

/** A copy of the curves with one value changed. */
export function setCurve(
  curves: Curves,
  part: "mean" | "sd",
  c: number,
  d: number,
  v: number,
): Curves {
  const key = part === "mean" ? "means" : "sds";
  return {
    ...curves,
    [key]: curves[key].map((row, i) =>
      i === c ? row.map((x, j) => (j === d ? v : x)) : row,
    ),
  };
}
