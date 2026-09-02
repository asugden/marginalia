// The random forest example (/examples/random-forest).
//
// The trees are grown in parallel, none of them knows the others exist, and the
// scrubber does not build the forest so much as *reveal more of it*: drag it and
// earlier trees never change, because nothing about tree 12 depended on tree 11.
// The thing this page has to show is the *vote*, and a row of tree diagrams
// cannot show it — shrink a tree far enough to fit forty-eight of them on a
// screen and you are looking at grey confetti. So the trees are represented by
// what they actually contribute: one dot per dog, coloured by the class that
// tree votes for. The order of the dots is fixed across every strip, so the
// strips stack into a grid that reads *downwards* — one column is one dog, seen
// by every tree in turn. Dogs the whole forest agrees on form clean vertical
// bands; the ones it argues over show up as speckled columns, and those are
// exactly the dogs sitting near a boundary.
//
// Underneath the vote strips, one tree is drawn in full, at a size where the
// questions can be read.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import "../decision-tree/decision-tree.css";
import "../mnist-mlp/digit-recognizer.css";
import {
  accuracy,
  growTree,
  mean,
  mse,
  predict,
  type Dataset,
} from "../shared/trees/cart.js";
import { makeDogScatter, makeDogSizes } from "../shared/trees/datasets.js";
import { DotStrip } from "../shared/trees/DotStrip.js";
import {
  fitForest,
  forestHistory,
  forestPredict,
} from "../shared/trees/ensembles.js";
import { FitPlot } from "../shared/trees/FitPlot.js";
import { LineChart } from "../shared/trees/LineChart.js";
import {
  CLASS_PALETTE,
  GAIN_BAR,
  GAIN_BAR_WIN,
} from "../shared/trees/palette.js";
import { ScrubBar } from "../shared/trees/ScrubBar.js";
import { TreeView } from "../shared/trees/TreeView.js";
import "./ensemble.css";

const MAX_TREES = 48;
const SIZES = makeDogSizes(180, 11);
const SCATTER = makeDogScatter(90, 42);

/** Features drawn at each node, fixed. Roughly sqrt of the column count, which
 *  is the usual default. It was a slider, but on this data the only thing it
 *  demonstrated was that 1 is too few — every value from 2 upwards scores the
 *  same, because only three of the five columns carry any signal. */
const FEATURES_PER_SPLIT = 2;

/** Direction, not category. Blue and red mean "below" and "above" throughout
 *  these examples, which is why the class palette avoids them. */
const TOO_LOW = "#2b62a8";
const TOO_HIGH = "#d1344b";

