// A small, dependency-free CART implementation, written for teaching rather
// than for speed.
//
// Every function here is built so a visualization can show its *working*, not
// just its answer. The split search returns the score of every candidate it
// considered — including the losers — because "why is this feature at the root
// and not that one?" is the question a decision-tree diagram normally hides.
//
// Two feature kinds, deliberately kept distinct:
//
//   binary  — one candidate split ("no" vs "yes"). A binary feature is
//             *exhausted* once it has been split on: every row below that node
//             shares the same value, so splitting again scores exactly 0.
//   numeric — one candidate per midpoint between consecutive distinct values.
//             A numeric feature is never exhausted; a tree routinely comes back
//             to the same feature at a deeper level with a tighter threshold.
//
// That asymmetry is a teaching point, so the code keeps it explicit instead of
// smoothing it away.
//
// Datasets here are tens of rows, so everything is the naive O(n · features ·
// thresholds) search. No histogram binning, no sorting cache, no pruning.

/** How a feature is split. */
export type FeatureKind = "binary" | "numeric";

export interface Feature {
  /** Machine key, unique within a dataset. */
  key: string;
  /** Short display name, lowercase: "feathers", "ear length". */
  name: string;
  kind: FeatureKind;
  /** Numeric only: unit shown in the split question, e.g. "cm". */
  unit?: string;
  /** Binary only: the plain-English question, e.g. "Has feathers?". */
  ask?: string;
  /** Marks a feature planted as pure noise, so a page can call it out. */
  noise?: boolean;
}

export interface Row {
  /** Stable id. */
  id: string;
  /** Display name for the row: "duck", "Biscuit". */
  label: string;
  /** One value per dataset feature; binary features are 0 or 1. */
  x: number[];
  /** Class index for classification, or the target value for regression. */
  y: number;
}

export interface Dataset {
  key: string;
  title: string;
  /** One sentence for the page. */
  blurb: string;
  features: Feature[];
  rows: Row[];
  /** Classification only: class names, indexed by `Row.y`. */
  classes?: string[];
  /** Regression only: what `Row.y` measures. */
  target?: { name: string; unit?: string };
}

export function isRegression(d: Dataset): boolean {
  return d.classes === undefined;
}

/** The plain-English question a split asks. Binary and numeric splits render
 *  with the same shape — a question, answered no or yes — so the tree diagram
 *  never has to fall back on threshold notation. */
export function splitQuestion(f: Feature, threshold: number): string {
  if (f.kind === "binary") return f.ask ?? `${sentenceCase(f.name)}?`;
  const unit = f.unit ? ` ${f.unit}` : "";
  return `${sentenceCase(f.name)} over ${formatNumber(threshold)}${unit}?`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

// ── Impurity ────────────────────────────────────────────────────────────────

export type Criterion = "gini" | "entropy" | "variance";

/** Class counts for a set of rows. */
export function classCounts(rows: Row[], nClasses: number): number[] {
  const c = new Array<number>(nClasses).fill(0);
  for (const r of rows) c[r.y]!++;
  return c;
}

export function gini(counts: number[], n: number): number {
  if (n === 0) return 0;
  let s = 0;
  for (const c of counts) {
    const p = c / n;
    s += p * p;
  }
  return 1 - s;
}

export function entropy(counts: number[], n: number): number {
  if (n === 0) return 0;
  let s = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / n;
    s -= p * Math.log2(p);
  }
  return s;
}

/** Population variance of the targets — the regression criterion. Leaves
 *  predict the mean, and variance is the average squared error of that
 *  prediction, so reducing variance *is* reducing training error. */
export function variance(rows: Row[]): number {
  const n = rows.length;
  if (n === 0) return 0;
  let m = 0;
  for (const r of rows) m += r.y;
  m /= n;
  let s = 0;
  for (const r of rows) {
    const d = r.y - m;
    s += d * d;
  }
  return s / n;
}

export function mean(rows: Row[]): number {
  if (rows.length === 0) return 0;
  let m = 0;
  for (const r of rows) m += r.y;
  return m / rows.length;
}

/** Impurity of a row set under a criterion. */
export function impurityOf(rows: Row[], criterion: Criterion, nClasses: number): number {
  if (criterion === "variance") return variance(rows);
  const counts = classCounts(rows, nClasses);
  return criterion === "gini" ? gini(counts, rows.length) : entropy(counts, rows.length);
}

// ── Split search ────────────────────────────────────────────────────────────

/** One threshold considered for one feature. */
export interface ThresholdScore {
  threshold: number;
  gain: number;
  nLeft: number;
  nRight: number;
}

