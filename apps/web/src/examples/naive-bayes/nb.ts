// The maths behind the distribution game: generating the ground truth, fitting
// Gaussian naive Bayes to a sample, and scoring a hand-drawn classifier against
// both of them.
//
// Three predictors get compared on the same data, and the gap between each pair
// is a separate lesson:
//
//   you    — a small ordered list of half-planes (2D) or thresholds (1D) placed
//            by hand. Unlimited flexibility on the points you can see.
//   naive  — Gaussian naive Bayes, fitted in closed form. It models each
//            feature independently: per class, per feature, a mean and a
//            variance. Nothing else.
//   Bayes  — the optimal rule, computed from the true generating distributions
//            rather than from the sample. Nobody beats this, ever; the gap
//            between it and 100% is irreducible overlap.
//
// The "naive" part is worth stating precisely, because it is what the page is
// built to show: naive Bayes assumes the features are conditionally independent
// given the class. In 2D that means its per-class density is a product of two
// 1D Gaussians, which is an ellipse *aligned to the axes*. When the true class
// is a tilted cloud, no amount of data fixes that — the model cannot represent
// the tilt. Hence the marginal curves drawn along each axis: they are not a
// summary of the model, they literally are the model.

/** A weighted Gaussian component. `dim` is 1 or 2 throughout. */
export interface Component {
  weight: number;
  mean: number[];
  /** Covariance. 1D: [[var]]. 2D: [[a,b],[b,c]], symmetric positive-definite. */
  cov: number[][];
}

/** One class of the ground truth: a prior and a mixture of Gaussians. A single
 *  component covers the spherical and correlated cases; several components give
 *  the multi-modal shapes that naive Bayes cannot represent at all. */
export interface ClassModel {
  label: string;
  prior: number;
  components: Component[];
}

export interface Point {
  x: number[];
  /** True class index. */
  y: number;
}

export type Difficulty = "round" | "tilted" | "interleaved";

export interface Scenario {
  dim: 1 | 2;
  difficulty: Difficulty;
  classes: ClassModel[];
  train: Point[];
  test: Point[];
  seed: number;
}

/** Plot domain, shared by the generator and the views. Everything is generated
 *  to sit comfortably inside this box. */
export const DOMAIN: [number, number] = [-4, 4];

// ── Random numbers ──────────────────────────────────────────────────────────

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, one standard normal per call. */
function randn(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Densities ───────────────────────────────────────────────────────────────

function normalPdf(x: number, mean: number, variance: number): number {
  const d = x - mean;
  return Math.exp(-(d * d) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);
}

/** Bivariate normal density. */
function mvnPdf2(x: number[], mean: number[], cov: number[][]): number {
  const [a, b] = [cov[0]![0]!, cov[0]![1]!];
  const c = cov[1]![1]!;
  const det = a * c - b * b;
  if (det <= 1e-12) return 0;
  const dx = x[0]! - mean[0]!;
  const dy = x[1]! - mean[1]!;
  // Inverse of [[a,b],[b,c]] is (1/det) [[c,-b],[-b,a]].
  const q = (c * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
  return Math.exp(-0.5 * q) / (2 * Math.PI * Math.sqrt(det));
}

function componentPdf(x: number[], comp: Component, dim: number): number {
  return dim === 1
    ? normalPdf(x[0]!, comp.mean[0]!, comp.cov[0]![0]!)
    : mvnPdf2(x, comp.mean, comp.cov);
}

/** Density of one class at a point — the mixture, not a single Gaussian. */
export function classDensity(x: number[], cm: ClassModel, dim: number): number {
  let s = 0;
  for (const comp of cm.components) s += comp.weight * componentPdf(x, comp, dim);
  return s;
}

/** The Bayes-optimal prediction: argmax over prior x true density. This uses
 *  the generating distributions, which no fitted model has access to, so its
 *  accuracy is the ceiling for the problem rather than a competitor's score. */
export function bayesPredict(x: number[], classes: ClassModel[], dim: number): number {
  let best = 0;
  let bestP = -Infinity;
  for (let i = 0; i < classes.length; i++) {
    const p = classes[i]!.prior * classDensity(x, classes[i]!, dim);
    if (p > bestP) {
      bestP = p;
      best = i;
    }
  }
  return best;
}

// ── Sampling ────────────────────────────────────────────────────────────────

/** Cholesky of a 2x2 SPD matrix, for correlated sampling. */
function chol2(cov: number[][]): number[][] {
  const l11 = Math.sqrt(Math.max(cov[0]![0]!, 1e-9));
  const l21 = cov[0]![1]! / l11;
  const l22 = Math.sqrt(Math.max(cov[1]![1]! - l21 * l21, 1e-9));
  return [
    [l11, 0],
    [l21, l22],
  ];
}

function sampleComponent(comp: Component, dim: number, rng: Rng): number[] {
  if (dim === 1) return [comp.mean[0]! + randn(rng) * Math.sqrt(comp.cov[0]![0]!)];
  const L = chol2(comp.cov);
  const z1 = randn(rng);
  const z2 = randn(rng);
  return [
    comp.mean[0]! + L[0]![0]! * z1,
    comp.mean[1]! + L[1]![0]! * z1 + L[1]![1]! * z2,
  ];
}

function pickComponent(cm: ClassModel, rng: Rng): Component {
  const u = rng();
  let acc = 0;
  for (const c of cm.components) {
    acc += c.weight;
    if (u <= acc) return c;
  }
  return cm.components[cm.components.length - 1]!;
}

export function sample(classes: ClassModel[], dim: number, n: number, rng: Rng): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    // Draw the class from the priors, then a component, then the point.
    const u = rng();
    let acc = 0;
    let ci = classes.length - 1;
    for (let c = 0; c < classes.length; c++) {
      acc += classes[c]!.prior;
      if (u <= acc) {
        ci = c;
        break;
      }
    }
    out.push({ x: sampleComponent(pickComponent(classes[ci]!, rng), dim, rng), y: ci });
  }
  return out;
}

