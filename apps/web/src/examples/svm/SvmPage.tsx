// The support vector machine example (/examples/svm).
//
// Draw a straight line between two classes, then let a linear SVM draw its
// own. The reader's task is the SVM's task: split the classes and leave the
// widest street between them. Both lines are scored the same way, and the
// street the reader leaves is drawn out to the nearest point their line gets
// right on each side, so "widest street" is something to aim at rather than a
// definition.
//
// The data is shared with the naive Bayes example (shared/classification),
// with the same true distributions along each feature. The three shapes read
// differently for a line: round and tilted can both be split by one, and
// interleaved cannot, however the line is placed.
//
// Two classes and two features only. With three classes one line is not
// enough, and with one feature a line is a single threshold.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import "../shared/classification/classification.css";
import { makeScenario, scoreBoth, type Difficulty, type Scenario } from "../shared/classification/data.js";
import { DataControls, Legend, Scoreboard } from "../shared/classification/Panels.js";
import { regionDataUrl } from "../shared/classification/plot.js";
import { SvmPlot } from "./SvmPlot.js";
import { defaultLine, fitSVM, linePredict, orient, streetOf, svmPredict, type Line } from "./svm.js";

type RegionMode = "you" | "svm" | "none";

const SHAPE_HINTS: Record<Difficulty, string> = {
  round: "Two round blobs. A straight line splits them well.",
  tilted: "Long diagonal clouds. A straight line still splits them: here the best boundary is a line.",
  interleaved: "A checkerboard. No single straight line can split it.",
};

const RES = 180;

export function SvmPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>("round");
  const [seed, setSeed] = useState(20250902);
  // The true distributions are the answer key: hidden by default so the line
  // is drawn from the points.
  const [showTruth, setShowTruth] = useState(false);

  const scenario = useMemo(
    () => makeScenario({ dim: 2, nClasses: 2, difficulty, seed }),
    [difficulty, seed],
  );
  const newSample = useCallback(() => setSeed((s) => (s * 1103515245 + 12345) >>> 8), []);

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
            <h1>Support vector machines</h1>
            <p className="mnist-lede">
              A support vector machine (SVM) splits two classes with the
              straight line that leaves the widest street between them (most
              texts call the street the margin). Draw your own line first, then
              compare.
            </p>
          </div>

          <Card className="cls-panel" padding="md">
            <h2 className="cls-h2">Draw the boundary</h2>
            <p className="cls-sub">
              Drag the line to split the two classes, and leave as wide an empty
              street between them as you can.
            </p>
            {/* Keyed on the data, so a new sample starts a fresh round. */}
            <BoundaryPanel
              key={`${difficulty}-${seed}`}
              scenario={scenario}
              showTruth={showTruth}
              dataControls={
                <DataControls
                  shape={scenario.difficulty}
                  onShape={setDifficulty}
                  shapeHint={SHAPE_HINTS[scenario.difficulty]}
                  showTruth={showTruth}
                  onShowTruth={setShowTruth}
                />
              }
              onNewSample={newSample}
            />
            <p className="cls-note">
              The points on the edges of the SVM's street are its support
              vectors: they alone fix the line, and moving any other point
              leaves it where it is. When the classes overlap, the SVM lets a
              few points into the street in exchange for a wider one.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** One round: the reader's line, the fitted SVM, the scores. Remounted for
 *  every new scenario. */
function BoundaryPanel({
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
  const [line, setLine] = useState<Line>(defaultLine);
  const [fitted, setFitted] = useState(false);
  // Fitting reveals the held-out points; the next edit hides them again.
  const [showTest, setShowTest] = useState(false);
  const [regionMode, setRegionMode] = useState<RegionMode>("you");

  const left = useMemo(() => orient(line, scenario.train), [line, scenario]);
  const street = useMemo(() => streetOf(line, left, scenario.train), [line, left, scenario]);
  const svm = useMemo(() => (fitted ? fitSVM(scenario.train) : null), [fitted, scenario]);

  const editLine = useCallback((next: Line) => {
    setLine(next);
    setShowTest(false);
  }, []);

  const yourScores = useMemo(
    () => scoreBoth(scenario, (x) => linePredict(x, line, left)),
    [scenario, line, left],
  );
  const svmScores = useMemo(
    () => (svm ? scoreBoth(scenario, (x) => svmPredict(x, svm)) : null),
    [scenario, svm],
  );

  const regionUrl = useMemo(() => {
    if (regionMode === "none") return null;
    if (regionMode === "svm") return svm ? regionDataUrl(RES, (x) => svmPredict(x, svm)) : null;
    return regionDataUrl(RES, (x) => linePredict(x, line, left));
  }, [regionMode, svm, line, left]);

  return (
    <div className="cls-layout">
      <aside className="cls-side">
        <Scoreboard
          showTest={showTest}
          rows={[
            { name: "You", train: yourScores.train, test: yourScores.test },
            { name: "SVM", train: svmScores?.train ?? null, test: svmScores?.test ?? null },
          ]}
          note={
            showTest ? (
              <>
                <b>train</b> is the {scenario.train.length} points on screen;{" "}
                <b>test</b> is {scenario.test.length} new points from the same
                distributions.
              </>
            ) : (
              <>
                <b>train</b> is the {scenario.train.length} points on screen.
                Fitting the SVM also scores both on new points.
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
              Fit the SVM
            </Button>
          ) : (
            <div className="cls-choice cls-choice--fill" role="group" aria-label="Regions">
              <span className="cls-kicker">Regions</span>
              <div className="cls-choice__buttons">
                {(
                  [
                    ["you", "Yours"],
                    ["svm", "SVM"],
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
            { mark: "yours" as const, label: "your line" },
            { mark: "edge" as const, label: "your street" },
            ...(svm
              ? [
                  { mark: "model" as const, label: "the SVM's line" },
                  { mark: "street" as const, label: "the SVM's street" },
                  { mark: "ring" as const, label: "support vectors" },
                ]
              : []),
          ]}
        />
      </aside>

      <div>
        <SvmPlot
          scenario={scenario}
          line={line}
          street={street}
          onChange={editLine}
          svm={svm}
          regionUrl={regionUrl}
          showTruth={showTruth}
          showTest={showTest}
        />
      </div>
    </div>
  );
}
