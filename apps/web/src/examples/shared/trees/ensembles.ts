// The two ways of combining trees, in one file because the contrast between
// them is the entire point of the pair of examples that use it.
//
//   forest    Trees grow in PARALLEL and never see each other. Each gets its
//             own bootstrap resample, and at every node it may only choose from
//             a random handful of features. They are combined by vote, or by
//             average for regression. Because they are independent, the order
//             they were grown in carries no information — shuffle them and the
//             prediction is bit-for-bit identical.
//
//   boosting  Trees grow in SERIES, each one fitted to what the ones before it
//             got wrong. Tree k is fitted to the gradient of the loss at the
//             predictions of trees 1..k-1, so it cannot even be built without
//             them. The order *is* the model, and shuffling is not defined.
//
// The boosting side follows the XGBoost formulation rather than classic
// gradient boosting: splits are scored with the second-order objective
// G^2/(H+lambda), leaves take the closed-form weight -G/(H+lambda), and the
// usual regularisers are here (lambda, gamma, min_child_weight) alongside
// shrinkage. For squared error the gradients are simple — g = prediction -
// target, h = 1 — which keeps the arithmetic legible while the machinery stays
// honest.

import {
  bootstrap,
  growTree,
  makeRng,
  mean,
  predict,
  type Dataset,
  type Feature,
  type Row,
  type TreeNode,
} from "./cart.js";

// ── Random forest ───────────────────────────────────────────────────────────

export interface ForestOptions {
  nTrees: number;
  maxDepth: number;
  /** Features drawn at each node — note, at each *node*, not once per tree.
   *  A tree that keeps being denied its favourite feature is forced to find a
   *  different angle on the problem, and that disagreement is what the vote
   *  later averages away. */
  featuresPerSplit: number;
  bootstrapRows: boolean;
  seed: number;
}

export interface ForestTree {
  root: TreeNode;
  /** Rows this tree never saw, for its out-of-bag vote. */
  oob: Row[];
}

export interface Forest {
  trees: ForestTree[];
  dataset: Dataset;
  regression: boolean;
}

export function fitForest(dataset: Dataset, opts: ForestOptions): Forest {
  const regression = dataset.classes === undefined;
  const nClasses = dataset.classes?.length ?? 1;
  const rng = makeRng(opts.seed);
  const trees: ForestTree[] = [];
  for (let t = 0; t < opts.nTrees; t++) {
    const { sample, oob } = opts.bootstrapRows
      ? bootstrap(dataset.rows, rng)
      : { sample: dataset.rows, oob: [] as Row[] };
    trees.push({
      root: growTree(sample, dataset.features, {
        criterion: regression ? "variance" : "gini",
        nClasses,
        maxDepth: opts.maxDepth,
        featuresPerSplit: opts.featuresPerSplit,
        minSamplesLeaf: regression ? 2 : 1,
        rng,
      }),
      oob,
    });
  }
  return { trees, dataset, regression };
}

/** Combine the first `upTo` trees. `order` lets a page shuffle them and show
 *  that the answer does not move — the demonstration that this is a parallel
 *  ensemble and not a sequence. */
export function forestPredict(
  forest: Forest,
  x: number[],
  upTo: number,
  order?: number[],
): number {
  const n = Math.min(upTo, forest.trees.length);
  if (n === 0) return 0;
  if (forest.regression) {
    let s = 0;
    for (let i = 0; i < n; i++) s += predict(forest.trees[order ? order[i]! : i]!.root, x);
    return s / n;
  }
  const nClasses = forest.dataset.classes!.length;
  const votes = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < n; i++) {
    votes[predict(forest.trees[order ? order[i]! : i]!.root, x)]!++;
  }
  let best = 0;
  for (let c = 1; c < nClasses; c++) if (votes[c]! > votes[best]!) best = c;
  return best;
}

/** Per-class vote counts, so a page can show how close the vote was. */
export function forestVotes(forest: Forest, x: number[], upTo: number): number[] {
  const nClasses = forest.dataset.classes?.length ?? 1;
  const votes = new Array<number>(nClasses).fill(0);
  const n = Math.min(upTo, forest.trees.length);
  for (let i = 0; i < n; i++) votes[predict(forest.trees[i]!.root, x)]!++;
  return votes;
}

export interface ForestPoint {
  trees: number;
  /** Accuracy for classification, RMSE for regression. */
  score: number;
  oob: number;
}

/** Score after each additional tree.
 *
 *  Two curves. The training score, and the out-of-bag score — every row
 *  predicted using only the trees that never saw it, which is a genuine
 *  held-out estimate obtained without setting any data aside. The OOB curve
 *  falling and then flattening is the honest version of "more trees never
 *  hurt": the forest stops improving, but it does not start getting worse. */
