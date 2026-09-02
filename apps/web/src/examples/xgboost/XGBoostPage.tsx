// The gradient-boosting example (/examples/xgboost).
//
// Laid out VERTICALLY on purpose, as the mirror of the random forest page.
// There the trees run left to right and the order means nothing; here they run
// top to bottom and the order is the entire model. Round k was fitted to what
// rounds 1..k-1 got wrong, so it cannot be moved, removed or reordered — and
//
// Both ensemble pages share one layout, so a reader can move between them
// without relearning where anything is: a scrubber across the top with the
// tree view toggled from its left-hand end, the model's current fit on the
// left, its error on the right, controls under those, and the trees themselves
// below — hidden until asked for, because the fit and the error are what you
// look at first.
//
// This implements the XGBoost formulation — second-order split scoring, the
// closed-form leaf weight, the regularisers, shrinkage — rather than calling
// XGBoost, which does not run in a browser.
//
// Only depth is exposed as a control. Shrinkage and lambda are real parameters
// with real effects, but they are not what this page is about: the learning
// rate is a much better lesson on its own, in a setting where it is the subject
// rather than a distraction, and lambda is well served by its default. Depth is
// the one knob here that changes the story, so it is the only one on screen.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import "../decision-tree/decision-tree.css";
import "../mnist-mlp/digit-recognizer.css";
import "../random-forest/ensemble.css";
import { makeDogScatter } from "../shared/trees/datasets.js";
import { DotStrip } from "../shared/trees/DotStrip.js";
import {
  DEFAULT_BOOST,
  boostNodeToTreeNode,
  boostPredict,
  fitBoosting,
} from "../shared/trees/ensembles.js";
import { FitPlot } from "../shared/trees/FitPlot.js";
import { LineChart } from "../shared/trees/LineChart.js";
import { GAIN_BAR, GAIN_BAR_WIN } from "../shared/trees/palette.js";
import { ScrubBar } from "../shared/trees/ScrubBar.js";
import { TreeView } from "../shared/trees/TreeView.js";

const MAX_ROUNDS = 40;
const DOGS = makeDogScatter(90, 42);
/** Every third dog is kept back as test data. Boosting will drive training
 *  error to zero if you let it, so there has to be something it has not seen. */
const TRAIN = DOGS.rows.filter((_, i) => i % 3 !== 0);
const TEST = DOGS.rows.filter((_, i) => i % 3 === 0);

/** Shrinkage, fixed. See the note at the top of the file. */
const ETA = 0.3;

const PHOTO = "/examples/decision-tree/dogs.jpg";

/** Direction, not category: blue for "the model guessed too light", red for too
 *  heavy. These two hues mean direction everywhere in these examples, which is
 *  why the class palette avoids them. */
const TOO_LOW = "#2b62a8";
const TOO_HIGH = "#d1344b";

/** Sequential light-to-dark ramp for a magnitude, matching the white-to-black
 *  convention the neural-network examples use for activations. Colours a dot by
 *  *how big a number is* rather than which category it is, so a strip reads as
 *  a gradient — and reads as one flat tone when every number is the same. */
function magnitudeRamp(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  const l = Math.round(222 - v * 190);
  return `rgb(${l} ${l} ${l})`;
}