// ── Generating a scenario ─────────────────────────────────────────────
//
// Gaussian naive Bayes rests on two separate assumptions, and the difficulty
// setting picks which one to break:
//
//   round     Breaks neither. Each class really is one axis-aligned Gaussian
//             blob, which is exactly what the model expects. Naive Bayes lands
//             within a point or two of optimal — worth seeing, because "naive"
//             is not a synonym for "wrong".
//   tilted    Breaks conditional independence (2D only). Long thin diagonal
//             clouds, offset along an axis.
//   two-lobed Breaks the assumption that each per-feature conditional is a
//             single Gaussian. One class arrives in two lumps with another
//             class sitting in the gap between them.
//
// Getting "tilted" to actually cost accuracy takes care. The naive boundary is
// normal to diag(Σ)⁻¹Δμ and the optimal one is normal to Σ⁻¹Δμ, so if Δμ
// happens to lie along an eigenvector of Σ the two agree exactly and the
// independence assumption costs nothing at all. The damage is maximised the
// other way round: tilt the shared covariance to ~45°, so its diagonal is very
// nearly isotropic and the naive rule is left with a boundary perpendicular to
// Δμ, then separate the means along an axis. The optimal boundary swings
// almost 45° away from that, and the gap opens to twenty points or more.

const CLASS_LABELS = ["A", "B", "C"];

/** Round, mildly elliptical, axis-aligned — the case the model was built for. */
function roundCov(rng: Rng, scale = 1): number[][] {
  const s = (0.32 + rng() * 0.3) * scale;
  const t = s * (0.85 + rng() * 0.3);
  return [
    [s, 0],
    [0, t],
  ];
}

/** R(theta) diag(long, short) R(theta)^T. */
function tiltedCov(theta: number, long: number, short: number): number[][] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [c * c * long + s * s * short, c * s * (long - short)],
    [c * s * (long - short), s * s * long + c * c * short],
  ];
}

/** Rejection-sample class means so the clouds overlap a little but stay
 *  distinguishable. Used by the round and two-lobed cases; the tilted case
 *  places its means deliberately instead. */
function spreadMeans(k: number, dim: number, rng: Rng): number[][] {
  const span = dim === 1 ? 2.6 : 2.2;
  const minGap = dim === 1 ? 1.1 : 2.0;
  for (let attempt = 0; attempt < 400; attempt++) {
    const means: number[][] = [];
    for (let i = 0; i < k; i++) {
      means.push(
        dim === 1
          ? [(rng() * 2 - 1) * span]
          : [(rng() * 2 - 1) * span, (rng() * 2 - 1) * span],
      );
    }
    let ok = true;
    for (let i = 0; i < k && ok; i++) {
      for (let j = i + 1; j < k && ok; j++) {
        let d2 = 0;
        for (let t = 0; t < dim; t++) {
          const d = means[i]![t]! - means[j]![t]!;
          d2 += d * d;
        }
        if (Math.sqrt(d2) < minGap) ok = false;
      }
    }
    if (ok) return means;
  }
  return Array.from({ length: k }, (_, i) => {
    const a = (2 * Math.PI * i) / k;
    return dim === 1 ? [(i - (k - 1) / 2) * 1.8] : [2 * Math.cos(a), 2 * Math.sin(a)];
  });
}