/** Everything the search learned about one feature at one node — the winning
 *  threshold plus, for numeric features, the full curve of gain against
 *  threshold. Pages draw the curve; the tree only needs `best`. */
export interface Candidate {
  featureIndex: number;
  /** Best threshold for this feature, or null when no split is possible
   *  (every row shares a value — e.g. a binary feature already used above). */
  best: ThresholdScore | null;
  /** Numeric features: every midpoint scored, in ascending threshold order.
   *  Binary features: the single candidate. */
  curve: ThresholdScore[];
  /** True when the feature cannot split these rows at all. */
  exhausted: boolean;
}

export interface SplitSearch {
  /** Parent impurity, the baseline every gain is measured against. */
  impurity: number;
  /** One entry per feature, in dataset feature order — losers included. */
  candidates: Candidate[];
  /** Index into `candidates` of the highest-gain split, or -1 if none has
   *  positive gain. Ties resolve to the earliest feature, which is why a page
   *  showing a tie must say so rather than implying the winner was chosen. */
  winner: number;
  /** True when two or more candidates share the top gain. */
  tied: boolean;
}

const EPS = 1e-9;

/** Midpoints between consecutive distinct values — the only thresholds worth
 *  testing, since gain is constant between them. */
function numericThresholds(rows: Row[], fi: number): number[] {
  const vals = Array.from(new Set(rows.map((r) => r.x[fi]!))).sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i + 1 < vals.length; i++) out.push((vals[i]! + vals[i + 1]!) / 2);
  return out;
}

export interface SearchOptions {
  criterion: Criterion;
  nClasses: number;
  minSamplesLeaf?: number;
  /** Restrict the search to these feature indices (random forests draw a fresh
   *  subset at every node). Undefined means consider all features. */
  featureSubset?: number[];
}

/** Score every candidate split of `rows`. This is the heart of tree growing,
 *  and the function a page calls when it wants to *show* the choice. */
export function searchSplits(
  rows: Row[],
  features: Feature[],
  opts: SearchOptions,
): SplitSearch {
  const { criterion, nClasses } = opts;
  const minLeaf = opts.minSamplesLeaf ?? 1;
  const parent = impurityOf(rows, criterion, nClasses);
  const n = rows.length;
  const allowed = opts.featureSubset
    ? new Set(opts.featureSubset)
    : null;

  const candidates: Candidate[] = features.map((f, fi) => {
    if (allowed && !allowed.has(fi)) {
      return { featureIndex: fi, best: null, curve: [], exhausted: true };
    }
    const thresholds =
      f.kind === "binary" ? [0.5] : numericThresholds(rows, fi);
    const curve: ThresholdScore[] = [];
    for (const t of thresholds) {
      const left: Row[] = [];
      const right: Row[] = [];
      for (const r of rows) (r.x[fi]! <= t ? left : right).push(r);
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const gain =
        parent -
        (left.length / n) * impurityOf(left, criterion, nClasses) -
        (right.length / n) * impurityOf(right, criterion, nClasses);
      curve.push({ threshold: t, gain, nLeft: left.length, nRight: right.length });
    }
    let best: ThresholdScore | null = null;
    for (const c of curve) if (!best || c.gain > best.gain + EPS) best = c;
    return { featureIndex: fi, best, curve, exhausted: curve.length === 0 };
  });

  let winner = -1;
  let topGain = EPS;
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i]!.best;
    if (b && b.gain > topGain + EPS) {
      topGain = b.gain;
      winner = i;
    }
  }
  let tied = false;
  if (winner >= 0) {
    let atTop = 0;
    for (const c of candidates) {
      if (c.best && Math.abs(c.best.gain - topGain) <= EPS) atTop++;
    }
    tied = atTop > 1;
  }

  return { impurity: parent, candidates, winner, tied };
}

// ── Growing a tree ──────────────────────────────────────────────────────────

export interface TreeSplit {
  featureIndex: number;
  threshold: number;
  gain: number;
}

export interface TreeNode {
  /** Path-derived id: "r", "r.L", "r.L.R", … — stable across regrows. */
  id: string;
  depth: number;
  rows: Row[];
  impurity: number;
  /** Class index (classification) or mean target (regression). */
  prediction: number;
  /** Classification only. */
  counts?: number[];
  split?: TreeSplit;
  left?: TreeNode;
  right?: TreeNode;
}

export interface GrowOptions {
  criterion: Criterion;
  nClasses: number;
  maxDepth: number;
  minSamplesLeaf?: number;
  minSamplesSplit?: number;
  /** Random forests: how many features to draw at each node. Undefined uses
   *  all of them, which is plain CART. */
  featuresPerSplit?: number;
  rng?: Rng;
}