export function XGBoostPage() {
  const [round, setRound] = useState(1);
  const [maxDepth, setMaxDepth] = useState(DEFAULT_BOOST.maxDepth);
  const [focusRound, setFocusRound] = useState(0);

  const model = useMemo(
    () =>
      fitBoosting(TRAIN, TEST, DOGS, {
        ...DEFAULT_BOOST,
        rounds: MAX_ROUNDS,
        eta: ETA,
        maxDepth,
      }),
    [maxDepth],
  );

  const here = round === 0 ? null : model.rounds[round - 1]!;
  const bestRound =
    model.rounds.reduce(
      (b, r, i) => (r.testRmse < model.rounds[b]!.testRmse ? i : b),
      0,
    ) + 1;

  /** The errors before any tree was added. Pinning the residual panel to this
   *  is what lets the bars visibly shrink instead of rescaling to fill. */
  const startingWorst = useMemo(
    () => Math.max(...TRAIN.map((r) => Math.abs(r.y - model.base))),
    [model.base],
  );

  const predictNow = useMemo(
    () => (x: number[]) => boostPredict(model, x, round),
    [model, round],
  );

  /** What the model currently says about each training dog, and the true
   *  weights, on one shared scale. Drawn as a pair of strips above the rounds:
   *  at round 0 the model strip is a single flat tone, because the model is
   *  literally one number, and it separates into a gradient as rounds go in. */
  const estimates = useMemo(() => {
    const truth = TRAIN.map((r) => r.y);
    const lo = Math.min(...truth);
    const hi = Math.max(...truth);
    const span = Math.max(hi - lo, 1e-9);
    return {
      lo,
      hi,
      truth: truth.map((v) => (v - lo) / span),
      model: TRAIN.map((r) => (predictNow(r.x) - lo) / span),
    };
  }, [predictNow]);

  const trainErr = round === 0 ? rmseAbout(TRAIN, model.base) : here!.trainRmse;
  const testErr = round === 0 ? rmseAbout(TEST, model.base) : here!.testRmse;

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
            <h1>Gradient boosting -- serial trees</h1>
            <p className="mnist-lede">
              Gradient Boosted Trees (of which XGBoost is the most common
              algorithm) are similar to Random Forest, but fit serially instead
              of in parallel. They begin by assuming a fit of the average. Then,
              they add one tree at a time, each fitting not the raw data but{" "}
              <b>
                the error of the current model (made up of an ensemble of trees)
              </b>
              .
            </p>
          </div>

          <ScrubBar
            id="xgb-round"
            label="Rounds"
            value={round}
            min={0}
            max={MAX_ROUNDS}
            onChange={setRound}
            primary={`train ${trainErr.toFixed(2)} kg`}
            secondary={`test ${testErr.toFixed(2)} kg`}
          />

          <div className="ens-cols">
            <div className="ens-figure">
              <p className="ens-figure__title">
                {round === 0
                  ? "Round 0 — the model is the mean"
                  : `The model after ${round} round${round === 1 ? "" : "s"}`}
              </p>
              <FitPlot
                dataset={DOGS}
                train={TRAIN}
                test={TEST}
                predict={predictNow}
                residualScale={startingWorst}
              />
              <p className="ens-note">
                The green line shows the current model. Each dot is a
                measurement, with empty dots being held-out test data and filled
                dots showing the training data.
                <br />
                <br />
                Below that, the red and blue lines show how wrong the model is
                about those specific dogs.{" "}
                <b>These bars are the next tree's training data</b>.
              </p>
            </div>

            <div className="ens-figure">
              <p className="ens-figure__title">Error against round</p>
              <LineChart
                series={[
                  {
                    label: "train",
                    color: GAIN_BAR,
                    values: model.rounds.map((r) => r.trainRmse),
                  },
                  {
                    label: "test",
                    color: GAIN_BAR_WIN,
                    dashed: true,
                    values: model.rounds.map((r) => r.testRmse),
                  },
                ]}
                cursor={round}
                xLabel="rounds"
                yLabel="RMSE (kg)"
                zeroBased
              />
              <p className="ens-note">
                Note that the training and testing errors differ. That
                divergence is "overfitting".
              </p>

              <div className="ens-knobs">
                <label>
                  Tree depth <b>{maxDepth}</b>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="ens-figure">
            <p className="ens-figure__title">
              The rounds, top to bottom — click a row to open that round's tree
            </p>

            {/* What the model currently believes, before the per-round errors.
                At round 0 this strip is one flat tone across every dog, which is
                the honest picture of a model that is a single number. */}
            <div className="ens-rows__head">
              <span className="ens-rows__label">true weight</span>
              <DotStrip
                count={TRAIN.length}
                colorOf={(i) => magnitudeRamp(estimates.truth[i]!)}
              />
              <span className="ens-row__val">
                {estimates.lo.toFixed(0)}–{estimates.hi.toFixed(0)} kg
              </span>
            </div>
            <div className="ens-rows__head">
              <span className="ens-rows__label">model says</span>
              <DotStrip
                count={TRAIN.length}
                colorOf={(i) => magnitudeRamp(estimates.model[i]!)}
              />
              <span className="ens-row__val">
                {round === 0 ? `${model.base.toFixed(1)} kg flat` : "→"}
              </span>
            </div>

            {round === 0 ? (
              <p className="ens-note">
                No rounds yet. Drag the scrubber to add the first tree.
              </p>
            ) : (
              <>
                <div className="ens-rows__head">
                  <span className="ens-rows__label">errors in →</span>
                  <span className="ens-rows__axis">
                    sorted by ear length, same order as the plot above
                  </span>
                  <span className="ens-row__val">error after</span>
                </div>

                <div className="ens-rows ens-scroll">
                  {model.rounds.slice(0, round).map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className={
                        "ens-row" +
                        (Math.min(focusRound, round - 1) === i ? " is-on" : "")
                      }
                      onClick={() => setFocusRound(i)}
                    >
                      <span className="ens-row__n">round {i + 1}</span>
                      <DotStrip
                        count={TRAIN.length}
                        colorOf={(j) =>
                          r.residuals[j]! >= 0 ? TOO_LOW : TOO_HIGH
                        }
                        sizeOf={(j) =>
                          Math.abs(r.residuals[j]!) / startingWorst
                        }
                      />
                      <span className="ens-row__val">
                        {r.trainRmse.toFixed(2)} kg
                      </span>
                    </button>
                  ))}
                </div>

                <div className="ens-detail">
                  <p className="ens-figure__title">
                    Round {Math.min(focusRound, round - 1) + 1} in full — a
                    small tree fitted to those errors
                  </p>
                  <TreeView
                    dataset={DOGS}
                    root={boostNodeToTreeNode(
                      model.rounds[Math.min(focusRound, round - 1)]!.root,
                    )}
                  />
                  <p className="ens-note">
                    One subtlety: the changes aren't used completely. Instead,
                    they're added after scaling by the learning rate.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function rmseAbout(rows: typeof TRAIN, c: number): number {
  let s = 0;
  for (const r of rows) s += (r.y - c) * (r.y - c);
  return Math.sqrt(s / Math.max(rows.length, 1));
}

/** The photo is a deployment asset rather than something committed with the
 *  code, so the page has to look right without it. If it will not load, drop it
 *  silently instead of showing a broken-image icon. */
function PhotoOrNothing({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img
      src={src}
      alt="Two dogs sitting side by side"
      onError={() => setOk(false)}
    />
  );
}