function normalisedPriors(k: number, rng: Rng): number[] {
  const raw = Array.from({ length: k }, () => 0.85 + rng() * 0.45);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum);
}

/** Long thin diagonal clouds, separated along an axis. Every class shares the
 *  same covariance, so the picture reads as parallel cigars and the only thing
 *  naive Bayes is missing is the tilt. */
function tiltedClasses(k: number, rng: Rng): ClassModel[] {
  // Close to 45 degrees, either diagonal, so diag(cov) is nearly isotropic.
  const theta = (rng() < 0.5 ? 1 : -1) * ((40 + rng() * 10) * Math.PI) / 180;
  const long = 1.2 + rng() * 0.5;
  const short = 0.04 + rng() * 0.03;
  const cov = tiltedCov(theta, long, short);
  // Offset along one axis — the direction furthest from an eigenvector.
  const axis = rng() < 0.5 ? 0 : 1;
  const gap = k === 2 ? 1.05 + rng() * 0.3 : 1.15 + rng() * 0.25;
  const priors = normalisedPriors(k, rng);
  return Array.from({ length: k }, (_, i) => {
    const offset = (i - (k - 1) / 2) * gap;
    const mean = [0, 0];
    mean[axis] = offset;
    mean[1 - axis] = (rng() * 2 - 1) * 0.25;
    return {
      label: CLASS_LABELS[i]!,
      prior: priors[i]!,
      components: [{ weight: 1, mean, cov }],
    };
  });
}

/** Interleaved lumps — the arrangement naive Bayes genuinely cannot represent.
 *
 *  A wide class simply wrapped around a narrow one does *not* defeat it: when
 *  the fitted variances differ, the per-feature Gaussians cross twice and the
 *  boundary comes out quadratic, carving a middle region out on its own. Naive
 *  Bayes handles that case well, and pretending otherwise would be a lie.
 *
 *  What defeats it is making the two classes share their marginals. In 2D that
 *  is a checkerboard: put one class on one diagonal and the other on the other,
 *  and each class is bimodal at the same two places along *both* axes. Feature
 *  by feature the two classes are now indistinguishable, so a model that only
 *  ever looks at one feature at a time is reduced to guessing — while the joint
 *  distribution separates them almost perfectly. The 1D version interleaves
 *  three lumps with two.
 *
 *  This is the same shape as the XOR that stumps a greedy decision tree: the
 *  signal lives entirely in the interaction between features, and never in
 *  either feature alone. */
function interleavedClasses(k: number, dim: number, rng: Rng): ClassModel[] {
  const priors = normalisedPriors(k, rng);
  const tight = () => roundCov(rng, 0.3);

  if (dim === 1) {
    const c = (rng() * 2 - 1) * 0.4;
    const wide = 1.75 + rng() * 0.25;
    const narrow = wide / 2;
    const classes: ClassModel[] = [
      {
        label: CLASS_LABELS[0]!,
        prior: priors[0]!,
        components: [-wide, 0, wide].map((o) => ({
          weight: 1 / 3,
          mean: [c + o],
          cov: tight(),
        })),
      },
      {
        label: CLASS_LABELS[1]!,
        prior: priors[1]!,
        components: [-narrow, narrow].map((o) => ({
          weight: 0.5,
          mean: [c + o],
          cov: tight(),
        })),
      },
    ];
    if (k === 3) {
      classes.push({
        label: CLASS_LABELS[2]!,
        prior: priors[2]!,
        components: [{ weight: 1, mean: [c + wide * 1.6], cov: tight() }],
      });
    }
    return classes;
  }

  // Near 45 degrees so both classes project onto the *same* two bumps on each
  // axis. Away from 45 the marginals start to differ and the trick weakens.
  const theta = ((rng() < 0.5 ? 45 : -45) + (rng() * 16 - 8)) * (Math.PI / 180);
  const u: [number, number] = [Math.cos(theta), Math.sin(theta)];
  const v: [number, number] = [-u[1]!, u[0]!];
  const c = [(rng() * 2 - 1) * 0.5, (rng() * 2 - 1) * 0.5];
  const reach = 1.7 + rng() * 0.3;
  const lobes = (d: [number, number]): Component[] => [
    { weight: 0.5, mean: [c[0]! + reach * d[0]!, c[1]! + reach * d[1]!], cov: tight() },
    { weight: 0.5, mean: [c[0]! - reach * d[0]!, c[1]! - reach * d[1]!], cov: tight() },
  ];

  const classes: ClassModel[] = [
    { label: CLASS_LABELS[0]!, prior: priors[0]!, components: lobes(u) },
    { label: CLASS_LABELS[1]!, prior: priors[1]!, components: lobes(v) },
  ];
  if (k === 3) {
    // Third class parked clear of the checkerboard, on an axis between the
    // diagonals, so it stays separable and does not muddy the demonstration.
    const away = 2.9 + rng() * 0.4;
    const dir = rng() < 0.5 ? [1, 0] : [0, 1];
    classes.push({
      label: CLASS_LABELS[2]!,
      prior: priors[2]!,
      components: [
        { weight: 1, mean: [c[0]! + away * dir[0]!, c[1]! + away * dir[1]!], cov: tight() },
      ],
    });
  }
  return classes;
}

