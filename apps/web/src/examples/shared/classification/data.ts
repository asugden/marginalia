// The data behind the classification examples: the true generating
// distributions, sampling from them, the Bayes-optimal rule, and scoring.
//
// Shared by the naive Bayes and support vector machine examples, so both draw
// from the same three kinds of data and a student can carry what they learned
// about a shape from one page to the other. Everything is generated in the
// browser from a seed, so a given seed always replays.
//
// Three shapes of data, each built to show one thing:
//
//   round        each class is one roughly round blob.
//   tilted       long diagonal clouds offset along an axis (two features only):
//                the features move together.
//   interleaved  classes that share their per-feature curves: a checkerboard in
//                two features, lumps interleaved in one. The signal lives only in
//                how the features combine.

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

export function normalPdf(x: number, mean: number, variance: number): number {
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
// The shapes were designed against Gaussian naive Bayes, which rests on two
// separate assumptions; each shape breaks a chosen one:
//
//   round     Breaks neither. Each class really is one axis-aligned Gaussian
//             blob, which is exactly what the model expects. Naive Bayes lands
//             within a point or two of optimal — worth seeing, because "naive"
//             is not a synonym for "wrong".
//   tilted    Breaks conditional independence (2D only). Long thin diagonal
//             clouds, offset along an axis.
//   interleaved
//             Breaks the assumption that each per-feature conditional is a
//             single Gaussian: the classes share their per-feature curves.
//
// For a straight-line classifier (the SVM) the same three read differently:
// round and tilted are both separable by a line — tilted, with its shared
// covariance, is exactly the case where the best boundary IS a line — and
// interleaved is not, because no single line splits a checkerboard.
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
 *  distinguishable. Used by the round and interleaved cases; the tilted case
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
 *  either feature alone.
 *
 *  About half the draws are clean: tight lumps that barely touch, and a
 *  ceiling near 100%. The rest are soft: wider lumps set closer together, so
 *  the classes overlap and each class's true curve along a feature reads as
 *  one lumpy shape rather than separate spikes. The marginals are still
 *  shared, so naive Bayes is no better off. */
function interleavedClasses(k: number, dim: number, rng: Rng): ClassModel[] {
  const priors = normalisedPriors(k, rng);
  const soft = rng() < 0.5;
  // One feature packs its lumps closer together already, so it needs less
  // widening to overlap; the soft ceiling lands near 85–90% in both.
  const lumpScale = !soft ? 0.3 : dim === 1 ? 0.4 + rng() * 0.15 : 0.9 + rng() * 0.4;
  // Closer lumps in two features when soft, so they run into one another.
  const pull = soft && dim === 2 ? 0.85 : 1;
  const tight = () => roundCov(rng, lumpScale);

  if (dim === 1) {
    const c = (rng() * 2 - 1) * 0.4;
    const wide = (1.75 + rng() * 0.25) * pull;
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
  const reach = (1.7 + rng() * 0.3) * pull;
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

// ── The true curve for one feature ──────────────────────────────────────────

/** The true density of one class along one feature, scaled by the class prior:
 *  what the class looks like when the other feature is ignored. For a mixture
 *  of Gaussians this is a mixture of 1D Gaussians, each with the component's
 *  mean and its variance along that axis. Drawn beside the plot, it is what a
 *  model that looks at one feature at a time is trying to match. */
export function trueMarginal(cm: ClassModel, d: number, x: number): number {
  let s = 0;
  for (const comp of cm.components) {
    s += comp.weight * normalPdf(x, comp.mean[d]!, comp.cov[d]![d]!);
  }
  return cm.prior * s;
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

