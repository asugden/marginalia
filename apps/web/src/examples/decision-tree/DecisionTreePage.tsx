// The decision-tree lesson (/examples/decision-tree).
//
// Structured as a walkable sequence rather than a single sandbox: an instructor
// can step through it in front of a class with the arrow keys, and a student can
// work the same steps alone afterwards. Every figure is live — the same
// components in a different configuration — so nothing here is a screenshot of
// a result that the page cannot also recompute.
//
// The sequence is built around one specific confusion. A finished tree diagram
// shows a chain of questions, each on a different feature, and it is very easy
// to read that chain as a ranked list of features chosen up front. It is not.
// Splits are chosen locally, from whatever rows reach a node, and the winner on
// one branch has nothing to do with the winner on the other. Steps 2, 4 and 6
// exist to take that reading apart; the rest builds on it.
//
// Each step changes exactly one thing from the step before.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./decision-tree.css";
import {
  accuracy,
  growOptimalTree,
  growTree,
  growWithForcedRoot,
  mse,
  searchSplits,
  splitQuestion,
  treeDepth,
  type Criterion,
  type Dataset,
} from "../shared/trees/cart.js";
import {
  animalsDiet,
  animalsDietSpeed,
  animalsTiny,
  dogsComfort,
  dogsWeight,
} from "../shared/trees/datasets.js";
import { TreeView } from "../shared/trees/TreeView.js";
import { GainChart } from "../shared/trees/GainChart.js";
import { ThresholdCurve } from "../shared/trees/ThresholdCurve.js";
import { DataTable } from "./DataTable.js";
import { BaggingFigure } from "./BaggingFigure.js";

const DOG_PHOTO = "/examples/decision-tree/dogs.jpg";

type Figure =
  | { kind: "tree"; dataset: Dataset; depth: number }
  | { kind: "forced-root"; dataset: Dataset; depth: number }
  | { kind: "table"; dataset: Dataset }
  | { kind: "pick-root"; dataset: Dataset }
  | { kind: "gain"; dataset: Dataset; depth: number; nodeId: string }
  | { kind: "branches"; dataset: Dataset }
  | { kind: "exhausted"; dataset: Dataset }
  | { kind: "threshold"; dataset: Dataset; featureIndex: number }
  | { kind: "revisit"; dataset: Dataset; depth: number }
  | { kind: "greedy"; dataset: Dataset; depth: number }
  | { kind: "regression"; dataset: Dataset; depth: number }
  | { kind: "sandbox" }
  | { kind: "bagging" };

interface Step {
  title: string;
  body: React.ReactNode;
  figure: Figure;
}

