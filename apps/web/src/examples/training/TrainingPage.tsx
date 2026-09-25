// The training example (/examples/training).
//
// The only page in the gallery that ships no weights. It ships 240 digits and
// a random number generator, and trains a real autoencoder in the browser
// while the student watches — because the lesson is that the parameters start
// as noise and become something, and a replay of a run recorded offline would
// not be that lesson.
//
// The arc:
//
//   1. Random initialization. Before anything is learned, the model is noise
//      and the reconstruction is noise. Re-roll the dice and watch a different
//      noise field appear — then, later, watch different seeds converge to
//      similar results, which is the useful thing to know about initialization.
//   2. How wrong, and which way. Input, output, and the difference between
//      them as a red/blue picture. This is the error signal, and it is a
//      picture rather than a number, which is why this page uses an
//      autoencoder rather than a classifier.
//   3. Step. Every weight gets nudged. Watch the reconstruction sharpen and
//      the error image fade.
//   4. What the parameters became. The hidden units' incoming weights, drawn
//      as images: noise at first, strokes and blobs later. Nobody labelled a
//      stroke; the task did.
//
// On backpropagation: the gradients are exact, but the page never says "chain
// rule". It says each weight gets a number telling it which way to move. That
// is what a gradient is, and it is the honest half that fits here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Switch, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/controls.css";
import "../shared/figure.css";
import "./training.css";
import {
  evaluate,
  featureImage,
  forward,
  initModel,
  loadDigits,
  paramCount,
  pixelMeans,
  step,
  type DigitSet,
  type Model,
  type RawDigits,
} from "./autoencoder.js";
import { DigitGrid } from "./DigitGrid.js";

const DIGITS_URL = "/examples/training/digits.json";

const HIDDEN = 16;
const BATCH = 16;
// Measured from the average-pixel start, on a fixed 64 digits: 1 falls
// steadily from 0.053 to 0.018 over 300 steps; 12 and up rattle or climb.
// Both are worth seeing, so the page exposes the knob rather than hiding it.
const DEFAULT_LR = 1;
/** The error is measured on the same 64 digits every time, so the curve
 *  shows the model improving rather than which digits the last step used. */
const EVAL_COUNT = 64;
const LOSS_HISTORY = 160;
/** Slow is the default: ten steps a second, so the reconstruction visibly
 *  sharpens and the curve bends rather than dropping to its floor in the time
 *  it takes to look at it. Fast is several steps a frame, for converging a
 *  demo in a couple of seconds. */
const SLOW_MS_PER_STEP = 100;
const FAST_STEPS_PER_FRAME = 4;