function roundClasses(k: number, dim: number, rng: Rng): ClassModel[] {
  const means = spreadMeans(k, dim, rng);
  const priors = normalisedPriors(k, rng);
  return means.map((mean, i) => ({
    label: CLASS_LABELS[i]!,
    prior: priors[i]!,
    components: [{ weight: 1, mean, cov: roundCov(rng) }],
  }));
}

export interface ScenarioOptions {
  dim: 1 | 2;
  nClasses: 2 | 3;
  difficulty: Difficulty;
  seed: number;
  nTrain?: number;
  nTest?: number;
}

/** True when a difficulty setting is meaningful for a given number of features.
 *
 *  With one feature there is nothing to be naive *about*: conditional
 *  independence is a statement about how features relate to each other, and a
 *  lone feature has no relationships. In 1D, Gaussian naive Bayes is simply a
 *  Gaussian classifier and it is optimal whenever the classes really are
 *  Gaussian. The page uses this to explain why the option is unavailable rather
 *  than quietly hiding it. */
export function difficultyApplies(d: Difficulty, dim: 1 | 2): boolean {
  return d === "tilted" ? dim === 2 : true;
}

export function makeScenario(opts: ScenarioOptions): Scenario {
  const { dim, nClasses, seed } = opts;
  const difficulty = difficultyApplies(opts.difficulty, dim)
    ? opts.difficulty
    : "round";
  const rng = makeRng(seed);

  const classes =
    difficulty === "tilted"
      ? tiltedClasses(nClasses, rng)
      : difficulty === "interleaved"
        ? interleavedClasses(nClasses, dim, rng)
        : roundClasses(nClasses, dim, rng);

  const nTrain = opts.nTrain ?? 60;
  const nTest = opts.nTest ?? 600;
  return {
    dim,
    difficulty,
    classes,
    train: sample(classes, dim, nTrain, rng),
    test: sample(classes, dim, nTest, rng),
    seed,
  };
}

// ── Gaussian naive Bayes ────────────────────────────────────────────────────

/** The entire fitted model: for each class, a prior and one (mean, variance)
 *  per feature. Note what is absent — there is no covariance term anywhere, and
 *  that absence is the whole lesson. */
export interface NBModel {
  dim: number;
  priors: number[];
  /** [class][feature] */
  means: number[][];
  /** [class][feature] */
  vars: number[][];
  /** Classes with no training points, which the page should mention. */
  empty: number[];
}

/** Variance floor. Guards against a class with one point (or a perfectly
 *  co-linear one) collapsing to a zero-width spike. */
const VAR_FLOOR = 0.02;

