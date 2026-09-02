// The distribution game (/examples/naive-bayes).
//
// Draw a decision boundary by hand, then fit Gaussian naive Bayes to the same
// sample and see who did better — and, more to the point, *why*.
//
// Two comparisons carry the lesson:
//
//   you vs naive Bayes   — can a person beat a fitted model by eye? On round
//                          blobs, rarely. On a tilted pair, easily, because the
//                          model is structurally unable to draw the line you
//                          can see.
//   train vs test        — the same classifier scored on the points you can
//                          see and on 600 held-out ones. Chase every last
//                          visible point and this gap opens up. That gap is
//                          overfitting, shown rather than defined.
//
// Static and unauthenticated: everything is generated and fitted in the browser
// from a seed, so there is nothing to load and a given seed always replays.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SetStateAction,
} from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./naive-bayes.css";
import {
  defaultCuts,
  defaultRules,
  difficultyApplies,
  fitNaiveBayes,
  makeScenario,
  nbPredict,
  scoreBoth,
  studentPredict,
  type Difficulty,
  type Student1D,
  type Student2D,
} from "./nb.js";
import { CLASS_COLORS, formatPct } from "./plot.js";
import { ScatterPlot, type RegionMode } from "./ScatterPlot.js";
import { StripPlot } from "./StripPlot.js";

const DIFFICULTIES: Array<{ key: Difficulty; label: string; hint: string }> = [
  {
    key: "round",
    label: "Round",
    hint: "Each class is one round blob — exactly what naive Bayes expects. It should be near-optimal here.",
  },
  {
    key: "tilted",
    label: "Tilted",
    hint: "Long diagonal clouds. The features move together, and independence is the one thing naive Bayes assumes away.",
  },
  {
    key: "interleaved",
    label: "Interleaved",
    hint: "Classes that share their per-feature curves. Looked at one feature at a time they are identical, so the model is left guessing.",
  },
];