const STEPS: Step[] = [
  {
    title: "A tree is a stack of questions",
    body: (
      <>
        Four animals, three yes/no features, one animal per leaf. Follow the
        answers down and you land on a prediction. This particular tree was
        written by a person — nothing has been learned yet, and that distinction
        is about to matter.
      </>
    ),
    figure: { kind: "tree", dataset: animalsTiny, depth: 3 },
  },
  {
    title: "So why is that question first?",
    body: (
      <>
        Put any of the three features at the root and the tree still gets all
        four animals right. Every ordering works, because with one animal per
        leaf there is nothing left over to be wrong about. Score the three
        candidates and they come out <b>exactly equal</b>.
        <br />
        <br />
        So the order in the diagram is not telling you which feature is best. A
        tree drawn this way can teach the <i>shape</i> of a tree, but it cannot
        teach how one gets built — and it quietly invites you to read the depth
        of a question as its importance.
      </>
    ),
    figure: { kind: "forced-root", dataset: animalsTiny, depth: 3 },
  },
  {
    title: "Ask something it can't just look up",
    body: (
      <>
        Same flavour of features, harder question: predict what an animal{" "}
        <b>eats</b> from its body plan. Twenty-four animals, three diets. Now
        several rows share a pattern and disagree on the answer — a cow and a
        rabbit look identical here, and so do a bear and a dog. No arrangement of
        questions can separate them.
        <br />
        <br />
        That is the point. Leaves will come out mixed, so splits have to be{" "}
        <i>scored</i> rather than merely listed.
      </>
    ),
    figure: { kind: "table", dataset: animalsDiet },
  },
  {
    title: "Your turn: pick the first question",
    body: (
      <>
        A split is scored by how much <b>impurity</b> it removes. Impurity is
        just "how mixed is this group" — zero when every row agrees. Try each
        feature: how mixed are the two groups it makes, compared with the group
        you started from? That drop is the <b>gain</b>.
        <br />
        <br />
        Pick the feature you think wins, then reveal the scores.
      </>
    ),
    figure: { kind: "pick-root", dataset: animalsDiet },
  },
  {
    title: "The junk feature loses on its own",
    body: (
      <>
        "Is a genius" was planted as pure noise — it is spread across the three
        diets in roughly the proportions they already occur in. Nobody told the
        algorithm to ignore it; it scores near zero and loses. Feature selection
        is not a step you do beforehand, it falls out of the scoring.
        <br />
        <br />
        With one caveat worth seeing later: noise only reliably loses while there
        is enough data at a node to out-vote it. Grow deep enough, and the tree
        will happily split on it.
      </>
    ),
    figure: { kind: "gain", dataset: animalsDiet, depth: 3, nodeId: "r" },
  },
  {
    title: "The winner changes from branch to branch",
    body: (
      <>
        Here is the part a finished diagram hides. After the root split, the two
        branches hold <i>different rows</i>, so the search runs again from
        scratch on each — and comes out differently. On the furry animals,{" "}
        <b>hooves</b> wins. On everything else, hooves is useless and{" "}
        <b>feathers</b> wins.
        <br />
        <br />
        There is no global ranking of features anywhere in this algorithm. There
        is only "what is the best question <i>for these rows</i>", asked again at
        every node.
      </>
    ),
    figure: { kind: "branches", dataset: animalsDiet },
  },
  {
    title: "A yes/no feature gets used up",
    body: (
      <>
        Split on "has fur" and every animal below the yes-branch has fur. Ask it
        again and both groups are identical to what you started with — the gain
        is exactly zero, and the chart greys it out.
        <br />
        <br />
        So on binary data, each question really is asked at most once along any
        path. That is not a simplification, it is how binary features behave. It
        is also the reason this dataset can never show you the next two ideas.
      </>
    ),
    figure: { kind: "exhausted", dataset: animalsDiet },
  },
  {
    title: "Your turn: where do you cut?",
    body: (
      <>
        Same animals, same question, <b>one new column</b>: top speed. A yes/no
        feature offers the search a single candidate split. A continuous one
        offers a candidate between every pair of neighbouring values — so
        choosing it means also choosing <i>where</i>.
        <br />
        <br />
        Drag along the curve. Each dot is a threshold the search actually tries;
        the height is the gain it would get. Notice how sharply the score falls
        away from the peak.
      </>
    ),
    figure: { kind: "threshold", dataset: animalsDietSpeed, featureIndex: 8 },
  },
  {
    title: "And now you have to come back",
    body: (
      <>
        A continuous feature is <i>never</i> used up. Cut speed at 9 km/h and the
        fast group still contains a whole range of speeds, so the tree cuts it
        again further down — at 52.5, and again at 26 on another branch.
        <br />
        <br />
        This is how a tree carves a continuous variable into intervals: not in
        one go, but by returning to it. Compare that with step 7, where a yes/no
        feature was finished the moment it was used. Same algorithm, and the
        difference comes entirely from the kind of column.
      </>
    ),
    figure: { kind: "revisit", dataset: animalsDietSpeed, depth: 4 },
  },
  {
    title: "Greedy is not the same as best",
    body: (
      <>
        A dog is comfortable when its coat matches the weather: thick coat on a
        cold day, thin coat on a warm one. Mismatched, it is miserable.
        <br />
        <br />
        Score the two features that <i>determine</i> the answer and both come out
        at <b>exactly zero</b> — split on coat alone and each side is half
        comfortable; same for the weather. Meanwhile the sweater carries a little
        incidental signal, so it scores above zero and the greedy search takes
        it. It never recovers.
        <br />
        <br />
        The tree on the right is the best possible tree of that depth, found by
        trying every combination. The algorithm optimises one split at a time,
        and a pair of splits that only works together is invisible to it.
      </>
    ),
    figure: { kind: "greedy", dataset: dogsComfort, depth: 2 },
  },
  {
    title: "Same machinery, numeric answer",
    body: (
      <>
        Swap the question from "which class" to "how much" and almost nothing
        changes. Impurity becomes <b>variance</b>, a leaf predicts the{" "}
        <b>mean</b> of the rows that reach it, and the search runs exactly as
        before. Because a leaf's prediction is a single number, the tree's output
        is a staircase.
        <br />
        <br />
        Note the leaves predict absolute weights, not adjustments. That
        distinction becomes the whole story when these trees get stacked into a
        boosted ensemble.
      </>
    ),
    figure: { kind: "regression", dataset: dogsWeight, depth: 3 },
  },
  {
    title: "One tree is not enough",
    body: (
      <>
        Every tree on this page was grown on <i>all</i> the data, so there is
        only ever one tree to grow — run it again and you get the same tree.
        Which means the only way to get a second opinion is to change the
        question you asked.
        <br />
        <br />
        <b>Bagging</b> changes the data instead. Draw a new sample the same size
        as the original, <i>with replacement</i>: some rows come up twice, some
        do not come up at all. Give every row its own colour and you can watch it
        happen. Fit a tree to each sample and they disagree — which sounds like a
        defect and is in fact the entire point, because you can average
        disagreement away and you cannot average away a mistake every model
        makes.
        <br />
        <br />
        The rows left out are a free gift: no tree has seen them, so each can be
        tested on its own leftovers. That is the <b>out-of-bag</b> score, and it
        is what the forest example plots.
      </>
    ),
    figure: { kind: "bagging" },
  },
  {
    title: "Your turn: build one",
    body: (
      <>
        Pick a dataset and a depth. Click any node to see the candidates it
        considered and what it chose.
        <br />
        <br />
        Worth trying: push the depth up on the animals and watch the noise
        feature start winning splits once the nodes get small. Every extra level
        buys accuracy on rows you can already see, and at some point buys nothing
        on rows you cannot.
        <br />
        <br />
        That is where the other two examples pick up: a{" "}
        <a href="/examples/random-forest">random forest</a> grows many trees on
        bagged samples and lets them vote, and{" "}
        <a href="/examples/gradient-boosting">gradient boosting</a> grows them one
        after another, each fixing the last one's mistakes.
      </>
    ),
    figure: { kind: "sandbox" },
  },
];