export function fitNaiveBayes(points: Point[], nClasses: number, dim: number): NBModel {
  const priors = new Array(nClasses).fill(0);
  const means = Array.from({ length: nClasses }, () => new Array(dim).fill(0));
  const vars = Array.from({ length: nClasses }, () => new Array(dim).fill(VAR_FLOOR));
  const counts = new Array(nClasses).fill(0);

  for (const p of points) {
    counts[p.y]!++;
    for (let d = 0; d < dim; d++) means[p.y]![d] += p.x[d]!;
  }
  const empty: number[] = [];
  for (let c = 0; c < nClasses; c++) {
    if (counts[c]! === 0) {
      empty.push(c);
      continue;
    }
    for (let d = 0; d < dim; d++) means[c]![d] /= counts[c]!;
  }
  for (const p of points) {
    for (let d = 0; d < dim; d++) {
      const diff = p.x[d]! - means[p.y]![d]!;
      vars[p.y]![d] += diff * diff;
    }
  }
  for (let c = 0; c < nClasses; c++) {
    priors[c] = counts[c]! / Math.max(points.length, 1);
    if (counts[c]! === 0) continue;
    for (let d = 0; d < dim; d++) {
      vars[c]![d] = Math.max(vars[c]![d]! / counts[c]!, VAR_FLOOR);
    }
  }
  return { dim, priors, means, vars, empty };
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

/** The fitted per-feature curve for one class — what gets drawn in the margin.
 *  Scaled by the class prior so the curves are directly comparable: where one
 *  class's curve is highest, naive Bayes votes for that class *on that feature
 *  alone*. */
export function nbMarginal(m: NBModel, c: number, d: number, x: number): number {
  return m.priors[c]! * normalPdf(x, m.means[c]![d]!, m.vars[c]![d]!);
}

// ── The hand-placed classifier ──────────────────────────────────────────────

/** One straight boundary, defined by two draggable endpoints. `captures` is the
 *  class assigned to the positive side; everything else falls through to the
 *  next rule.
 *
 *  Rules apply in order, which is the honest way to cover three classes with
 *  straight lines: peel one class off, then split what remains. Two lines and
 *  an ordering, for what naive Bayes does with no lines at all — that ordering
 *  is exactly where "just draw the boundary" stops being simple. */
export interface LineRule {
  id: string;
  p1: [number, number];
  p2: [number, number];
  flipped: boolean;
  captures: number;
}

/** Which side of the line a point falls on. */
export function lineSide(x: number[], rule: LineRule): boolean {
  const cross =
    (rule.p2[0]! - rule.p1[0]!) * (x[1]! - rule.p1[1]!) -
    (rule.p2[1]! - rule.p1[1]!) * (x[0]! - rule.p1[0]!);
  return rule.flipped ? cross < 0 : cross >= 0;
}

export interface Student2D {
  kind: "lines";
  rules: LineRule[];
  /** Class for anything no rule captures. */
  fallback: number;
}

export interface Student1D {
  kind: "cuts";
  /** Ascending cut positions; k classes need k-1 of them. */
  cuts: number[];
  /** Class for each interval; length is cuts.length + 1. */
  labels: number[];
}

export type StudentClassifier = Student2D | Student1D;

export function studentPredict(x: number[], s: StudentClassifier): number {
  if (s.kind === "cuts") {
    const sorted = [...s.cuts].sort((a, b) => a - b);
    let i = 0;
    while (i < sorted.length && x[0]! > sorted[i]!) i++;
    return s.labels[Math.min(i, s.labels.length - 1)]!;
  }
  for (const rule of s.rules) if (lineSide(x, rule)) return rule.captures;
  return s.fallback;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function scoreOf(points: Point[], predict: (x: number[]) => number): number {
  if (points.length === 0) return 0;
  let ok = 0;
  for (const p of points) if (predict(p.x) === p.y) ok++;
  return ok / points.length;
}

export interface Scores {
  train: number;
  test: number;
}

export function scoreBoth(sc: Scenario, predict: (x: number[]) => number): Scores {
  return { train: scoreOf(sc.train, predict), test: scoreOf(sc.test, predict) };
}

// ── Drawing helpers ─────────────────────────────────────────────────────────

export interface EllipseSpec {
  cx: number;
  cy: number;
  /** Semi-axes in data units, at one standard deviation. */
  rx: number;
  ry: number;
  /** Rotation in degrees, counter-clockwise in data space. */
  angle: number;
}

/** The one-sigma ellipse of a 2x2 covariance, via its eigen-decomposition.
 *
 *  Drawing the true ellipse next to the fitted one is the most direct statement
 *  of what naive Bayes gives up: the fitted ellipse can stretch along x and
 *  along y, but it can never turn. */
export function covEllipse(mean: number[], cov: number[][]): EllipseSpec {
  const a = cov[0]![0]!;
  const b = cov[0]![1]!;
  const c = cov[1]![1]!;
  const tr = a + c;
  const det = a * c - b * b;
  const disc = Math.sqrt(Math.max(tr * tr / 4 - det, 0));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  // Eigenvector for the larger eigenvalue.
  const angle =
    Math.abs(b) < 1e-12 ? (a >= c ? 0 : Math.PI / 2) : Math.atan2(l1 - a, b);
  return {
    cx: mean[0]!,
    cy: mean[1]!,
    rx: Math.sqrt(Math.max(l1, 1e-9)),
    ry: Math.sqrt(Math.max(l2, 1e-9)),
    angle: (angle * 180) / Math.PI,
  };
}

/** The ellipse naive Bayes fitted for one class — axis-aligned by construction,
 *  because the model has no parameter that could tilt it. */
export function nbEllipse(m: NBModel, c: number): EllipseSpec {
  return {
    cx: m.means[c]![0]!,
    cy: m.means[c]![1]!,
    rx: Math.sqrt(m.vars[c]![0]!),
    ry: Math.sqrt(m.vars[c]![1]!),
    angle: 0,
  };
}

/** Extend the segment through p1/p2 until it meets the edges of the domain box,
 *  so a hand-placed boundary always reads as an infinite line rather than a
 *  floating stick. Returns null for a degenerate (zero-length) rule. */
export function clipLineToBox(
  p1: [number, number],
  p2: [number, number],
  lo: number,
  hi: number,
): [[number, number], [number, number]] | null {
  const dx = p2[0]! - p1[0]!;
  const dy = p2[1]! - p1[1]!;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  // Parametric p1 + t*d, clipped with Liang–Barsky against the box.
  let tMin = -Infinity;
  let tMax = Infinity;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) tMin = Math.max(tMin, r);
    else tMax = Math.min(tMax, r);
    return true;
  };
  if (
    !clip(-dx, p1[0]! - lo) ||
    !clip(dx, hi - p1[0]!) ||
    !clip(-dy, p1[1]! - lo) ||
    !clip(dy, hi - p1[1]!) ||
    tMin > tMax
  ) {
    return null;
  }
  return [
    [p1[0]! + tMin * dx, p1[1]! + tMin * dy],
    [p1[0]! + tMax * dx, p1[1]! + tMax * dy],
  ];
}

