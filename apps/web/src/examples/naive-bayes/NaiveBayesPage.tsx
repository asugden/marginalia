// The naive Bayes example (/examples/naive-bayes).
//
// Fit naive Bayes by hand, then let the model fit the same points. The reader
// does what the model does: for each class, one curve per feature, a centre
// and a spread. The regions in the plot are computed from those curves, so
// the only way to change them is to change the curves — which is the model.
//
// Two comparisons carry the lesson:
//
//   you vs naive Bayes   — the same kind of model, fitted by eye and by
//                          maximum likelihood. On round blobs the reader can
//                          come close. On tilted data neither can do well,
//                          because the ellipse cannot turn.
//   train vs test        — the same model scored on the points on screen and
//                          on 600 held-out ones. Chase every visible point and
//                          the gap opens: overfitting, shown rather than
//                          defined.
//
// Static and unauthenticated: everything is generated and fitted in the
// browser from a seed, so there is nothing to load and a seed always replays.
// The data is shared with the SVM example (shared/classification).

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import "../shared/classification/classification.css";
import { makeScenario, scoreBoth, type Difficulty, type Scenario } from "../shared/classification/data.js";
import { DataControls, Legend, Scoreboard } from "../shared/classification/Panels.js";
import { bandDataUrl, regionDataUrl } from "../shared/classification/plot.js";
import {
  curvesModel,
  defaultCurves,
  fitNaiveBayes,
  nbPredict,
  samplePriors,
  type Curves,
} from "./nb.js";
import { ScatterPlot } from "./ScatterPlot.js";
import { STRIP_RES, StripPlot } from "./StripPlot.js";

type RegionMode = "you" | "nb" | "none";

const SHAPE_HINTS: Record<Difficulty, string> = {
  round: "Each class is one round blob, which is what naive Bayes expects.",
  tilted:
    "Long diagonal clouds. The features move together, and naive Bayes assumes they never do.",
  interleaved:
    "The classes share their curves along each feature, so one feature at a time cannot tell them apart.",
};

/** Region raster resolution: upscaled by the browser, which softens the
 *  boundaries — the exact pixel is not the lesson. */
const RES = 180;