const SANDBOX_SETS = [animalsDiet, animalsDietSpeed, dogsComfort, dogsWeight];

function critFor(d: Dataset): Criterion {
  return d.classes ? "gini" : "variance";
}
function nClassesOf(d: Dataset): number {
  return d.classes?.length ?? 1;
}

export function DecisionTreePage() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]!;

  // Per-step interaction state, reset whenever the step changes so a student
  // arriving at a "your turn" step always gets a clean slate.
  const [forcedRoot, setForcedRoot] = useState(0);
  const [guess, setGuess] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [sandboxSet, setSandboxSet] = useState<Dataset>(animalsDiet);
  const [sandboxDepth, setSandboxDepth] = useState(3);
  const [pickedNode, setPickedNode] = useState<string>("r");

  useEffect(() => {
    setGuess(null);
    setRevealed(false);
    setThreshold(null);
    setPickedNode("r");
  }, [stepIndex]);

  const go = useCallback((delta: number) => {
    setStepIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
  }, []);

  // Arrow keys drive the lesson, so it can be run from the back of a room.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

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
        <div className="dt-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Decision Tree Classifiers</h1>
            <p className="mnist-lede">
              {STEPS.length} steps, each changing one thing. Walk them with the arrow
              keys. The theme throughout: a tree is not a ranked list of
              features — it is the same small search, re-run from scratch at
              every node on whatever rows got there.
            </p>
          </div>

          <div className="dt-layout">
            <ol className="dt-rail">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <button
                    type="button"
                    className={"dt-rail__item" + (i === stepIndex ? " is-on" : "")}
                    onClick={() => setStepIndex(i)}
                  >
                    <span className="dt-rail__n">{i + 1}</span>
                    <span className="dt-rail__t">{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="dt-main">
              <div className="dt-caption">
                <p className="dt-caption__eyebrow">
                  Step {stepIndex + 1} of {STEPS.length}
                </p>
                <h2>{step.title}</h2>
                <div className="dt-caption__body">{step.body}</div>
              </div>

              <div className="dt-figure">
                <Figure
                  figure={step.figure}
                  forcedRoot={forcedRoot}
                  setForcedRoot={setForcedRoot}
                  guess={guess}
                  setGuess={setGuess}
                  revealed={revealed}
                  setRevealed={setRevealed}
                  threshold={threshold}
                  setThreshold={setThreshold}
                  sandboxSet={sandboxSet}
                  setSandboxSet={setSandboxSet}
                  sandboxDepth={sandboxDepth}
                  setSandboxDepth={setSandboxDepth}
                  pickedNode={pickedNode}
                  setPickedNode={setPickedNode}
                />
              </div>

              <div className="dt-nav">
                <button
                  type="button"
                  className="mnist-clear"
                  onClick={() => go(-1)}
                  disabled={stepIndex === 0}
                >
                  ← Back
                </button>
                <span className="dt-nav__hint">arrow keys work too</span>
                <button
                  type="button"
                  className="mnist-clear"
                  onClick={() => go(1)}
                  disabled={stepIndex === STEPS.length - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FigureProps {
  figure: Figure;
  forcedRoot: number;
  setForcedRoot: (n: number) => void;
  guess: number | null;
  setGuess: (n: number | null) => void;
  revealed: boolean;
  setRevealed: (b: boolean) => void;
  threshold: number | null;
  setThreshold: (n: number) => void;
  sandboxSet: Dataset;
  setSandboxSet: (d: Dataset) => void;
  sandboxDepth: number;
  setSandboxDepth: (n: number) => void;
  pickedNode: string;
  setPickedNode: (id: string) => void;
}

function Figure(p: FigureProps) {
  const f = p.figure;

  switch (f.kind) {
    case "tree": {
      const tree = growTree(f.dataset.rows, f.dataset.features, {
        criterion: critFor(f.dataset),
        nClasses: nClassesOf(f.dataset),
        maxDepth: f.depth,
      });
      return <TreeView dataset={f.dataset} root={tree} />;
    }

    case "forced-root": {
      const d = f.dataset;
      const tree = growWithForcedRoot(
        d.rows,
        d.features,
        { criterion: "gini", nClasses: nClassesOf(d), maxDepth: f.depth },
        p.forcedRoot,
      );
      return (
        <>
          <div className="dt-controls">
            <span className="dt-controls__label">Force the root question</span>
            {d.features.map((feat, i) => (
              <button
                key={feat.key}
                type="button"
                className={"dt-chip" + (p.forcedRoot === i ? " is-on" : "")}
                onClick={() => p.setForcedRoot(i)}
              >
                {feat.name}
              </button>
            ))}
            <span className="dt-verdict">
              still {Math.round(accuracy(tree, d.rows) * 100)}% correct ·{" "}
              {treeDepth(tree)} levels deep
            </span>
          </div>
          <TreeView dataset={d} root={tree} />
          <GainChart
            dataset={d}
            rows={d.rows}
            criterion="gini"
            nClasses={nClassesOf(d)}
            title="Every candidate at the root"
          />
        </>
      );
    }

    case "table":
      return <DataTable dataset={f.dataset} />;

    case "pick-root": {
      const d = f.dataset;
      return (
        <>
          <GainChart
            dataset={d}
            rows={d.rows}
            criterion="gini"
            nClasses={nClassesOf(d)}
            title={p.revealed ? "Every candidate at the root" : "Click the feature you'd pick"}
            hideWinner={!p.revealed}
            onPick={p.revealed ? undefined : (i) => p.setGuess(i)}
            picked={p.guess}
          />
          <div className="dt-controls">
            {!p.revealed ? (
              <button
                type="button"
                className="mnist-clear"
                disabled={p.guess === null}
                onClick={() => p.setRevealed(true)}
              >
                Reveal the winner
              </button>
            ) : (
              <span className="dt-verdict">
                {p.guess ===
                searchSplits(d.rows, d.features, { criterion: "gini", nClasses: nClassesOf(d) })
                  .winner
                  ? "That's the one — fur splits the furry animals off, and they lean herbivore."
                  : `The winner is ${
                      d.features[
                        searchSplits(d.rows, d.features, {
                          criterion: "gini",
                          nClasses: nClassesOf(d),
                        }).winner
                      ]!.name
                    }. Worth asking why yours scored lower.`}
              </span>
            )}
          </div>
        </>
      );
    }

    case "gain": {
      const d = f.dataset;
      return (
        <GainChart
          dataset={d}
          rows={d.rows}
          criterion="gini"
          nClasses={nClassesOf(d)}
          title="Every candidate at the root"
        />
      );
    }

    case "branches": {
      const d = f.dataset;
      const tree = growTree(d.rows, d.features, {
        criterion: "gini",
        nClasses: nClassesOf(d),
        maxDepth: 1,
      });
      const q = splitQuestion(d.features[tree.split!.featureIndex]!, tree.split!.threshold);
      return (
        <>
          <p className="dt-note">
            Root question: <b>{q}</b> — now score the candidates again, separately,
            on each side.
          </p>
          <div className="dt-split">
            <GainChart
              dataset={d}
              rows={tree.left!.rows}
              criterion="gini"
              nClasses={nClassesOf(d)}
              title="Answered no"
            />
            <GainChart
              dataset={d}
              rows={tree.right!.rows}
              criterion="gini"
              nClasses={nClassesOf(d)}
              title="Answered yes"
            />
          </div>
        </>
      );
    }

    case "exhausted": {
      const d = f.dataset;
      const tree = growTree(d.rows, d.features, {
        criterion: "gini",
        nClasses: nClassesOf(d),
        maxDepth: 1,
      });
      return (
        <GainChart
          dataset={d}
          rows={tree.right!.rows}
          criterion="gini"
          nClasses={nClassesOf(d)}
          title="Candidates below the yes-branch — greyed ones can no longer split"
        />
      );
    }

    case "threshold": {
      const d = f.dataset;
      return (
        <ThresholdCurve
          dataset={d}
          rows={d.rows}
          featureIndex={f.featureIndex}
          criterion="gini"
          nClasses={nClassesOf(d)}
          value={p.threshold}
          onChange={p.setThreshold}
        />
      );
    }

    case "revisit": {
      const d = f.dataset;
      const tree = growTree(d.rows, d.features, {
        criterion: "gini",
        nClasses: nClassesOf(d),
        maxDepth: f.depth,
      });
      const numeric = new Set<string>();
      const collect = (n: typeof tree): void => {
        if (n.split && d.features[n.split.featureIndex]!.kind === "numeric") {
          numeric.add(n.id);
        }
        if (n.left) collect(n.left);
        if (n.right) collect(n.right);
      };
      collect(tree);
      return (
        <>
          <p className="dt-note">
            Highlighted: every node that split on <b>top speed</b>. The same
            column, {numeric.size} times, at a different threshold each time.
          </p>
          <TreeView dataset={d} root={tree} selected={numeric} />
        </>
      );
    }

    case "greedy": {
      const d = f.dataset;
      const opts = { criterion: "gini" as const, nClasses: nClassesOf(d), maxDepth: f.depth };
      const greedy = growTree(d.rows, d.features, opts);
      const best = growOptimalTree(d.rows, d.features, opts);
      return (
        <>
          <GainChart
            dataset={d}
            rows={d.rows}
            criterion="gini"
            nClasses={nClassesOf(d)}
            title="Candidates at the root — the two that matter score zero"
          />
          <div className="dt-split">
            <div className="dt-panel">
              <p className="dt-panel__title">
                Greedy · {Math.round(accuracy(greedy, d.rows) * 100)}% correct
              </p>
              <TreeView dataset={d} root={greedy} />
            </div>
            <div className="dt-panel">
              <p className="dt-panel__title">
                Best possible · {Math.round(accuracy(best, d.rows) * 100)}% correct
              </p>
              <TreeView dataset={d} root={best} />
            </div>
          </div>
        </>
      );
    }

    case "regression": {
      const d = f.dataset;
      const tree = growTree(d.rows, d.features, {
        criterion: "variance",
        nClasses: 1,
        maxDepth: f.depth,
        minSamplesLeaf: 2,
      });
      return (
        <>
          <figure className="dt-photo">
            <PhotoOrNothing src={DOG_PHOTO} />
            <figcaption>
              Predicting weight from ear length. Root mean squared error:{" "}
              {Math.sqrt(mse(tree, d.rows)).toFixed(2)} kg.
            </figcaption>
          </figure>
          <TreeView dataset={d} root={tree} />
        </>
      );
    }

    case "bagging":
      return <BaggingFigure />;

    case "sandbox": {
      const d = p.sandboxSet;
      const crit = critFor(d);
      const nC = nClassesOf(d);
      const tree = growTree(d.rows, d.features, {
        criterion: crit,
        nClasses: nC,
        maxDepth: p.sandboxDepth,
        minSamplesLeaf: crit === "variance" ? 2 : 1,
      });
      const find = (n: typeof tree): typeof tree | null => {
        if (n.id === p.pickedNode) return n;
        return (n.left && find(n.left)) || (n.right && find(n.right)) || null;
      };
      const node = find(tree) ?? tree;
      return (
        <>
          <div className="dt-controls">
            <span className="dt-controls__label">Data</span>
            {SANDBOX_SETS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={"dt-chip" + (d.key === s.key ? " is-on" : "")}
                onClick={() => {
                  p.setSandboxSet(s);
                  p.setPickedNode("r");
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
          <div className="dt-controls">
            <span className="dt-controls__label">Depth {p.sandboxDepth}</span>
            <input
              type="range"
              min={1}
              max={6}
              value={p.sandboxDepth}
              onChange={(e) => {
                p.setSandboxDepth(Number(e.target.value));
                p.setPickedNode("r");
              }}
            />
            <span className="dt-verdict">
              {crit === "variance"
                ? `RMSE ${Math.sqrt(mse(tree, d.rows)).toFixed(2)} ${d.target?.unit ?? ""}`
                : `${Math.round(accuracy(tree, d.rows) * 100)}% correct on the rows it trained on`}
            </span>
          </div>
          <TreeView
            dataset={d}
            root={tree}
            selected={new Set([node.id])}
            onPickNode={(n) => p.setPickedNode(n.id)}
          />
          <GainChart
            dataset={d}
            rows={node.rows}
            criterion={crit}
            nClasses={nC}
            title={node.id === "r" ? "Candidates at the root" : `Candidates at node ${node.id}`}
          />
        </>
      );
    }
  }
}

/** The photo is a deployment asset rather than something committed with the
 *  code, so the page has to look right without it. If it will not load, drop it
 *  silently instead of showing a broken-image icon. */
function PhotoOrNothing({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img src={src} alt="Two dogs sitting side by side" onError={() => setOk(false)} />
  );
}