export function TrainingPage() {
  const [digits, setDigits] = useState<DigitSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [seed, setSeed] = useState(1234);
  const [lr, setLr] = useState(DEFAULT_LR);
  const [model, setModel] = useState<Model | null>(null);
  const [steps, setSteps] = useState(0);
  const [loss, setLoss] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState(0);
  const [fast, setFast] = useState(false);

  // The training loop runs off refs so the animation frame does not restart on
  // every React render.
  const modelRef = useRef<Model | null>(null);
  const stepsRef = useRef(0);
  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(DIGITS_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`digits ${r.status}`);
        return r.json() as Promise<RawDigits>;
      })
      .then((raw) => setDigits(loadDigits(raw)))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  // Fresh weights whenever the seed changes (or the data first arrives).
  const reset = useCallback(
    (nextSeed: number) => {
      if (!digits) return;
      const m = initModel(digits.size, HIDDEN, nextSeed, pixelMeans(digits));
      modelRef.current = m;
      stepsRef.current = 0;
      setModel(m);
      setSteps(0);
      setHistory([]);
      setLoss(evaluate(m, digits.images, Math.min(EVAL_COUNT, digits.count)));
    },
    [digits],
  );

  useEffect(() => {
    if (digits) reset(seed);
  }, [digits, seed, reset]);

  /** Run a batch of gradient steps and publish the result. */
  const runSteps = useCallback(
    (n: number) => {
      const m = modelRef.current;
      if (!m || !digits) return;
      for (let s = 0; s < n; s++) {
        const idx: number[] = [];
        for (let k = 0; k < BATCH; k++) {
          idx.push((stepsRef.current * BATCH + k) % digits.count);
        }
        step(m, digits.images, idx, lr);
        stepsRef.current += 1;
      }
      const last = evaluate(m, digits.images, Math.min(EVAL_COUNT, digits.count));
      setSteps(stepsRef.current);
      setLoss(last);
      setHistory((h) => [...h, last].slice(-LOSS_HISTORY));
      // A new object identity so the figures re-render from the mutated
      // weights; the arrays themselves are updated in place for speed.
      setModel({ ...m });
    },
    [digits, lr],
  );

  // The animation loop. Several steps per frame so progress is visible without
  // the page feeling like it is crawling.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let last = performance.now();
    const tick = (now: number) => {
      if (cancelled || !runningRef.current) return;
      if (fast) {
        runSteps(FAST_STEPS_PER_FRAME);
      } else if (now - last >= SLOW_MS_PER_STEP) {
        last = now;
        runSteps(1);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [running, runSteps, fast]);

  const toggleRun = useCallback(() => {
    setRunning((r) => {
      runningRef.current = !r;
      return !r;
    });
  }, []);

  const pass = useMemo(() => {
    if (!model || !digits) return null;
    const i = shown % digits.count;
    return forward(
      model,
      digits.images.subarray(i * digits.size, (i + 1) * digits.size),
    );
  }, [model, digits, shown]);

  const features = useMemo(() => {
    if (!model) return [];
    return Array.from({ length: HIDDEN }, (_, h) => featureImage(model, h));
  }, [model]);

  const params = model ? paramCount(model) : 0;

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
            <h1>Training</h1>
            <p className="mnist-lede">
              Every other example here ships a model that already works. This
              one ships <i>nothing but data</i> and a random number generator,
              and learns while you watch. Press step and {params.toLocaleString()}{" "}
              parameters — which start as random numbers — get nudged toward
              numbers that reproduce a handwritten digit. Nothing is
              pre-recorded; the arithmetic happens in your browser.
            </p>
          </div>

          {loadError && (
            <p className="mnist-error">Couldn't load the digits ({loadError}).</p>
          )}
          {!digits && !loadError && (
            <div className="mnist-loading">Loading digits…</div>
          )}

          {digits && model && pass && (
            <>
              {/* ── The pinned bar: it drives every panel below ── */}
              <div className="ex-followed">
              <div className="ex-controls">
                <div className="ex-controls__row tr-bar">
                  <span className="ex-controls__label">Training</span>
                  <div className="ex-controls__buttons">
                    <Button size="sm" variant="primary" onClick={toggleRun}>
                      {running ? "Pause" : "Run"}
                    </Button>
                    <Button size="sm" variant="subtle" onClick={() => runSteps(1)} disabled={running}>
                      Step ×1
                    </Button>
                    <Button size="sm" variant="subtle" onClick={() => runSteps(25)} disabled={running}>
                      Step ×25
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => {
                        setRunning(false);
                        runningRef.current = false;
                        setSeed((s) => s + 1);
                      }}
                    >
                      Re-roll the dice
                    </Button>
                  </div>
                  <div className="tr-bar__stats">
                    <div className="tr-stat">
                      <span className="tr-stat__label">steps</span>
                      <span className="tr-stat__val">{steps}</span>
                    </div>
                    <div className="tr-stat tr-stat--error">
                      <span className="tr-stat__label">error</span>
                      <span className="tr-stat__val">{loss !== null ? loss.toFixed(4) : "—"}</span>
                    </div>
                    <div className="tr-stat">
                      <span className="tr-stat__label">parameters</span>
                      <span className="tr-stat__val">{params.toLocaleString()}</span>
                    </div>
                  </div>
                  <Switch label="Fast" checked={fast} onChange={(e) => setFast(e.target.checked)} />
                </div>
              </div>

              {/* ── Input, output, error ── */}
              <Card className="tr-panel" padding="md">
                <h2 className="tr-h2">
                  {steps === 0
                    ? "Before training: the weights are noise"
                    : "How wrong is it, and in which direction?"}
                </h2>
                <p className="tr-sub">
                  {steps === 0 ? (
                    <>
                      Nothing has been learned yet. The weights were filled with
                      random numbers and each output pixel starts at its average
                      brightness, so the model's attempt is a noisy smudge, the
                      same for every digit. Everything below happens by changing
                      those numbers — there is no other mechanism.
                    </>
                  ) : (
                    <>
                      The model's job is to reproduce its input. The third panel
                      is the difference between what it should have made and
                      what it did: <b className="tr-pos">red</b> where it put
                      too much ink, <b className="tr-neg">blue</b> where too
                      little. That picture is the error signal — every weight
                      gets a number derived from it, saying which way to move.
                    </>
                  )}
                </p>

                <div className="tr-triptych">
                  <DigitGrid
                    pixels={pass.input}
                    dim={digits.dim}
                    size={150}
                    label="input"
                    sublabel="what it should reproduce"
                  />
                  <span className="tr-arrow" aria-hidden="true">
                    →
                  </span>
                  <DigitGrid
                    pixels={pass.output}
                    dim={digits.dim}
                    size={150}
                    label="output"
                    sublabel={`its attempt, after ${steps} step${steps === 1 ? "" : "s"}`}
                  />
                  <span className="tr-arrow" aria-hidden="true">
                    =
                  </span>
                  <DigitGrid
                    pixels={pass.error}
                    dim={digits.dim}
                    kind="value"
                    size={150}
                    label="error"
                    sublabel="too much / too little"
                  />
                </div>

                <div className="tr-box">
                  <div className="ex-controls__row">
                    <span className="ex-controls__label">Digit</span>
                    <div className="ex-controls__buttons">
                      {Array.from({ length: 10 }, (_, d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant={digits.labels[shown % digits.count] === d ? "primary" : "subtle"}
                          onClick={() => {
                            const i = digits.labels.indexOf(d);
                            if (i >= 0) setShown(i);
                          }}
                        >
                          {d}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* ── The loss curve ── */}
              <Card className="tr-panel" padding="md">
                <h2 className="tr-h2">One number, going down</h2>
                <p className="tr-sub">
                  Square every value in that error picture, average them, and
                  you get a single number for how wrong the model is. Training
                  is nothing but the repeated attempt to make this number
                  smaller.
                </p>
                <LossCurve history={history} />
                <div className="tr-box">
                  <label className="tr-lr">
                    <span className="ex-controls__label">Step size</span>
                    <input
                      type="range"
                      min={0.5}
                      max={20}
                      step={0.5}
                      value={lr}
                      onChange={(e) => setLr(parseFloat(e.target.value))}
                    />
                    <span className="tr-lr__val">{lr.toFixed(1)}</span>
                    <span className="tr-lr__hint">
                      {lr < 0.75
                        ? "Small steps: slow but steady."
                        : lr <= 4
                          ? "A good pace."
                          : lr <= 10
                            ? "Getting jumpy."
                            : "Too big: it overshoots and thrashes."}
                    </span>
                  </label>
                </div>
                <p className="tr-note">
                  How far to move on each step is a real choice, and the wrong
                  one breaks training in both directions: too small and it
                  crawls, too large and it leaps past the answer and bounces.
                  Push the slider to 15 and press <b>Run</b> — the error stops
                  falling and starts rattling.
                </p>
              </Card>

              {/* ── What the parameters became ── */}
              <Card className="tr-panel" padding="md">
                <h2 className="tr-h2">What the numbers became</h2>
                <p className="tr-sub">
                  Each of the {HIDDEN} neurons in the middle layer has{" "}
                  {digits.size} incoming weights — one per pixel. Draw those
                  weights as an image and you can see what the neuron responds to.
                  At step 0 they are static. Train for a while and strokes,
                  curves and blobs appear, because those are the pieces that
                  recur across handwritten digits.
                </p>
                <div className="tr-features">
                  {features.map((f, h) => (
                    <DigitGrid
                      key={h}
                      pixels={f}
                      dim={digits.dim}
                      kind="learned"
                      size={62}
                      label={`neuron ${h + 1}`}
                    />
                  ))}
                </div>
                <p className="tr-note">
                  Nobody labelled a stroke. Nobody wrote down what a loop is.
                  The task — squeeze {digits.size} numbers through {HIDDEN} and
                  get them back — did all of it, exactly as the bottleneck does
                  in the{" "}
                  <Link to="/examples/word2vec">word embeddings</Link> example.
                  This is the same argument in a different medium.
                </p>
              </Card>
              </div>
            </>
          )}

          <footer className="mnist-foot">
            <p>
              A {digits?.size ?? 196} → {HIDDEN} → {digits?.size ?? 196}{" "}
              autoencoder with sigmoid activations, trained by gradient descent
              on {digits?.count ?? 240} handwritten digits, entirely in your
              browser. The gradients are exact. The page deliberately stops
              short of explaining where they come from — that each weight gets a
              number telling it which way to move is the true and useful half;
              the chain rule that produces those numbers is the next course.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/** The loss curve. Log-scaled, because the interesting progress happens across
 *  orders of magnitude and a linear axis hides everything after the first
 *  dozen steps. The error is computed and cannot go below zero, so the line
 *  takes the positive arm of the computed scale. */
function LossCurve({ history }: { history: number[] }) {
  const W = 980;
  const H = 150;
  const PAD = 8;

  if (history.length < 2) {
    return (
      <div className="tr-curve tr-curve--empty">
        <span className="fig-note">The curve starts with the first step.</span>
      </div>
    );
  }

  const lo = Math.min(...history);
  const hi = Math.max(...history);
  const logLo = Math.log10(Math.max(lo, 1e-5));
  const logHi = Math.log10(Math.max(hi, 1e-5));
  const span = logHi - logLo || 1;

  const pts = history.map((v, i) => {
    const x = PAD + (i / (history.length - 1)) * (W - PAD * 2);
    const t = (Math.log10(Math.max(v, 1e-5)) - logLo) / span;
    const y = PAD + (1 - t) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="tr-curve">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="training error over time">
        <polyline className="tr-curve__line" points={pts.join(" ")} />
      </svg>
      <div className="tr-curve__axis">
        <span className="fig-tick">{hi.toFixed(4)}</span>
        <span className="fig-label">error, log scale</span>
        <span className="fig-tick">{lo.toFixed(4)}</span>
      </div>
    </div>
  );
}