export function growTree(
  rows: Row[],
  features: Feature[],
  opts: GrowOptions,
  id = "r",
  depth = 0,
): TreeNode {
  const { criterion, nClasses } = opts;
  const node: TreeNode = {
    id,
    depth,
    rows,
    impurity: impurityOf(rows, criterion, nClasses),
    prediction: 0,
  };
  if (criterion === "variance") {
    node.prediction = mean(rows);
  } else {
    const counts = classCounts(rows, nClasses);
    node.counts = counts;
    node.prediction = counts.indexOf(Math.max(...counts));
  }

  const minSplit = opts.minSamplesSplit ?? 2;
  if (depth >= opts.maxDepth || rows.length < minSplit || node.impurity <= EPS) {
    return node;
  }

  const subset = opts.featuresPerSplit
    ? drawSubset(features.length, opts.featuresPerSplit, opts.rng ?? Math.random)
    : undefined;
  const search = searchSplits(rows, features, {
    criterion,
    nClasses,
    minSamplesLeaf: opts.minSamplesLeaf,
    featureSubset: subset,
  });
  if (search.winner < 0) return node;

  const cand = search.candidates[search.winner]!;
  const best = cand.best!;
  node.split = {
    featureIndex: cand.featureIndex,
    threshold: best.threshold,
    gain: best.gain,
  };
  const left: Row[] = [];
  const right: Row[] = [];
  for (const r of rows) {
    (r.x[cand.featureIndex]! <= best.threshold ? left : right).push(r);
  }
  node.left = growTree(left, features, opts, `${id}.L`, depth + 1);
  node.right = growTree(right, features, opts, `${id}.R`, depth + 1);
  return node;
}

/** Route one row to its leaf. */
export function leafFor(node: TreeNode, x: number[]): TreeNode {
  let cur = node;
  while (cur.split && cur.left && cur.right) {
    cur = x[cur.split.featureIndex]! <= cur.split.threshold ? cur.left : cur.right;
  }
  return cur;
}

/** The root-to-leaf path a row takes, for highlighting in a diagram. */
export function pathFor(node: TreeNode, x: number[]): TreeNode[] {
  const path = [node];
  let cur = node;
  while (cur.split && cur.left && cur.right) {
    cur = x[cur.split.featureIndex]! <= cur.split.threshold ? cur.left : cur.right;
    path.push(cur);
  }
  return path;
}

export function predict(node: TreeNode, x: number[]): number {
  return leafFor(node, x).prediction;
}

/** Training accuracy (classification) — the number a lesson quotes. */
export function accuracy(tree: TreeNode, rows: Row[]): number {
  if (rows.length === 0) return 0;
  let ok = 0;
  for (const r of rows) if (predict(tree, r.x) === r.y) ok++;
  return ok / rows.length;
}

/** Mean squared error (regression). */
export function mse(tree: TreeNode, rows: Row[]): number {
  if (rows.length === 0) return 0;
  let s = 0;
  for (const r of rows) {
    const d = r.y - predict(tree, r.x);
    s += d * d;
  }
  return s / rows.length;
}

export function countLeaves(node: TreeNode): number {
  if (!node.left || !node.right) return 1;
  return countLeaves(node.left) + countLeaves(node.right);
}

export function treeDepth(node: TreeNode): number {
  if (!node.left || !node.right) return node.depth;
  return Math.max(treeDepth(node.left), treeDepth(node.right));
}

export function walk(node: TreeNode, fn: (n: TreeNode) => void): void {
  fn(node);
  if (node.left) walk(node.left, fn);
  if (node.right) walk(node.right, fn);
}

// ── Exhaustive search, for the greedy-vs-optimal comparison ────────────────

/** Grow the *best possible* tree of a given depth by trying every combination
 *  of splits, rather than taking the highest-gain split at each node.
 *
 *  This is exponential and only exists to make one point: greedy tree growing
 *  optimizes each split in isolation, and a split that scores badly on its own
 *  can set up a pair that scores perfectly. Keep it to depth <= 3 on binary
 *  features. */
