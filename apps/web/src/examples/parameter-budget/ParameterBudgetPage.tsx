// The counting parameters example (/examples/parameter-budget).
//
// One question, asked for a reader who may never have heard the word: what is
// a parameter, how many does a model have, and where do they go? The page
// refuses to quote anything it can compute. It climbs one ladder:
//
//   1. The smallest models. Linear and logistic regression and naive Bayes,
//      small enough to draw every parameter as a square and count them.
//   2. A neural network. Every neuron is a logistic regression over the layer
//      before, so a layer's weights are a rectangle: from × to.
//   3. A language model. Everything in a block is a square in the width, so
//      the width is the number that matters; the fully connected layers hold
//      twice what attention does; and in a small model the word table is most
//      of it.
//   4. Making models smaller. Rounding (quantization) is run live on the real
//      digit recognizer; copying (distillation) shows what a student learns
//      from a teacher.
//   5. The ladder: every model on the page on one axis with published ones.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import type { CNNRawWeights } from "../mnist-cnn/cnn-net.js";
import "../mnist-mlp/digit-recognizer.css";
import type { RawWeights } from "../mnist-mlp/net.js";
import { loadNet } from "../mnist-mlp/net.js";
import "../shared/figure.css";
import { learned } from "../shared/palette.js";
import type { RawDigits } from "../training/autoencoder.js";
import { BiggerPanel, SplitPanel, useModelPick } from "./bigger.js";
import {
  DIGIT_CNN,
  DIGIT_CNN_TOTAL,
  PRECISIONS,
  REFERENCES,
  RESNET50,
  RESNET50_TOTAL,
  bytesFor,
  countBoosted,
  countDense,
  countLinear,
  countTree,
  formatBytes,
  formatParams,
  type Precision,
} from "./budget.js";
import {
  DigitBars,
  DigitThumb,
  FEATURES,
  InBetween,
  SmallModelsFigure,
  TreesFigure,
  WeightPictures,
} from "./figures.js";
import { MODELS } from "./models.js";
import {
  COUNT_FILL,
  ConvFigure,
  NetworkFigure,
  type ConvGap,
} from "./network.js";
import "./parameter-budget.css";
import {
  DIGITS_URL,
  WEIGHTS_URL,
  answer,
  makeBank,
  roundNet,
  score,
  type DigitBank,
} from "./quantize.js";

/** Presets that map onto models the student has already met in the gallery. */
const PRESETS: Array<{ name: string; widths: number[]; note: string }> = [
  {
    name: "Digit recognizer",
    widths: [400, 25, 25, 11],
    note: "the deep neural network example",
  },
  {
    name: "No hidden layers",
    widths: [400, 11],
    note: "one logistic regression per output",
  },
  {
    name: "Wide and shallow",
    widths: [400, 256, 11],
    note: "one fat hidden layer",
  },
  {
    name: "Narrow and deep",
    widths: [400, 32, 32, 32, 32, 11],
    note: "four thin layers instead",
  },
];

const MIN_W = 2;
const MAX_W = 512;

const DIGIT_RECOGNIZER = [400, 25, 25, 11];
const CNN_WEIGHTS_URL = "/examples/cnn-digit-recognizer/cnn-weights.json";
const TREE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const sameShape = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** The digit recognizer's weights and the shipped digits, which the network
 *  box, the rounding panel and the copying panel all use. */