export function RandomForestPage() {
  const [regression, setRegression] = useState(false);
  const [nShown, setNShown] = useState(1);
  const [depth, setDepth] = useState(3);
  const [useBootstrap, setUseBootstrap] = useState(true);
  const [focus, setFocus] = useState(0);

  const dataset: Dataset = regression ? SCATTER : SIZES;

  const forest = useMemo(
    () =>
      fitForest(dataset, {
        nTrees: MAX_TREES,
        maxDepth: depth,
        featuresPerSplit: FEATURES_PER_SPLIT,
        bootstrapRows: useBootstrap,
        seed: 7,
      }),
    [dataset, depth, useBootstrap],
  );
  const history = useMemo(() => forestHistory(forest), [forest]);

  /** A single tree on all the data — the thing the forest has to beat. */
  const lone = useMemo(
    () =>
      growTree(dataset.rows, dataset.features, {
        criterion: regression ? "variance" : "gini",
        nClasses: dataset.classes?.length ?? 1,
        maxDepth: depth,
        minSamplesLeaf: regression ? 2 : 1,
      }),
    [dataset, depth, regression],
  );

  const predictNow = useMemo(
    () => (x: number[]) => forestPredict(forest, x, nShown),
    [forest, nShown],
  );

  /** Error, not accuracy. Both this page and the boosting page now plot error,
   *  so both curves fall as the model improves and the shapes can be compared
   *  directly — which is the entire reason the two pages sit side by side. */
  const err = useMemo(() => {
    if (regression) {
      let s = 0;
      for (const r of dataset.rows) {
        const d = r.y - predictNow(r.x);
        s += d * d;
      }
      return Math.sqrt(s / dataset.rows.length);
    }
    let wrong = 0;
    for (const r of dataset.rows) if (predictNow(r.x) !== r.y) wrong++;
    return wrong / dataset.rows.length;
  }, [dataset, predictNow, regression]);

  const oobNow = history[Math.max(nShown - 1, 0)]?.oob ?? 0;
  const oobErr = regression ? oobNow : 1 - oobNow;

  /** A fixed display order for every dot strip on the page: grouped by true
   *  class, then by size inside the group. Because it never changes, the same
   *  dog occupies the same column in every strip and the grid reads downwards. */
  const ordered = useMemo(() => {
    const rows = [...dataset.rows];
    rows.sort((a, b) => a.y - b.y || a.x[0]! - b.x[0]!);
    return rows;
  }, [dataset]);

  const startingWorst = useMemo(() => {
    const m = mean(dataset.rows);
    return Math.max(...dataset.rows.map((r) => Math.abs(r.y - m)));
  }, [dataset]);

  /** What each tree says about each dog, in strip order, plus which dogs its
   *  bootstrap sample happened to leave out. */
  const perTree = useMemo(
    () =>
      forest.trees.map((t) => {
        const unseen = new Set(t.oob.map((r) => r.id));
        if (regression) {
          return {
            kind: "reg" as const,
            errs: ordered.map((r) => r.y - predict(t.root, r.x)),
            votes: [] as number[],
            unseen,
            wrong: 0,
          };
        }
        const votes = ordered.map((r) => predict(t.root, r.x));
        let wrong = 0;
        ordered.forEach((r, i) => {
          if (votes[i] !== r.y) wrong++;
        });
        return {
          kind: "cls" as const,
          errs: [] as number[],
          votes,
          unseen,
          wrong,
        };
      }),
    [forest, ordered, regression],
  );

  const ensembleVotes = useMemo(
    () => ordered.map((r) => predictNow(r.x)),
    [ordered, predictNow],
  );

  /** How many trees disagree with the majority on each dog — the quantity the
   *  speckled columns are showing, summarised for the caption. */
  const contested = useMemo(() => {
    if (regression) return 0;
    let n = 0;
    ordered.forEach((_, i) => {
      const seen = perTree.slice(0, nShown);
      const tally = new Map<number, number>();
      for (const pt of seen)
        tally.set(pt.votes[i]!, (tally.get(pt.votes[i]!) ?? 0) + 1);
      const top = Math.max(...tally.values());
      if (top < seen.length * 0.8) n++;
    });
    return n;
  }, [ordered, perTree, nShown, regression]);

  /** The actual spread of per-tree error, so the caption states what is on
   *  screen instead of a remembered range. */
  const treeErrSpread = useMemo(() => {
    if (regression) return null;
    const es = perTree.slice(0, nShown).map((pt) => pt.wrong / ordered.length);
    return { lo: Math.min(...es), hi: Math.max(...es) };
  }, [perTree, nShown, ordered.length, regression]);

  const focused = Math.min(focus, nShown - 1);

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link
            to="/examples"
            className="app-lockup-link"
            aria-label="Examples"
          >
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="ens-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Random forest -- parallel trees</h1>
            <p className="mnist-lede">
              Drag the bar to add to the model. A random forest is a collection
              of individual decision trees that "vote" on the solution.
            </p>
          </div>

          <ScrubBar
            id="rf-trees"
            label="Trees"
            value={nShown}
            min={1}
            max={MAX_TREES}
            onChange={setNShown}
            primary={
              regression
                ? `train ${err.toFixed(2)} kg`
                : `train error ${Math.round(err * 100)}%`
            }
            secondary={
              regression
                ? `test ${oobErr.toFixed(2)} kg`
                : `test error ${Math.round(oobErr * 100)}%`
            }
          />

          <div className="ens-cols">
            <div className="ens-figure">
              <p className="ens-figure__title">
                {regression
                  ? `The forest's answer after ${nShown} tree${nShown === 1 ? "" : "s"}`
                  : `Where the forest agrees, and where it argues`}
              </p>

              {regression ? (
                <>
                  <FitPlot
                    dataset={SCATTER}
                    train={SCATTER.rows}
                    test={[]}
                    predict={predictNow}
                    residualScale={startingWorst}
                  />
                  <p className="ens-note">
                    Every tree makes its own blocky guess and the forest reports
                    the average of them. One tree alone is a coarse staircase;
                    averaging {nShown} of them rounds the corners off, because
                    they put their steps in different places.
                  </p>
                </>
              ) : (
                <>
                  <div className="ens-rows__head">
                    <span className="ens-rows__label">truth</span>
                    <DotStrip
                      count={ordered.length}
                      colorOf={(i) =>
                        CLASS_PALETTE[ordered[i]!.y % CLASS_PALETTE.length]!
                      }
                    />
                    <span />
                  </div>
                  <div className="ens-rows__head">
                    <span className="ens-rows__label">forest</span>
                    <DotStrip
                      count={ordered.length}
                      colorOf={(i) =>
                        CLASS_PALETTE[ensembleVotes[i]! % CLASS_PALETTE.length]!
                      }
                    />
                    <span className="ens-row__val">
                      {Math.round(err * 100)}%
                    </span>
                  </div>

                  <ul className="ens-key">
                    {dataset.classes!.map((c, ci) => (
                      <li key={c}>
                        <span
                          className="ens-key__dot"
                          style={{ background: CLASS_PALETTE[ci] }}
                        />
                        {c}
                      </li>
                    ))}
                  </ul>

                  <p className="ens-note">
                    One dot per dog, sorted so the three true sizes sit in
                    blocks. The top strip is the truth; the second is what the
                    forest currently says. Where the second strip breaks its
                    block, the forest is wrong — and those dogs are almost
                    always at the edges of a block, which is where the sizes
                    genuinely overlap.
                    <br />
                    <br />
                    Below, the same dogs are judged by each tree separately.
                    Right now{" "}
                    <b>
                      {contested} of {ordered.length}
                    </b>{" "}
                    dogs get a split decision — more than a fifth of the trees
                    disagreeing with the winner.
                  </p>
                </>
              )}
            </div>

            <div className="ens-figure">
              <p className="ens-figure__title">Error as trees are added</p>
              <LineChart
                series={[
                  {
                    label: "train",
                    color: GAIN_BAR,
                    values: history.map((h) =>
                      regression ? h.score : 1 - h.score,
                    ),
                  },
                  {
                    label: "test",
                    color: GAIN_BAR_WIN,
                    dashed: true,
                    values: history.map((h) =>
                      regression ? h.oob : 1 - h.oob,
                    ),
                  },
                ]}
                cursor={nShown}
                xLabel="trees"
                yLabel={regression ? "RMSE (kg)" : "error rate"}
                zeroBased
              />
              <p className="ens-note">
                The dashed line is the <b>test</b> error. Each tree misses about
                a third of the dogs when its resample is drawn, so every dog can
                be scored using only the trees that never saw it — a real test
                score, and one that costs no data, because the test set is
                different for every tree.
                <br />
                <br />
                It falls steeply and then flattens. More trees stop helping, but
                they never start hurting: that is what averaging independent
                models buys you, and it is exactly the opposite of what happens
                on the boosting page, where the same curve turns back up.
              </p>

              <div className="ens-knobs">
                <label>
                  Tree depth <b>{depth}</b>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                  />
                </label>
                <label className="ens-knobs__check">
                  <input
                    type="checkbox"
                    checked={useBootstrap}
                    onChange={(e) => setUseBootstrap(e.target.checked)}
                  />
                  Resample the rows
                </label>
                <div className="dt-controls">
                  <span className="dt-controls__label">Task</span>
                  <button
                    type="button"
                    className={"dt-chip" + (!regression ? " is-on" : "")}
                    onClick={() => {
                      setRegression(false);
                      setFocus(0);
                    }}
                  >
                    classify size (vote)
                  </button>
                  <button
                    type="button"
                    className={"dt-chip" + (regression ? " is-on" : "")}
                    onClick={() => {
                      setRegression(true);
                      setFocus(0);
                    }}
                  >
                    predict weight (average)
                  </button>
                </div>
              </div>

              <p className="ens-note">
                One tree alone, at this depth, gets{" "}
                <b>
                  {regression
                    ? `${Math.sqrt(mse(lone, dataset.rows)).toFixed(2)} kg`
                    : `${Math.round((1 - accuracy(lone, dataset.rows)) * 100)}% wrong`}
                </b>{" "}
                on the rows it trained on — flattering, because it has seen them
                all. The test number above is the honest comparison.
              </p>
            </div>
          </div>

          <div className="ens-figure">
            <p className="ens-figure__title">
              Every tree's answer for every dog — click a row to open that tree
            </p>

            {!regression && (
              <div className="ens-rows__head">
                <span className="ens-rows__label">truth</span>
                <DotStrip
                  count={ordered.length}
                  colorOf={(i) =>
                    CLASS_PALETTE[ordered[i]!.y % CLASS_PALETTE.length]!
                  }
                />
                <span className="ens-row__val">wrong</span>
              </div>
            )}

            <div className="ens-rows ens-scroll">
              {perTree.slice(0, nShown).map((pt, i) => (
                <button
                  key={i}
                  type="button"
                  className={"ens-row" + (focused === i ? " is-on" : "")}
                  onClick={() => setFocus(i)}
                >
                  <span className="ens-row__n">tree {i + 1}</span>
                  {pt.kind === "cls" ? (
                    <DotStrip
                      count={ordered.length}
                      colorOf={(j) =>
                        CLASS_PALETTE[pt.votes[j]! % CLASS_PALETTE.length]!
                      }
                      fadedOf={(j) => pt.unseen.has(ordered[j]!.id)}
                    />
                  ) : (
                    <DotStrip
                      count={ordered.length}
                      colorOf={(j) => (pt.errs[j]! >= 0 ? TOO_LOW : TOO_HIGH)}
                      sizeOf={(j) => Math.abs(pt.errs[j]!) / startingWorst}
                      fadedOf={(j) => pt.unseen.has(ordered[j]!.id)}
                    />
                  )}
                  <span className="ens-row__val">
                    {pt.kind === "cls"
                      ? `${Math.round((pt.wrong / ordered.length) * 100)}%`
                      : ""}
                  </span>
                </button>
              ))}
            </div>

            <p className="ens-note">
              Each block is one tree's answer for all {ordered.length} dogs, and
              the dogs are in the same position in every block — so the dot in a
              given spot is the same dog every time. Compare the blocks with the
              truth at the top: where a block keeps the three bands clean it
              agrees, and where it speckles it is guessing at dogs near a size
              boundary. Different trees speckle in <i>different places</i>,
              which is the whole reason voting works. The faded dots are the
              dogs that tree never saw, because the resample left them out —
              about a third of them, every time, and the ones its test score is
              computed from.
              {treeErrSpread && (
                <>
                  {" "}
                  On their own these {nShown} trees get between{" "}
                  <b>{Math.round(treeErrSpread.lo * 100)}%</b> and{" "}
                  <b>{Math.round(treeErrSpread.hi * 100)}%</b> of the dogs
                  wrong. Together they get <b>{Math.round(err * 100)}%</b> wrong
                  — better than every single one of them.
                </>
              )}
            </p>

            <div className="ens-detail">
              <p className="ens-figure__title">
                Tree {focused + 1} in full
                <span className="ens-figure__hint">
                  scroll sideways for the wide ones
                </span>
              </p>
              <TreeView dataset={dataset} root={forest.trees[focused]!.root} />
            </div>
          </div>

          <footer className="mnist-foot">
            <p>
              Turn <b>features per split</b> down to 1 and the test curve gets
              worse: each tree is now so starved of choices that it is barely
              better than guessing, and averaging weak models does not rescue
              them. Turn <b>resampling</b> off with all features available and
              every tree becomes identical — the strips below all look the same,
              the forest collapses to one tree, and the vote tells you nothing a
              single tree did not. The useful setting is in between, and what it
              is buying is <i>disagreement</i>: models that make different
              mistakes, so that averaging cancels the mistakes and keeps the
              signal.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