export function growOptimalTree(
  rows: Row[],
  features: Feature[],
  opts: { criterion: Criterion; nClasses: number; maxDepth: number },
  id = "r",
  depth = 0,
): TreeNode {
  const { criterion, nClasses } = opts;
  const base: TreeNode = {
    id,
    depth,
    rows,
    impurity: impurityOf(rows, criterion, nClasses),
    prediction: 0,
  };
  if (criterion === "variance") {
    base.prediction = mean(rows);
  } else {
    const counts = classCounts(rows, nClasses);
    base.counts = counts;
    base.prediction = counts.indexOf(Math.max(...counts));
  }
  if (depth >= opts.maxDepth || rows.length < 2 || base.impurity <= EPS) return base;

  let bestNode: TreeNode | null = null;
  let bestErr = Infinity;

  const search = searchSplits(rows, features, { criterion, nClasses });
  for (const cand of search.candidates) {
    for (const t of cand.curve) {
      const left: Row[] = [];
      const right: Row[] = [];
      for (const r of rows) {
        (r.x[cand.featureIndex]! <= t.threshold ? left : right).push(r);
      }
      const l = growOptimalTree(left, features, opts, `${id}.L`, depth + 1);
      const rr = growOptimalTree(right, features, opts, `${id}.R`, depth + 1);
      const err = subtreeError(l, criterion) + subtreeError(rr, criterion);
      if (err < bestErr - EPS) {
        bestErr = err;
        bestNode = {
          ...base,
          split: { featureIndex: cand.featureIndex, threshold: t.threshold, gain: t.gain },
          left: l,
          right: rr,
        };
      }
    }
  }
  return bestNode ?? base;
}

/** Total training error under a subtree — misclassified rows, or summed
 *  squared error. The quantity the exhaustive search minimizes. */
function subtreeError(node: TreeNode, criterion: Criterion): number {
  if (node.left && node.right) {
    return subtreeError(node.left, criterion) + subtreeError(node.right, criterion);
  }
  if (criterion === "variance") {
    let s = 0;
    for (const r of node.rows) {
      const d = r.y - node.prediction;
      s += d * d;
    }
    return s;
  }
  let wrong = 0;
  for (const r of node.rows) if (r.y !== node.prediction) wrong++;
  return wrong;
}

// ── Seeded randomness ───────────────────────────────────────────────────────

export type Rng = () => number;

/** mulberry32 — small, fast, and seeded, so a forest looks the same on every
 *  page load and an instructor can point at "tree 7" twice. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `k` distinct feature indices out of `n`, drawn without replacement. */
export function drawSubset(n: number, k: number, rng: Rng): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  const take = Math.max(1, Math.min(k, n));
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [idx[i]!, idx[j]!] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, take).sort((a, b) => a - b);
}

/** A bootstrap resample: `rows.length` draws with replacement. Returns the
 *  sample plus the out-of-bag rows, which are what a forest scores itself on. */
export function bootstrap(rows: Row[], rng: Rng): { sample: Row[]; oob: Row[] } {
  const sample: Row[] = [];
  const picked = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    const j = Math.floor(rng() * rows.length);
    picked.add(j);
    sample.push(rows[j]!);
  }
  const oob = rows.filter((_, i) => !picked.has(i));
  return { sample, oob };
}

/** Grow a tree whose root split is dictated rather than chosen, then grow the
 *  rest greedily as normal.
 *
 *  Used to make a point that a single finished diagram cannot: on a dataset
 *  with pure leaves, every ordering of the features classifies perfectly, so
 *  the ordering a tree diagram appears to endorse carries no information. Force
 *  each feature to the root in turn and the accuracy never moves. */
export function growWithForcedRoot(
  rows: Row[],
  features: Feature[],
  opts: GrowOptions,
  featureIndex: number,
): TreeNode {
  const { criterion, nClasses } = opts;
  const node: TreeNode = {
    id: "r",
    depth: 0,
    rows,
    impurity: impurityOf(rows, criterion, nClasses),
    prediction: 0,
  };
  if (criterion === "variance") {
    node.prediction = mean(rows);
  } else {
    const counts = classCounts(rows, nClasses);
    node.counts = counts;
    node.prediction = counts.indexOf(Math.max(...counts));
  }

  const search = searchSplits(rows, features, {
    criterion,
    nClasses,
    minSamplesLeaf: opts.minSamplesLeaf,
    featureSubset: [featureIndex],
  });
  const cand = search.candidates[featureIndex];
  if (!cand?.best) return node;

  node.split = {
    featureIndex,
    threshold: cand.best.threshold,
    gain: cand.best.gain,
  };
  const left: Row[] = [];
  const right: Row[] = [];
  for (const r of rows) {
    (r.x[featureIndex]! <= cand.best.threshold ? left : right).push(r);
  }
  node.left = growTree(left, features, opts, "r.L", 1);
  node.right = growTree(right, features, opts, "r.R", 1);
  return node;
}