function useDigitAssets() {
  const [raw, setRaw] = useState<RawWeights | null>(null);
  const [bank, setBank] = useState<DigitBank | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    const get = <T,>(url: string) =>
      fetch(url, { signal: ctrl.signal }).then((r) => {
        if (!r.ok) throw new Error(`${url} ${r.status}`);
        return r.json() as Promise<T>;
      });
    Promise.all([get<RawWeights>(WEIGHTS_URL), get<RawDigits>(DIGITS_URL)])
      .then(([w, d]) => {
        setRaw(w);
        setBank(makeBank(d, w.meta.dim));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, []);
  return { raw, bank, failed };
}

/** Digits from the shipped sample where the teacher hedges, plus one where
 *  it does not. Indices into training/digits.json. */
const DISTILL_DIGITS = [159, 217, 152, 205, 118, 1];

const TEACHER_PARAMS = countDense([400, 25, 25, 11]).total;
const STUDENT_PARAMS = countDense([400, 4, 11]).total;

export function ParameterBudgetPage() {
  const [features, setFeatures] = useState(2);
  const [widths, setWidths] = useState<number[]>([400, 25, 25, 11]);
  const [trees, setTrees] = useState(100);
  const [depth, setDepth] = useState(3);
  const [kind, setKind] = useState<"dense" | "conv">("dense");
  const [convModel, setConvModel] = useState<"digits" | "resnet">("digits");
  const [cnnRaw, setCnnRaw] = useState<CNNRawWeights | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(CNN_WEIGHTS_URL, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CNNRawWeights>) : null))
      .then((w) => w && setCnnRaw(w))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  // The digit recognizer's gaps, with its real kernels and weights once loaded.
  const cnnGaps = useMemo<ConvGap[]>(() => {
    const ws = cnnRaw
      ? [cnnRaw.k1, cnnRaw.k2, cnnRaw.wd, cnnRaw.wo].map((a) =>
          Float32Array.from(a),
        )
      : null;
    return DIGIT_CNN.gaps.map((g, i) => (ws ? { ...g, weights: [ws[i]!] } : g));
  }, [cnnRaw]);
  const [picked, setPicked] = useModelPick();
  const [precision, setPrecision] = useState<Precision>(PRECISIONS[0]!);
  const assets = useDigitAssets();

  const count = useMemo(() => countDense(widths), [widths]);
  const realNet = useMemo(
    () =>
      assets.raw && sameShape(widths, DIGIT_RECOGNIZER)
        ? loadNet(assets.raw)
        : null,
    [assets.raw, widths],
  );

  const setWidth = (i: number, v: number) =>
    setWidths((w) => {
      const next = w.slice();
      next[i] = Math.max(MIN_W, Math.min(MAX_W, v));
      return next;
    });

  const addLayer = () =>
    setWidths((w) =>
      w.length >= 7
        ? w
        : [
            ...w.slice(0, -1),
            w[w.length - 2] === w[0] ? 32 : w[w.length - 2]!,
            w[w.length - 1]!,
          ],
    );
  const removeLayer = () =>
    setWidths((w) =>
      w.length <= 2 ? w : [...w.slice(0, -2), w[w.length - 1]!],
    );

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
            <h1>Counting Parameters</h1>
            <p className="mnist-lede">
              A parameter is a single number learned by a machine learning
              model, and an ML model can contain just a few parameters up to
              trillions (as of today). More parameters allow us to learn more
              complex ideas, but can lead to overfitting, cost more to run, and
              take more training data.
            </p>
          </div>

          {/* ── The smallest models ── */}
          <Card className="pb-panel" padding="md">
            <h2 className="pb-h2">Open box models</h2>
            <p className="pb-sub">
              When it's essential that we understand all edge cases (e.g.
              healthcare), scientific validity (e.g. research), and that a model
              is unbiased with respect to protected classes (e.g. finance), use
              an open box model. Note how few parameters they use. This example
              makes a prediction from previous house sales.
            </p>
            <div className="pb-controls">
              <label className="pb-controls__row">
                <span className="pb-controls__label">features</span>
                <input
                  type="range"
                  min={1}
                  max={FEATURES.length}
                  value={features}
                  onChange={(e) => setFeatures(parseInt(e.target.value, 10))}
                />
                <span className="pb-controls__value">{features}</span>
              </label>
            </div>
            <div className="pb-fig">
              <SmallModelsFigure features={features} />
            </div>
            <p className="pb-legend">
              <span
                className="pb-swatch"
                style={{ background: "var(--ml-learned-pos)" }}
              />
              <span
                className="pb-swatch"
                style={{ background: "var(--ml-learned-neg)" }}
              />
              a learned number, above or below zero
              <span className="pb-legend__gap" />
              <span
                className="pb-swatch"
                style={{ background: "var(--ml-class-1)" }}
              />
              sold within a month
              <span
                className="pb-swatch"
                style={{ background: "var(--ml-class-2)" }}
              />
              did not
            </p>
          </Card>

          {/* ── Boosted trees ── */}
          <Card className="pb-panel" padding="md">
            <h2 className="pb-h2">Efficient black box models</h2>
            <p className="pb-sub">
              <Link to="/examples/gradient-boosting">XGBoost</Link> combines
              many "weak learners" (in this case, decision trees) to create one
              effective model. It is often the sweet spot, given that it does
              extremely well with missing data and 5-100 features. Its
              parameters are made up by the decision points in each tree (which
              feature and where to split).
            </p>
            <div className="pb-controls">
              <label className="pb-controls__row">
                <span className="pb-controls__label">trees</span>
                <input
                  type="range"
                  min={0}
                  max={TREE_STEPS.length - 1}
                  value={TREE_STEPS.indexOf(trees)}
                  onChange={(e) =>
                    setTrees(TREE_STEPS[parseInt(e.target.value, 10)]!)
                  }
                />
                <span className="pb-controls__value">
                  {trees.toLocaleString()}
                </span>
              </label>
              <label className="pb-controls__row">
                <span className="pb-controls__label">depth</span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={depth}
                  onChange={(e) => setDepth(parseInt(e.target.value, 10))}
                />
                <span className="pb-controls__value">{depth}</span>
              </label>
            </div>
            <div className="pb-fig">
              <TreesFigure trees={trees} depth={depth} />
            </div>
            <p className="pb-legend">
              <span className="pb-swatch" style={{ background: COUNT_FILL }} />
              which feature
              <span
                className="pb-swatch"
                style={{ background: learned(0.6) }}
              />
              its cut-off
              <span className="pb-legend__gap" />
              <span
                className="pb-swatch"
                style={{ background: "var(--ml-learned-pos)" }}
              />
              <span
                className="pb-swatch"
                style={{ background: "var(--ml-learned-neg)" }}
              />
              a leaf's answer, above or below zero
            </p>
            <div className="pb-fig pb-fig--gap">
              <InBetween
                marks={[
                  { name: "your linear regression", n: countLinear(features) },
                  {
                    name: "your trees",
                    n: countBoosted(trees, depth),
                    on: true,
                  },
                  { name: "your neural network", n: count.total },
                ]}
              />
            </div>
            <p className="pb-note">
              Each decision point of a tree is a feature and a threshold, two
              parameters. Thus, a tree {depth} deep has{" "}
              {(countTree(depth).questions * 2).toLocaleString()} such
              parameters and
              {countTree(depth).leaves.toLocaleString()} labels of the leaves,
              resulting in {countTree(depth).total.toLocaleString()} parameters.
            </p>
          </Card>

          {/* ── A network ── */}
          <Card className="pb-panel" padding="md">
            <div className="pb-head">
              <div>
                <h2 className="pb-h2">High complexity models</h2>
                <p className="pb-sub">
                  Neural networks are almost always high-complexity models with
                  very large numbers of parameters. Inside, however, it is
                  simply many repeats of high school algebra: y = mx + b. In
                  other words, repeated simple regressions.
                  <br />
                  <br />
                  For fully connected layers, every neuron has a parameter for a
                  weight from every neuron in the previous layer, plus a single
                  bias parameter. The weights between layers form a matrix or
                  grid with a row for every neuron in the second layer and a
                  column for every neuron in the first. Note that although
                  mathematically, any problem solvable by one shape of a fully
                  connected network can be solved by another, wide and shallow
                  networks pay twice in terms of parameters. This is why narrow
                  and deep neural networks have taken over.
                  <br />
                  <br />
                  Convolutional layers save parameters by using small kernels.
                  However, we use many kernels between layers, which can still
                  add up to large numbers of parameters.
                </p>
              </div>
            </div>

            <div className="pb-controls">
              <div className="pb-controls__row">
                <span className="pb-controls__label">network</span>
                <div className="pb-controls__buttons">
                  <Button
                    size="sm"
                    variant={kind === "dense" ? "primary" : "subtle"}
                    onClick={() => setKind("dense")}
                  >
                    Fully connected
                  </Button>
                  <Button
                    size="sm"
                    variant={kind === "conv" ? "primary" : "subtle"}
                    onClick={() => setKind("conv")}
                  >
                    Convolutional
                  </Button>
                </div>
              </div>
              {kind === "conv" && (
                <div className="pb-controls__row">
                  <span className="pb-controls__label">model</span>
                  <div className="pb-controls__buttons">
                    <Button
                      size="sm"
                      variant={convModel === "digits" ? "primary" : "subtle"}
                      onClick={() => setConvModel("digits")}
                    >
                      Digit recognizer
                    </Button>
                    <Button
                      size="sm"
                      variant={convModel === "resnet" ? "primary" : "subtle"}
                      onClick={() => setConvModel("resnet")}
                    >
                      ResNet-50
                    </Button>
                  </div>
                </div>
              )}
              {kind === "dense" && (
                <>
                  <div className="pb-controls__row">
                    <span className="pb-controls__label">presets</span>
                    <div className="pb-controls__buttons">
                      {PRESETS.map((p) => (
                        <Button
                          key={p.name}
                          size="sm"
                          variant={
                            sameShape(p.widths, widths) ? "primary" : "subtle"
                          }
                          onClick={() => setWidths(p.widths)}
                          title={p.note}
                        >
                          {p.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="pb-controls__row">
                    <span className="pb-controls__label">hidden layers</span>
                    <div className="pb-controls__buttons">
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={removeLayer}
                        aria-label="Remove a hidden layer"
                      >
                        −
                      </Button>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={addLayer}
                        aria-label="Add a hidden layer"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {kind === "dense" ? (
              <>
                <div className="pb-fig">
                  <NetworkFigure
                    widths={widths}
                    net={realNet}
                    names={widths.map((_, i) =>
                      i === 0
                        ? "input"
                        : i === widths.length - 1
                          ? "output"
                          : `hidden ${i}`,
                    )}
                    min={MIN_W}
                    max={MAX_W}
                    onChange={setWidth}
                  />
                </div>
              </>
            ) : (
              <div className="pb-fig">
                <ConvFigure
                  layers={
                    convModel === "digits" ? DIGIT_CNN.layers : RESNET50.layers
                  }
                  gaps={convModel === "digits" ? cnnGaps : RESNET50.gaps}
                />
              </div>
            )}

            {((kind === "dense" && realNet) ||
              (kind === "conv" && convModel === "digits" && cnnRaw)) && (
              <p className="pb-legend">
                <span
                  className="pb-swatch"
                  style={{ background: "var(--ml-learned-pos)" }}
                />
                <span
                  className="pb-swatch"
                  style={{ background: "var(--ml-learned-neg)" }}
                />
                a trained weight, above or below zero
              </p>
            )}
            <p className="pb-note">
              Total parameters in this model:{" "}
              <b className="pb-mono">
                {(kind === "dense"
                  ? count.total
                  : convModel === "digits"
                    ? DIGIT_CNN_TOTAL
                    : RESNET50_TOTAL
                ).toLocaleString()}
              </b>
            </p>
          </Card>

          <BiggerPanel picked={picked} onPick={setPicked} />
          <SplitPanel picked={picked} />

          <Rounding
            precision={precision}
            onPrecision={setPrecision}
            {...assets}
          />

          {/* ── The ladder ── */}
          <Card className="pb-panel" padding="md">
            <h2 className="pb-h2">Your models versus production</h2>
            <p className="pb-sub">
              Models are displayed in log space, so each step is not +1 but x10.
            </p>
            <Ladder
              yours={[
                {
                  name: "Your linear regression",
                  params: countLinear(features),
                },
                {
                  name: "Your XGBoost",
                  params: countBoosted(trees, depth),
                },
                { name: "Your neural network", params: count.total },
              ]}
              precision={precision}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Quantization and distillation: making a model smaller, on the real digit
 *  recognizer. Both need its weights and the shipped digits. */
function Rounding({
  precision,
  onPrecision,
  raw,
  bank,
  failed,
}: {
  precision: Precision;
  onPrecision: (p: Precision) => void;
  raw: RawWeights | null;
  bank: DigitBank | null;
  failed: boolean;
}) {
  const [pick, setPick] = useState(DISTILL_DIGITS[0]!);
  const [asks, setAsks] = useState(1);
  const [round, setRound] = useState(0);

  const nets = useMemo(
    () =>
      raw
        ? Object.fromEntries(
            PRECISIONS.map((p) => [p.bits, roundNet(raw, p.bits)]),
          )
        : null,
    [raw],
  );
  const scores = useMemo(
    () =>
      nets && bank
        ? Object.fromEntries(
            PRECISIONS.map((p) => [p.bits, score(nets[p.bits]!, bank)]),
          )
        : null,
    [nets, bank],
  );
  const bounds = useMemo(() => {
    if (!raw) return [];
    const net = loadNet(raw);
    return Array.from({ length: net.H1 }, (_, n) => {
      let m = 0;
      for (let p = 0; p < net.IN; p++)
        m = Math.max(m, Math.abs(net.W1[n * net.IN + p]!));
      return m || 1;
    });
  }, [raw]);

  const teacher = nets?.[32];
  const probs = teacher && bank ? answer(teacher, bank.inputs[pick]!) : null;
  const label = bank?.labels[pick] ?? 0;
  const tally = useMemo(
    () => (probs ? draw(probs, asks, pick * 7919 + asks * 31 + round) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [probs?.join(","), asks, pick, round],
  );
  const g3 = MODELS.find((m) => m.name === "GPT-3")!.split;
  const gpt3Params = g3.table + g3.attention + g3.connected + g3.other;

  return (
    <>
      {/* ── Quantization ── */}
      <Card className="pb-panel" padding="md">
        <h2 className="pb-h2">Quantization</h2>
        <p className="pb-sub">
          One popular method for making models more efficient is quantization.
          This is storing each parameter with fewer significant digits. See{" "}
          <Link to="/examples/mnist-mlp">the digit recognizer</Link>.{" "}
        </p>

        <div className="pb-qtable" role="listbox" aria-label="Precision">
          <div className="pb-qtable__head">
            <span>each number</span>
            <span>digit recognizer</span>
            <span>GPT-3</span>
            <span>digits read correctly</span>
          </div>
          {PRECISIONS.map((p) => {
            const on = p.bits === precision.bits;
            const right = scores?.[p.bits];
            return (
              <div
                key={p.bits}
                className={`pb-qtable__row${on ? " pb-qtable__row--on" : ""}`}
                role="option"
                aria-selected={on}
                tabIndex={0}
                onClick={() => onPrecision(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPrecision(p);
                  }
                }}
              >
                <span className="pb-qtable__name">{p.name}</span>
                <span className="pb-mono">
                  {formatBytes(bytesFor(TEACHER_PARAMS, p.bits))}
                </span>
                <span className="pb-mono">
                  {formatBytes(bytesFor(gpt3Params, p.bits))}
                </span>
                <span className="pb-qtable__score">
                  <span className="pb-bar">
                    <span
                      className="pb-bar__fill"
                      style={{
                        width:
                          right != null && bank
                            ? `${(right / bank.count) * 100}%`
                            : 0,
                      }}
                    />
                  </span>
                  <span className="pb-mono">
                    {right != null && bank ? `${right} of ${bank.count}` : "…"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {nets && bounds.length > 0 && (
          <>
            <h3 className="pb-h3">
              The "receptive fields" of six neurons at {precision.name}
            </h3>
            <div className="pb-fig">
              <WeightPictures net={nets[precision.bits]!} bounds={bounds} />
            </div>
          </>
        )}
        {failed && (
          <p className="pb-note">The digit recognizer could not be loaded.</p>
        )}
      </Card>

      {/* ── Distillation ── */}
      <Card className="pb-panel" padding="md">
        <h2 className="pb-h2">Distillation</h2>
        <p className="pb-sub">
          AI companies are making their models more efficient-- using fewer
          parameters-- by training one model from another. This can even be done
          competitively, with one model trained from another company's model.
          <br />
          <br />
          The key is that if a model is trained not against a single answer, but
          rather against the relative probabilities of each possible answer,
          then it can perform at nearly the same level more efficiently. This
          can be done by asking the same question multiple times and using the
          different answers to estimate the underlying probabilities.
        </p>
        {bank && probs ? (
          <>
            <div className="pb-controls">
              <div className="pb-controls__row">
                <span className="pb-controls__label">digit</span>
                <div className="pb-controls__buttons">
                  {DISTILL_DIGITS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={`pb-thumb${i === pick ? " pb-thumb--on" : ""}`}
                      onClick={() => setPick(i)}
                      aria-pressed={i === pick}
                      aria-label={`A handwritten ${bank.labels[i]}`}
                    >
                      <DigitThumb pixels={bank.small[i]!} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="pb-controls__row">
                <span className="pb-controls__label">ask it</span>
                <div className="pb-controls__buttons">
                  {ASKS.map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={n === asks ? "primary" : "subtle"}
                      onClick={() => setAsks(n)}
                    >
                      {n === 1 ? "once" : `${n.toLocaleString()} times`}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => setRound((r) => r + 1)}
                  >
                    Ask again
                  </Button>
                </div>
              </div>
            </div>
            <div className="pb-distill">
              <div className="pb-distill__side">
                <span className="pb-kicker">the answer key</span>
                <DigitBars
                  probs={Array.from({ length: 10 }, (_, d) =>
                    d === label ? 1 : 0,
                  )}
                  kind="key"
                />
                <span className="pb-readout__sub">It is a {label}.</span>
              </div>
              <div className="pb-distill__side">
                <span className="pb-kicker">
                  the teacher · {TEACHER_PARAMS.toLocaleString()} parameters
                </span>
                <DigitBars probs={probs} kind="teacher" />
                <span className="pb-readout__sub">{hedge(probs)}</span>
              </div>
              <div className="pb-distill__side">
                <span className="pb-kicker">
                  its replies only ·{" "}
                  {asks === 1
                    ? "asked once"
                    : `asked ${asks.toLocaleString()} times`}
                </span>
                <DigitBars probs={tally} kind="teacher" />
                <span className="pb-readout__sub">
                  {tallyLine(tally, asks)}
                </span>
              </div>
            </div>
          </>
        ) : (
          !failed && <p className="pb-note">Loading the digits…</p>
        )}
      </Card>
    </>
  );
}

const ASKS = [1, 10, 100, 1000];

/** Ask the teacher `n` times: each reply is one digit drawn from its odds.
 *  Returns the share of replies for each digit. Seeded, so a given digit and
 *  count replay until "Ask again". */
function draw(p: number[], n: number, seed: number): number[] {
  let t = seed >>> 0 || 1;
  const rand = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const counts = new Array(p.length).fill(0);
  for (let k = 0; k < n; k++) {
    let u = rand();
    let d = 0;
    while (d < p.length - 1 && u >= p[d]!) u -= p[d++]!;
    counts[d]++;
  }
  return counts.map((c) => c / n);
}

function tallyLine(t: number[], n: number): string {
  const said = t
    .map((v, d) => [Math.round(v * n), d] as const)
    .filter(([c]) => c > 0)
    .sort((a, b) => b[0] - a[0]);
  if (n === 1) return `It said ${said[0]?.[1]}.`;
  return (
    said
      .slice(0, 3)
      .map(([c, d]) => `${c.toLocaleString()} said ${d}`)
      .join(", ") + "."
  );
}

/** The teacher's answer, read aloud: its top guess and runner-up. */
function hedge(p: number[]): string {
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const [a, b] = [order[0]!, order[1]!];
  if (b[0] < 0.05) return `Almost certainly a ${a[1]}.`;
  return `Probably a ${a[1]}, but a bit like a ${b[1]}.`;
}

/** The log-scale ladder from three parameters to trillions. */
function Ladder({
  yours,
  precision,
}: {
  yours: Array<{ name: string; params: number }>;
  precision: Precision;
}) {
  const all = [
    ...REFERENCES.map((r) => ({ ...r, current: false })),
    ...yours.map((y) => ({
      ...y,
      note: "built above",
      ours: true,
      current: true,
    })),
  ].sort((a, b) => a.params - b.params);

  const hi = Math.log10(Math.max(...all.map((a) => a.params)));

  return (
    <div className="pb-ladder">
      {all.map((r) => {
        const t = Math.log10(Math.max(r.params, 1)) / hi;
        return (
          <div
            className={`pb-rung${r.current ? " pb-rung--current" : ""}${r.ours ? " pb-rung--ours" : ""}`}
            key={r.name}
            title={r.note}
          >
            <span className="pb-rung__name">{r.name}</span>
            <span className="pb-rung__track">
              <span
                className="pb-rung__fill"
                style={{ width: `${Math.max(1, t * 100)}%` }}
              />
            </span>
            <span className="pb-rung__params">{formatParams(r.params)}</span>
            <span className="pb-rung__bytes">
              {formatBytes(bytesFor(r.params, precision.bits))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