export function NaiveBayesPage() {
  const [dim, setDim] = useState<1 | 2>(2);
  const [nClasses, setNClasses] = useState<2 | 3>(2);
  const [difficulty, setDifficulty] = useState<Difficulty>("round");
  const [seed, setSeed] = useState(20250902);
  // The true distributions are the answer key: hidden by default so the curves
  // are fitted to the points, not traced off the generating shapes.
  const [showTruth, setShowTruth] = useState(false);

  const scenario = useMemo(
    () => makeScenario({ dim, nClasses, difficulty, seed }),
    [dim, nClasses, difficulty, seed],
  );
  const newSample = useCallback(() => setSeed((s) => (s * 1103515245 + 12345) >>> 8), []);

  const dataControls = (
    <DataControls
      dim={dim}
      onDim={(d) => {
        if (d === 1 && difficulty === "tilted") setDifficulty("round");
        setDim(d);
      }}
      nClasses={nClasses}
      onClasses={setNClasses}
      shape={scenario.difficulty}
      onShape={setDifficulty}
      shapeHint={
        <>
          {SHAPE_HINTS[scenario.difficulty]}
          {dim === 1 && " Tilted needs two features: it is about how they move together."}
        </>
      }
      showTruth={showTruth}
      onShowTruth={setShowTruth}
    />
  );

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link to="/examples" className="app-lockup-link" aria-label="Examples">
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Naive Bayes</h1>
            <p className="mnist-lede">
              Naive Bayes describes each class with one bell curve per feature,
              and picks the class whose curves are highest at a point. Fit the
              curves yourself, then compare with the model.
            </p>
          </div>

          <Card className="cls-panel" padding="md">
            <h2 className="cls-h2">Fit the curves</h2>
            <p className="cls-sub">
              Drag each class's curves to match its points along each feature.
              The shaded regions are what your curves predict.
            </p>
            {/* Keyed on the data, so a new sample starts a fresh round: new
                curves, no fitted model, the held-out points hidden again. */}
            <FitPanel
              key={`${dim}-${nClasses}-${scenario.difficulty}-${seed}`}
              scenario={scenario}
              showTruth={showTruth}
              dataControls={dataControls}
              onNewSample={newSample}
            />
            <p className="cls-note">
              Each curve is scaled by how common its class is. A class's ellipse
              is its two curves multiplied together, so it can stretch along
              either axis but always sits square to them. A single curve per
              feature also smooths over lumps, which is what the interleaved
              shape exploits.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** One round: the reader's curves, the fitted model, the scores. Remounted
 *  for every new scenario. */
function FitPanel({
  scenario,
  showTruth,
  dataControls,
  onNewSample,
}: {
  scenario: Scenario;
  showTruth: boolean;
  dataControls: ReactNode;
  onNewSample: () => void;
}) {
  const dim = scenario.dim;
  const nClasses = scenario.classes.length;
  const [fitted, setFitted] = useState(false);
  // The held-out points are a reveal, not a permanent layer: fitting shows
  // them, and the next edit hides them again. Seeing the test set while still
  // dragging would turn an honest score into a target to fit.
  const [showTest, setShowTest] = useState(false);
  const [regionMode, setRegionMode] = useState<RegionMode>("you");
  const [curves, setCurves] = useState<Curves>(() => defaultCurves(nClasses, dim));

  const priors = useMemo(() => samplePriors(scenario.train, nClasses), [scenario, nClasses]);
  const yours = useMemo(() => curvesModel(curves, priors, dim), [curves, priors, dim]);
  const nb = useMemo(
    () => (fitted ? fitNaiveBayes(scenario.train, nClasses, dim) : null),
    [fitted, scenario, nClasses, dim],
  );

  const editCurves = useCallback((next: Curves) => {
    setCurves(next);
    setShowTest(false);
  }, []);

  const yourScores = useMemo(() => scoreBoth(scenario, (x) => nbPredict(x, yours)), [scenario, yours]);
  const nbScores = useMemo(
    () => (nb ? scoreBoth(scenario, (x) => nbPredict(x, nb)) : null),
    [scenario, nb],
  );

  const regionModel = regionMode === "nb" ? nb : regionMode === "you" ? yours : null;
  const regionUrl = useMemo(() => {
    if (!regionModel) return null;
    const predict = (x: number[]) => nbPredict(x, regionModel);
    return dim === 2 ? regionDataUrl(RES, predict) : bandDataUrl(STRIP_RES, predict);
  }, [regionModel, dim]);

  return (
      <div className="cls-layout">
        <aside className="cls-side">
          <Scoreboard
            showTest={showTest}
            rows={[
              { name: "You", train: yourScores.train, test: yourScores.test },
              {
                name: "Naive Bayes",
                train: nbScores?.train ?? null,
                test: nbScores?.test ?? null,
              },
            ]}
            note={
              showTest ? (
                <>
                  <b>train</b> is the {scenario.train.length} points on screen;{" "}
                  <b>test</b> is {scenario.test.length} new points from the
                  same distributions.
                </>
              ) : (
                <>
                  <b>train</b> is the {scenario.train.length} points on screen.
                  Fitting naive Bayes also scores both on new points.
                </>
              )
            }
          />

          <div className="cls-box cls-box--controls">
            {!fitted ? (
              <Button
                block
                onClick={() => {
                  setFitted(true);
                  setShowTest(true);
                }}
              >
                Fit naive Bayes
              </Button>
            ) : (
              <div className="cls-choice cls-choice--fill" role="group" aria-label="Regions">
                <span className="cls-kicker">Regions</span>
                <div className="cls-choice__buttons">
                  {(
                    [
                      ["you", "Yours"],
                      ["nb", "Naive Bayes"],
                      ["none", "Off"],
                    ] as Array<[RegionMode, string]>
                  ).map(([k, label]) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={regionMode === k ? "primary" : "subtle"}
                      aria-pressed={regionMode === k}
                      onClick={() => setRegionMode(k)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <Button size="sm" variant="subtle" onClick={onNewSample}>
              New sample
            </Button>
          </div>

          {dataControls}

          <Legend
            classes={scenario.classes}
            marks={[
              ...(showTruth ? [{ mark: "fill" as const, label: "true distribution" }] : []),
              { mark: "yours" as const, label: "your curves" },
              ...(nb ? [{ mark: "model" as const, label: "naive Bayes" }] : []),
            ]}
          />
        </aside>

        <div>
          {dim === 2 ? (
            <ScatterPlot
              scenario={scenario}
              curves={curves}
              priors={priors}
              onChange={editCurves}
              nb={nb}
              regionUrl={regionUrl}
              showTruth={showTruth}
              showTest={showTest}
            />
          ) : (
            <StripPlot
              scenario={scenario}
              curves={curves}
              priors={priors}
              onChange={editCurves}
              nb={nb}
              bandUrl={regionUrl}
              showTruth={showTruth}
              showTest={showTest}
            />
          )}
        </div>
      </div>
  );
}