/** Starting boundaries for a fresh scenario: evenly spaced horizontal lines
 *  that already separate *something*, so there is always a classifier on screen
 *  to drag rather than an empty canvas and an instruction to read. */
export function defaultRules(nClasses: number): LineRule[] {
  const n = nClasses - 1;
  return Array.from({ length: n }, (_, i) => {
    const y = DOMAIN[1]! - ((i + 1) * (DOMAIN[1]! - DOMAIN[0]!)) / (n + 1);
    return {
      id: `rule-${i}`,
      p1: [DOMAIN[0]! + 0.6, y] as [number, number],
      p2: [DOMAIN[1]! - 0.6, y] as [number, number],
      flipped: false,
      captures: i,
    };
  });
}

/** Starting cuts for the 1D view — evenly spaced across the domain. */
export function defaultCuts(nClasses: number): Student1D {
  const n = nClasses - 1;
  const cuts = Array.from(
    { length: n },
    (_, i) => DOMAIN[0]! + ((i + 1) * (DOMAIN[1]! - DOMAIN[0]!)) / (n + 1),
  );
  return { kind: "cuts", cuts, labels: Array.from({ length: n + 1 }, (_, i) => i) };
}

/** Search seeds for the scenario that embarrasses naive Bayes the most.
 *
 *  A random draw from a difficulty setting varies a lot: a "tilted" scenario
 *  might happen to place its means near an eigenvector, where the independence
 *  assumption costs nothing. Rather than making a student re-roll and hope,
 *  this scans candidate seeds and returns the one with the widest gap between
 *  the optimal rule and the fitted naive one. Everything is measured on the
 *  held-out sample, so the gap being maximised is a real generalisation gap and
 *  not an artefact of the training draw. */
export function findRevealingSeed(
  opts: Omit<ScenarioOptions, "seed">,
  startSeed: number,
  tries = 24,
): { seed: number; gap: number } {
  let best = { seed: startSeed, gap: -Infinity };
  for (let i = 0; i < tries; i++) {
    const seed = startSeed + i * 7919;
    const sc = makeScenario({ ...opts, seed });
    const m = fitNaiveBayes(sc.train, opts.nClasses, opts.dim);
    const nb = scoreOf(sc.test, (x) => nbPredict(x, m));
    const by = scoreOf(sc.test, (x) => bayesPredict(x, sc.classes, sc.dim));
    if (by - nb > best.gap) best = { seed, gap: by - nb };
  }
  return best;
}