export function forestHistory(forest: Forest): ForestPoint[] {
  const rows = forest.dataset.rows;
  const nClasses = forest.dataset.classes?.length ?? 1;
  const out: ForestPoint[] = [];
  const oobVotes = rows.map(() => new Array<number>(nClasses).fill(0));
  const oobSum = rows.map(() => 0);
  const oobCount = rows.map(() => 0);
  const oobSets = forest.trees.map((t) => new Set(t.oob.map((r) => r.id)));

  for (let k = 0; k < forest.trees.length; k++) {
    const tree = forest.trees[k]!;
    rows.forEach((r, ri) => {
      if (!oobSets[k]!.has(r.id)) return;
      oobCount[ri]!++;
      if (forest.regression) oobSum[ri]! += predict(tree.root, r.x);
      else oobVotes[ri]![predict(tree.root, r.x)]!++;
    });

    let score = 0;
    let oobScore = 0;
    let oobSeen = 0;
    rows.forEach((r, ri) => {
      const p = forestPredict(forest, r.x, k + 1);
      if (forest.regression) {
        const d = r.y - p;
        score += d * d;
      } else if (p === r.y) score += 1;

      if (oobCount[ri]! > 0) {
        oobSeen++;
        if (forest.regression) {
          const d = r.y - oobSum[ri]! / oobCount[ri]!;
          oobScore += d * d;
        } else {
          const v = oobVotes[ri]!;
          let b = 0;
          for (let c = 1; c < nClasses; c++) if (v[c]! > v[b]!) b = c;
          if (b === r.y) oobScore += 1;
        }
      }
    });

    out.push({
      trees: k + 1,
      score: forest.regression ? Math.sqrt(score / rows.length) : score / rows.length,
      oob:
        oobSeen === 0
          ? 0
          : forest.regression
            ? Math.sqrt(oobScore / oobSeen)
            : oobScore / oobSeen,
    });
  }
  return out;
}

// ── Gradient boosting, the XGBoost recipe ───────────────────────────────────

export interface BoostParams {
  rounds: number;
  /** Shrinkage: each tree's contribution is scaled by this before being added,
   *  so the ensemble takes many small steps instead of a few large ones. */
  eta: number;
  maxDepth: number;
  /** L2 penalty on leaf weights. It sits in the denominator of both the leaf
   *  weight and the split score, so it shrinks small leaves hardest. */
  lambda: number;
  /** Minimum gain for a split to be worth keeping. */
  gamma: number;
  /** Minimum total hessian in a child. For squared error the hessian is 1 per
   *  row, so here it is simply a minimum row count. */
  minChildWeight: number;
}

export const DEFAULT_BOOST: BoostParams = {
  rounds: 25,
  eta: 0.3,
  maxDepth: 2,
  lambda: 1,
  gamma: 0,
  minChildWeight: 1,
};

export interface BoostNode {
  id: string;
  depth: number;
  rows: Row[];
  /** Leaves only: the weight added to the running prediction. */
  weight?: number;
  split?: { featureIndex: number; threshold: number; gain: number };
  left?: BoostNode;
  right?: BoostNode;
}

export interface BoostRound {
  root: BoostNode;
  /** The errors this round was handed, in dataset row order. */
  residuals: number[];
  trainRmse: number;
  testRmse: number;
}

export interface BoostModel {
  /** Round zero: a single constant, the mean of the target. */
  base: number;
  rounds: BoostRound[];
  params: BoostParams;
  dataset: Dataset;
  train: Row[];
  test: Row[];
}

/** Leaf weight under the second-order objective. */
function leafWeight(g: number, h: number, lambda: number): number {
  return -g / (h + lambda);
}

/** The XGBoost structure score for a node. */
function structureScore(g: number, h: number, lambda: number): number {
  return (g * g) / (h + lambda);
}