export function NaiveBayesPage() {
  const [dim, setDim] = useState<1 | 2>(2);
  const [nClasses, setNClasses] = useState<2 | 3>(2);
  const [difficulty, setDifficulty] = useState<Difficulty>("round");
  const [seed, setSeed] = useState(20250902);
  const [fitted, setFitted] = useState(false);
  // The held-out points are a reveal, not a permanent layer: fitting shows them,
  // and the next change of any kind takes them away again. Seeing the test set
  // while still dragging would turn an honest score into a target to fit.
  const [showTest, setShowTest] = useState(false);
  const [regionMode, setRegionMode] = useState<RegionMode>("you");
  // The true distributions are the answer key: hidden by default so the
  // boundary is drawn from the points, not traced off the generating shapes.
  const [showShapes, setShowShapes] = useState(false);
  const [student2d, setStudent2d] = useState<Student2D>(() => ({
    kind: "lines",
    rules: defaultRules(2),
    fallback: 1,
  }));
  const [student1d, setStudent1d] = useState<Student1D>(() => defaultCuts(2));

  const scenario = useMemo(
    () => makeScenario({ dim, nClasses, difficulty, seed }),
    [dim, nClasses, difficulty, seed],
  );

  // A new scenario means the old boundaries are meaningless, and the fitted
  // model has to be asked for again rather than lingering from the last round.
  useEffect(() => {
    setStudent2d({
      kind: "lines",
      rules: defaultRules(nClasses),
      fallback: nClasses - 1,
    });
    setStudent1d(defaultCuts(nClasses));
    setFitted(false);
    setShowTest(false);
    setRegionMode("you");
  }, [dim, nClasses, difficulty, seed]);

  const nb = useMemo(
    () => (fitted ? fitNaiveBayes(scenario.train, nClasses, dim) : null),
    [fitted, scenario, nClasses, dim],
  );

  const student = dim === 1 ? student1d : student2d;
  // Every edit to the hand-drawn classifier hides the held-out points again.
  // These accept the same argument as the raw setters (value or updater), so
  // call sites read unchanged.
  const editStudent2d = useCallback((next: SetStateAction<Student2D>) => {
    setStudent2d(next);
    setShowTest(false);
  }, []);
  const editStudent1d = useCallback((next: SetStateAction<Student1D>) => {
    setStudent1d(next);
    setShowTest(false);
  }, []);
  const yourScores = useMemo(
    () => scoreBoth(scenario, (x) => studentPredict(x, student)),
    [scenario, student],
  );
  const nbScores = useMemo(
    () => (nb ? scoreBoth(scenario, (x) => nbPredict(x, nb)) : null),
    [scenario, nb],
  );
  const newSample = useCallback(
    () => setSeed((s) => (s * 1103515245 + 12345) >>> 8),
    [],
  );

  const cycleClass = (current: number) => (current + 1) % nClasses;
  const tiltedBlocked = !difficultyApplies("tilted", dim);

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
        <div className="mnist-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Naive Bayes</h1>
            <p className="mnist-lede">
              Examine data drawn from a 1-dimensional or 2-dimensional
              distribution. Then, compare your own results to those of the
              classifier Naive Bayes.
              <b>Drag the boundaries</b> to build the best classifier you can,
              then compare with the model by fitting <b>Naive Bayes</b>. You can
              change the difficulty by changing the data to fit.
            </p>
          </div>

          <div className="mnist-layout">
            <aside className="mnist-controls">
              {/* ── Scoreboard ─────────────────────────────────────────── */}
              <div
                className={
                  "nb-scores" + (showTest ? "" : " nb-scores--train-only")
                }
                aria-live="polite"
              >
                <div className="nb-scores__head">
                  <span />
                  <span>train</span>
                  {showTest && <span>test</span>}
                </div>
                <ScoreRow
                  name="You"
                  tone="you"
                  train={yourScores.train}
                  test={showTest ? yourScores.test : null}
                />
                {nbScores ? (
                  <ScoreRow
                    name="Naive Bayes"
                    tone="nb"
                    train={nbScores.train}
                    test={showTest ? nbScores.test : null}
                  />
                ) : (
                  <div className="nb-scores__row nb-scores__row--pending">
                    <span className="nb-scores__name">Naive Bayes</span>
                    <span className="nb-scores__hidden" />
                    {showTest && <span className="nb-scores__hidden" />}
                  </div>
                )}
                <p className="nb-scores__note">
                  {showTest ? (
                    <>
                      <b>train</b> is the {scenario.train.length} points on
                      screen. <b>test</b> is {scenario.test.length} held-out
                      points from the same distributions.
                    </>
                  ) : (
                    <>
                      <b>train</b> is the {scenario.train.length} points on
                      screen. Fit Naive Bayes to test on a held-out dataset.
                    </>
                  )}
                </p>
              </div>

              {!fitted ? (
                <button
                  type="button"
                  className="nb-fit"
                  onClick={() => {
                    setFitted(true);
                    setShowTest(true);
                  }}
                >
                  Fit naive Bayes
                </button>
              ) : (
                <div className="nb-modes">
                  <span className="nb-modes__label">Show regions</span>
                  <div className="nb-seg">
                    {(
                      [
                        ["you", "Yours"],
                        ["nb", "Naive Bayes"],
                        ["none", "Off"],
                      ] as Array<[RegionMode, string]>
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className={
                          "nb-seg__btn" + (regionMode === k ? " is-on" : "")
                        }
                        onClick={() => setRegionMode(k)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Your classifier ────────────────────────────────────── */}
              <div className="nb-rules">
                <p className="nb-rules__title">Your classifier</p>
                {dim === 2 ? (
                  <>
                    {student2d.rules.map((rule, i) => (
                      <div key={rule.id} className="nb-rule-chip">
                        <span className="nb-rule-chip__n">{i + 1}</span>
                        <span className="nb-rule-chip__text">
                          arrow side is
                          <button
                            type="button"
                            className="nb-swatch"
                            style={{ background: CLASS_COLORS[rule.captures]! }}
                            onClick={() =>
                              editStudent2d((s) => ({
                                ...s,
                                rules: s.rules.map((r, j) =>
                                  j === i
                                    ? { ...r, captures: cycleClass(r.captures) }
                                    : r,
                                ),
                              }))
                            }
                          >
                            {scenario.classes[rule.captures]!.label}
                          </button>
                        </span>
                        <button
                          type="button"
                          className="nb-mini"
                          onClick={() =>
                            editStudent2d((s) => ({
                              ...s,
                              rules: s.rules.map((r, j) =>
                                j === i ? { ...r, flipped: !r.flipped } : r,
                              ),
                            }))
                          }
                        >
                          flip
                        </button>
                      </div>
                    ))}
                    <div className="nb-rule-chip nb-rule-chip--fallback">
                      <span className="nb-rule-chip__n">·</span>
                      <span className="nb-rule-chip__text">
                        everything else is
                        <button
                          type="button"
                          className="nb-swatch"
                          style={{
                            background: CLASS_COLORS[student2d.fallback]!,
                          }}
                          onClick={() =>
                            editStudent2d((s) => ({
                              ...s,
                              fallback: cycleClass(s.fallback),
                            }))
                          }
                        >
                          {scenario.classes[student2d.fallback]!.label}
                        </button>
                      </span>
                    </div>
                    {nClasses === 3 && (
                      <p className="nb-rules__hint">
                        Three classes needs two lines <i>in order</i>: line 1
                        sets the first class, line 2 distinguishes between the
                        second and third. Naive Bayes itself avoids this problem
                        by using probability distributions.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {student1d.labels.map((label, i) => (
                      <div key={i} className="nb-rule-chip">
                        <span className="nb-rule-chip__n">{i + 1}</span>
                        <span className="nb-rule-chip__text">
                          {i === 0
                            ? "left of cut 1"
                            : i === student1d.labels.length - 1
                              ? `right of cut ${i}`
                              : `between cuts ${i} and ${i + 1}`}{" "}
                          is
                          <button
                            type="button"
                            className="nb-swatch"
                            style={{ background: CLASS_COLORS[label]! }}
                            onClick={() =>
                              editStudent1d((s) => ({
                                ...s,
                                labels: s.labels.map((l, j) =>
                                  j === i ? cycleClass(l) : l,
                                ),
                              }))
                            }
                          >
                            {scenario.classes[label]!.label}
                          </button>
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* ── The data ───────────────────────────────────────────── */}
              <div className="nb-setup">
                <p className="nb-rules__title">The data</p>

                <div className="nb-field">
                  <span className="nb-field__label">Features</span>
                  <div className="nb-seg">
                    {([1, 2] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={"nb-seg__btn" + (dim === d ? " is-on" : "")}
                        onClick={() => setDim(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="nb-field">
                  <span className="nb-field__label">Classes</span>
                  <div className="nb-seg">
                    {([2, 3] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={
                          "nb-seg__btn" + (nClasses === k ? " is-on" : "")
                        }
                        onClick={() => setNClasses(k)}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="nb-shapes">
                  {DIFFICULTIES.filter((d) =>
                    difficultyApplies(d.key, dim),
                  ).map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={
                        "nb-shape" +
                        (scenario.difficulty === d.key ? " is-on" : "")
                      }
                      onClick={() => setDifficulty(d.key)}
                      title={d.hint}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="nb-rules__hint">
                  {tiltedBlocked && difficulty === "tilted" ? (
                    <>
                      <b>Tilted</b> is only possible with two features. Tilted
                      shapes break the underlying assumption of Naive Bayes:
                      that distributions are independent.
                    </>
                  ) : (
                    DIFFICULTIES.find((d) => d.key === scenario.difficulty)
                      ?.hint
                  )}
                </p>

                <div className="nb-buttons">
                  <button
                    type="button"
                    className="mnist-clear"
                    onClick={newSample}
                  >
                    New sample
                  </button>
                </div>
                <button
                  type="button"
                  className={
                    "mnist-clear" + (showShapes ? " mnist-clear--on" : "")
                  }
                  onClick={() => setShowShapes((v) => !v)}
                >
                  {showShapes
                    ? "Hide true distributions"
                    : "Show true distributions"}
                </button>
              </div>

              <div className="mnist-legend">
                {scenario.classes.map((c, i) => (
                  <div className="mnist-legend__row" key={i}>
                    <span
                      className="nb-legend__dot"
                      style={{ background: CLASS_COLORS[i]! }}
                    />
                    class {c.label} — {Math.round(c.prior * 100)}% of draws
                  </div>
                ))}
                {showShapes && dim === 2 && (
                  <div className="mnist-legend__row">
                    soft disk = true distribution · solid = Naive Bayes' fit
                  </div>
                )}
              </div>
            </aside>

            <div className="mnist-canvas">
              <div className="mnist-canvas__bar">
                <span className="mnist-canvas__hint">
                  {dim === 2
                    ? "Drag the handles to move a boundary"
                    : "Drag the cuts"}
                </span>
                <button
                  type="button"
                  className="mnist-clear"
                  onClick={() => {
                    setStudent2d({
                      kind: "lines",
                      rules: defaultRules(nClasses),
                      fallback: nClasses - 1,
                    });
                    setStudent1d(defaultCuts(nClasses));
                    setShowTest(false);
                  }}
                >
                  Reset boundaries
                </button>
              </div>
              {dim === 2 ? (
                <ScatterPlot
                  scenario={scenario}
                  student={student2d}
                  onChange={editStudent2d}
                  nb={nb}
                  regionMode={regionMode}
                  showShapes={showShapes}
                  showTest={showTest}
                />
              ) : (
                <StripPlot
                  scenario={scenario}
                  student={student1d}
                  onChange={editStudent1d}
                  nb={nb}
                  regionMode={regionMode}
                  showShapes={showShapes}
                  showTest={showTest}
                />
              )}
            </div>
          </div>

          <footer className="mnist-foot">
            <p>
              Naive Bayes learns one mean and one variance <i>per feature</i>.
              That is represented by the curves in the 1d case and the pairs of
              curves along the sides in the 2d case. The classes are scaled by
              how common that class is. Because the distributions along the left
              and bottom are multipled together, they can only be circular.
              Similarly because Naive Bayes fits normal curves, it does not
              perform well with "lumpy" or interleaved data.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  name,
  tone,
  train,
  test,
}: {
  name: string;
  tone: string;
  train: number;
  /** Null until the held-out points are revealed, which hides the column. */
  test: number | null;
}) {
  return (
    <div className={`nb-scores__row nb-scores__row--${tone}`}>
      <span className="nb-scores__name">{name}</span>
      <span className="nb-scores__val nb-scores__val--muted">
        {formatPct(train)}
      </span>
      {test !== null && (
        <span className="nb-scores__val">{formatPct(test)}</span>
      )}
    </div>
  );
}