function buildBoostTree(
  rows: Row[],
  grad: Map<string, number>,
  hess: Map<string, number>,
  features: Feature[],
  p: BoostParams,
  id = "r",
  depth = 0,
): BoostNode {
  const node: BoostNode = { id, depth, rows };
  let G = 0;
  let H = 0;
  for (const r of rows) {
    G += grad.get(r.id)!;
    H += hess.get(r.id)!;
  }
  if (depth >= p.maxDepth || rows.length < 2) {
    node.weight = leafWeight(G, H, p.lambda);
    return node;
  }

  const parentScore = structureScore(G, H, p.lambda);
  let best: { fi: number; t: number; gain: number } | null = null;

  for (let fi = 0; fi < features.length; fi++) {
    const f = features[fi]!;
    const thresholds =
      f.kind === "binary"
        ? [0.5]
        : (() => {
            const vals = Array.from(new Set(rows.map((r) => r.x[fi]!))).sort((a, b) => a - b);
            const mids: number[] = [];
            for (let i = 0; i + 1 < vals.length; i++) mids.push((vals[i]! + vals[i + 1]!) / 2);
            return mids;
          })();
    for (const t of thresholds) {
      let GL = 0;
      let HL = 0;
      let nL = 0;
      for (const r of rows) {
        if (r.x[fi]! <= t) {
          GL += grad.get(r.id)!;
          HL += hess.get(r.id)!;
          nL++;
        }
      }
      const GR = G - GL;
      const HR = H - HL;
      if (nL === 0 || rows.length - nL === 0) continue;
      if (HL < p.minChildWeight || HR < p.minChildWeight) continue;
      // How much better the two children score than the parent, less the cost
      // of adding a split at all.
      const gain =
        0.5 *
          (structureScore(GL, HL, p.lambda) +
            structureScore(GR, HR, p.lambda) -
            parentScore) -
        p.gamma;
      if (!best || gain > best.gain) best = { fi, t, gain };
    }
  }

  if (!best || best.gain <= 0) {
    node.weight = leafWeight(G, H, p.lambda);
    return node;
  }

  const chosen = best as { fi: number; t: number; gain: number };
  node.split = { featureIndex: chosen.fi, threshold: chosen.t, gain: chosen.gain };
  const left: Row[] = [];
  const right: Row[] = [];
  for (const r of rows) (r.x[chosen.fi]! <= chosen.t ? left : right).push(r);
  node.left = buildBoostTree(left, grad, hess, features, p, `${id}.L`, depth + 1);
  node.right = buildBoostTree(right, grad, hess, features, p, `${id}.R`, depth + 1);
  return node;
}

function boostTreeValue(node: BoostNode, x: number[]): number {
  let cur = node;
  while (cur.split && cur.left && cur.right) {
    cur = x[cur.split.featureIndex]! <= cur.split.threshold ? cur.left : cur.right;
  }
  return cur.weight ?? 0;
}

function rmse(rows: Row[], pred: (r: Row) => number): number {
  if (rows.length === 0) return 0;
  let s = 0;
  for (const r of rows) {
    const d = r.y - pred(r);
    s += d * d;
  }
  return Math.sqrt(s / rows.length);
}

/** Fit the whole sequence, keeping every round so a page can scrub through it.
 *
 *  Round zero is a constant — the mean — and each round after it is fitted to
 *  what the rounds before it got wrong. For squared error the gradient is just
 *  the signed error, so "fit the gradient" and "fit the residual" say the same
 *  thing, which is exactly why this is the loss to teach boosting with. */
export function fitBoosting(
  train: Row[],
  test: Row[],
  dataset: Dataset,
  params: BoostParams,
): BoostModel {
  const base = mean(train);
  const pred = new Map<string, number>();
  const testPred = new Map<string, number>();
  for (const r of train) pred.set(r.id, base);
  for (const r of test) testPred.set(r.id, base);

  const rounds: BoostRound[] = [];
  for (let k = 0; k < params.rounds; k++) {
    const grad = new Map<string, number>();
    const hess = new Map<string, number>();
    const residuals: number[] = [];
    for (const r of train) {
      const e = pred.get(r.id)! - r.y;
      grad.set(r.id, e);
      hess.set(r.id, 1);
      residuals.push(-e);
    }

    const root = buildBoostTree(train, grad, hess, dataset.features, params);
    for (const r of train) {
      pred.set(r.id, pred.get(r.id)! + params.eta * boostTreeValue(root, r.x));
    }
    for (const r of test) {
      testPred.set(r.id, testPred.get(r.id)! + params.eta * boostTreeValue(root, r.x));
    }

    rounds.push({
      root,
      residuals,
      trainRmse: rmse(train, (r) => pred.get(r.id)!),
      testRmse: rmse(test, (r) => testPred.get(r.id)!),
    });
  }
  return { base, rounds, params, dataset, train, test };
}

/** Prediction after `upTo` rounds: the constant plus each tree's shrunk
 *  contribution, in order. There is no way to leave one out — every tree after
 *  it was fitted on the assumption that it was there. */
export function boostPredict(model: BoostModel, x: number[], upTo: number): number {
  let v = model.base;
  const n = Math.min(upTo, model.rounds.length);
  for (let i = 0; i < n; i++) v += model.params.eta * boostTreeValue(model.rounds[i]!.root, x);
  return v;
}

/** Reshape a boosting tree into what TreeView renders, so both ensemble pages
 *  draw their trees with the same component and the same no/yes notation. */
export function boostNodeToTreeNode(node: BoostNode): TreeNode {
  const out: TreeNode = {
    id: node.id,
    depth: node.depth,
    rows: node.rows,
    impurity: 0,
    prediction: node.weight ?? 0,
  };
  if (node.split && node.left && node.right) {
    out.split = node.split;
    out.left = boostNodeToTreeNode(node.left);
    out.right = boostNodeToTreeNode(node.right);
  }
  return out;
}
