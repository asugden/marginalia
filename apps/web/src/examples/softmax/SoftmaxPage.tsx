// The softmax example (/examples/softmax).
//
// One live sandbox, not a slideshow. Everything is visible at once and
// everything reacts continuously: drag a logit and all four stages re-shape
// together; move temperature and the same bars re-shape in place.
//
// An earlier draft of this page was a six-step walkthrough. It was wrong for
// this subject: softmax has one figure, and five of the six steps showed that
// identical figure while the prose did all the work. Where a lesson has no
// changing figure to justify a step, it should not have steps — see the
// naive-bayes example, which is a single live sandbox for the same reason.
//
// Softmax is load-bearing in two other examples here — attention turns match
// scores into weights with it, word2vec turns vocabulary scores into a
// predicted word with it — so it gets its own page and they link to it.
//
// The confusion it targets: students read "softmax turns numbers into
// probabilities" and conclude it must be doing something statistical. It is
// exponentiate-then-divide, and the only reason the output looks like a
// distribution is that dividing by the total forces it to sum to 1.
//
// The page shows that rather than saying it: the SAME four bars appear at
// every stage side by side — raw output, divided by the temperature,
// exponentiated, normalized — so the student can watch one drag travel the
// whole pipeline.
//
// An earlier version carried a fifth column: a naive divide-by-the-total that
// visibly broke (negative bars, or blowing off the chart). It was cut. The
// failure it staged is real but it is a detour — the page's subject is what
// softmax *does*, and a column showing what something else does costs a
// quarter of the figure's width to make a point the eˣ column already carries.
//
// The first column is titled "Model output" rather than "Logits" because at
// that point in the pipeline that is all it is. Those numbers earn the name
// "logit" from the softmax three columns to its right, not from how the model
// computed them; the subtitle and caption say so, because the word is what the
// student will meet everywhere else.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./softmax.css";
import { softmax } from "./softmax.js";

// Four options. The labels carry no arithmetic meaning of their own — the
// lesson is about the numbers, and concrete words stop students reading the
// indices as quantities.
const LABELS = ["cat", "dog", "bird", "fish"];

// Each preset exists to make something specific visible — a claim in one of
// the four captions that the student can check by pressing a button.
const PRESETS: Array<{ name: string; logits: number[]; note: string }> = [
  {
    name: "Confident",
    logits: [2.6, 0.7, 0.1, -0.6],
    note: "Single winner",
  },
  {
    name: "Torn",
    logits: [1.8, 1.7, 0.2, 0.0],
    note: "Nearly 50/50",
  },
  {
    name: "No idea",
    logits: [0.5, 0.5, 0.5, 0.5],
    note: "All equal",
  },
];

const LOGIT_MIN = -3;
const LOGIT_MAX = 4;
const TRACK_H = 190;

/** Where a value sits on the raw-score axis, as a fraction of the track.
 *
 *  Columns 1 and 2 share this so that ÷ T is legible as a *movement*. Scaling
 *  a column to its own largest value, which is what every other column here
 *  does, would hide the whole effect: dividing every score by T and then
 *  rescaling by the new maximum gives back the identical picture. Against a
 *  fixed axis the bars visibly stretch below T = 1 and collapse above it. */
const logitFrac = (v: number) =>
  (Math.max(LOGIT_MIN, Math.min(LOGIT_MAX, v)) - LOGIT_MIN) /
  (LOGIT_MAX - LOGIT_MIN);
const ZERO_FRAC = logitFrac(0);

export function SoftmaxPage() {
  const [logits, setLogits] = useState<number[]>(PRESETS[0]!.logits);
  const [temperature, setTemperature] = useState(1);

  const T = temperature;
  const steps = useMemo(() => softmax(logits, T), [logits, T]);

  const setLogit = useCallback((i: number, v: number) => {
    setLogits((prev) => {
      const next = prev.slice();
      next[i] = Math.max(LOGIT_MIN, Math.min(LOGIT_MAX, v));
      return next;
    });
  }, []);

  // Adding the same constant to every score leaves softmax untouched. Clamping
  // each bar independently would break that — once one bar tops out the others
  // keep moving, the shift is no longer uniform, and the figure appears to
  // contradict the invariant it exists to demonstrate. So the shift is refused
  // outright when there is not room for all four, and the button that cannot
  // run is disabled rather than quietly doing something else.
  const shiftRoom = useMemo(
    () => ({
      up: Math.min(...logits.map((z) => LOGIT_MAX - z)),
      down: Math.min(...logits.map((z) => z - LOGIT_MIN)),
    }),
    [logits],
  );

  const shiftAll = useCallback((d: number) => {
    setLogits((prev) => {
      const room =
        d > 0
          ? Math.min(...prev.map((z) => LOGIT_MAX - z))
          : Math.min(...prev.map((z) => z - LOGIT_MIN));
      return room + 1e-9 < Math.abs(d) ? prev : prev.map((z) => z + d);
    });
  }, []);

  // The single number the temperature slider moves. Deliberately the winner's
  // probability rather than an entropy: it is already on screen as the tallest
  // bar, it needs no vocabulary the page has not introduced, and it is the
  // quantity that actually governs sampling — how often the top choice wins.
  const topIndex = steps.probs.reduce(
    (best, p, i) => (p > (steps.probs[best] ?? -1) ? i : best),
    0,
  );
  const topProb = steps.probs[topIndex] ?? 0;
  const probTotal = steps.probs.reduce((a, b) => a + b, 0);
  const logitTotal = logits.reduce((a, b) => a + b, 0);
  const tempActive = Math.abs(T - 1) > 0.01;

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
        <div className="mnist-page mnist-page--wide">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Softmax</h1>
            <p className="mnist-lede">
              The Softmax function converts arbitrary outputs to probabilities.
              A set of probabilities mathematically must all be between 0 and 1
              and must sum to 1. Nothing can happen 101% of the time. The
              softmax function is used within transformer{" "}
              <Link to="/examples/attention">attention</Link> heads, at the
              output of categorical classifiers, in{" "}
              <Link to="/examples/word2vec">word2vec</Link>, and within every
              large language model.
              <br />
              <br />
              Turning up the temperature makes random options more likely, and
              it's key to fine-tuning an LLM. Drag the slider to see the effect.
            </p>
          </div>

          {/* Temperature sits above the figure it reshapes, so a drag and its
              effect are in view together. */}
          <Card className="sm-temp" padding="md">
            <div className="sm-temp__main">
              <label htmlFor="sm-temperature">
                <span className="sm-temp__name">Temperature (T)</span>
                <span className="sm-temp__value">{T.toFixed(2)}</span>
              </label>
              <input
                id="sm-temperature"
                type="range"
                min={0.1}
                max={5}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
              <div className="sm-temp__scale">
                <span>0.1 — near-certain</span>
                <span>1 — as trained</span>
                <span>5 — near-uniform</span>
              </div>
            </div>
            <div className="sm-temp__side">
              <span className="sm-temp__statlabel">top</span>
              <span className="sm-temp__stat">{topProb.toFixed(2)}</span>
              <span className="sm-temp__statsub">{LABELS[topIndex]}</span>
            </div>
          </Card>

          {/* The stages, side by side, all live. */}
          <div className="sm-stages">
            <StageColumn
              title="Model output"
              step={1}
              subtitle={"raw scores"}
              interactive
              caption={
                <>
                  Click on any bar to drag it, or click a "Try" option below.
                  Note that they total{" "}
                  <b className="sm-mono">{logitTotal.toFixed(2)}</b>, not 1. The
                  outputs of a model can be any values.
                </>
              }
            >
              <LogitBars labels={LABELS} logits={logits} onChange={setLogit} />
            </StageColumn>

            <StageColumn
              title="÷ T"
              step={2}
              subtitle="divide by the temperature"
              caption={
                tempActive ? (
                  <>
                    Every score is divided by{" "}
                    <b className="sm-mono">{T.toFixed(2)}</b>. Increasing T
                    makes the output "more random".
                  </>
                ) : (
                  <>
                    At <b className="sm-mono">T = 1</b> this column is a copy of
                    the one on its left. Move the slider and watch the gaps open
                    or close.
                  </>
                )
              }
            >
              <ValueBars
                labels={LABELS}
                values={steps.scaled}
                signed
                onLogitAxis
                format={(v) => v.toFixed(2)}
              />
            </StageColumn>

            <StageColumn
              title={
                <>
                  e<sup>x</sup>
                </>
              }
              step={3}
              subtitle="exponentiate"
              caption={
                <>
                  e<sup>x</sup> is guaranteed to be positive, but the total may
                  be greater than 1 (e.g.
                  <b className="sm-mono">{steps.sum.toFixed(3)}</b>).
                </>
              }
            >
              <ValueBars
                labels={LABELS}
                values={steps.exps}
                format={(v) => v.toFixed(2)}
              />
            </StageColumn>

            <StageColumn
              title="÷ sum"
              step={4}
              subtitle="normalize"
              tone="good"
              caption={
                <>
                  This converts the positive values into actual probabilities,
                  summing to 1. This is the softmax.
                </>
              }
            >
              <ValueBars
                labels={LABELS}
                values={steps.probs}
                asPercent
                format={(v) => `${(v * 100).toFixed(1)}%`}
              />
            </StageColumn>
          </div>

          {/* Every control here produces a visible change in the figure. */}
          <Card className="sm-try" padding="md">
            <div className="sm-try__group">
              <span className="sm-try__label">Try</span>
              {PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  variant={
                    p.logits.every(
                      (v, i) => Math.abs(v - (logits[i] ?? 0)) < 0.001,
                    )
                      ? "primary"
                      : "subtle"
                  }
                  onClick={() => setLogits(p.logits)}
                  title={p.note}
                >
                  {p.name}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLogits(PRESETS[0]!.logits);
                  setTemperature(1);
                }}
                title="back to the first preset, at T = 1"
              >
                Reset all
              </Button>
            </div>

            <div className="sm-try__group">
              <span className="sm-try__label">Adjust every raw score</span>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => shiftAll(1)}
                disabled={shiftRoom.up + 1e-9 < 1}
              >
                +1
              </Button>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => shiftAll(-1)}
                disabled={shiftRoom.down + 1e-9 < 1}
              >
                −1
              </Button>
              <span className="sm-try__hint">
                Notice that the softmax is not affected by shifts.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** One stage of the pipeline: a numbered column with a figure and a caption
 *  that changes with the data rather than describing it in the abstract. */
function StageColumn({
  title,
  step,
  subtitle,
  caption,
  children,
  tone = "neutral",
  interactive = false,
}: {
  title: React.ReactNode;
  step: number;
  subtitle: string;
  caption: React.ReactNode;
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad";
  interactive?: boolean;
}) {
  return (
    <Card
      className={`sm-stage sm-stage--${tone}${interactive ? " sm-stage--interactive" : ""}`}
      padding="md"
    >
      <div className="sm-stage__head">
        <span className="sm-stage__step">{step}</span>
        <div>
          <h2 className="sm-stage__title">{title}</h2>
          <p className="sm-stage__subtitle">{subtitle}</p>
        </div>
      </div>
      {children}
      <p className="sm-stage__caption">{caption}</p>
    </Card>
  );
}

/** The draggable logit bars. Signed: bars grow up or down from a zero line,
 *  because logits are signed and hiding that would undercut the lesson.
 *
 *  When temperature is not 1, the scaled value is drawn as a ghost bar behind
 *  the real one — so "divide by T" is a visible movement rather than a number
 *  quietly changing in a table. */
function LogitBars({
  labels,
  logits,
  onChange,
}: {
  labels: string[];
  logits: number[];
  onChange: (i: number, v: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<number | null>(null);

  const valueFromEvent = useCallback((clientY: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const frac = 1 - (clientY - r.top) / r.height;
    return LOGIT_MIN + frac * (LOGIT_MAX - LOGIT_MIN);
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current === null) return;
      e.preventDefault();
      onChange(dragging.current, valueFromEvent(e.clientY));
    };
    const up = () => {
      dragging.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onChange, valueFromEvent]);

  const zeroFrac = ZERO_FRAC;
  const span = (v: number) => {
    const frac = logitFrac(v);
    return {
      bottom: Math.min(frac, zeroFrac),
      height: Math.abs(frac - zeroFrac),
    };
  };

  return (
    <div className="sm-bars">
      <div className="sm-bars__track" ref={ref} style={{ height: TRACK_H }}>
        <div
          className="sm-bars__zero"
          style={{ bottom: `${zeroFrac * 100}%` }}
          aria-hidden="true"
        >
          <span>0</span>
        </div>
        {logits.map((z, i) => {
          const real = span(z);
          return (
            <div key={labels[i]!} className="sm-bars__col">
              <button
                type="button"
                className={`sm-bars__bar${z < 0 ? " sm-bars__bar--neg" : ""}`}
                style={{
                  bottom: `${real.bottom * 100}%`,
                  height: `${real.height * 100}%`,
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  dragging.current = i;
                  onChange(i, valueFromEvent(e.clientY));
                }}
                onKeyDown={(e) => {
                  const d = e.shiftKey ? 0.5 : 0.1;
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    onChange(i, z + d);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    onChange(i, z - d);
                  }
                }}
                aria-label={`${labels[i]!} logit`}
                aria-valuenow={Number(z.toFixed(2))}
                aria-valuemin={LOGIT_MIN}
                aria-valuemax={LOGIT_MAX}
                role="slider"
                tabIndex={0}
              >
                <span className="sm-bars__grip" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="sm-bars__labels">
        {labels.map((l, i) => (
          <div key={l} className="sm-bars__label">
            <span className="sm-bars__name">{l}</span>
            <span className="sm-mono sm-bars__num">
              {logits[i]!.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <p className="sm-bars__hint">drag a bar, or focus one and use ↑ / ↓</p>
    </div>
  );
}

/** Read-only bars for a computed stage. Shares the geometry of the logit bars
 *  so the columns line up and can be compared across the row.
 *
 *  Values beyond the track are clamped but marked, so a column that runs off
 *  the scale reads as "off the chart" rather than silently pinning at the
 *  top — at low temperatures the divided scores get large. */
function ValueBars({
  labels,
  values,
  format,
  signed = false,
  asPercent = false,
  onLogitAxis = false,
}: {
  labels: string[];
  values: number[];
  format: (v: number) => string;
  signed?: boolean;
  asPercent?: boolean;
  /** Draw against the raw-score axis instead of this column's own maximum,
   *  so the column lines up with the draggable bars and a change of scale
   *  reads as a change of height. See `logitFrac`. */
  onLogitAxis?: boolean;
}) {
  // Scale against the largest magnitude present so a column always fills its
  // track; the numbers underneath carry the absolute value. Probabilities use
  // a fixed 0..1 scale so the bars mean the same thing at every temperature.
  let bound = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const a = Math.abs(v);
    if (a > bound) bound = a;
  }
  if (asPercent) bound = 1;
  bound = bound || 1;

  // Anything more than 4x the next-largest magnitude is "off the chart"; we
  // clamp it and flag it rather than letting one bar squash the others flat.
  const CLAMP = 1;
  const zeroFrac = onLogitAxis ? ZERO_FRAC : signed ? 0.5 : 0;

  return (
    <div className="sm-bars">
      <div className="sm-bars__track" style={{ height: TRACK_H }}>
        {signed && (
          <div
            className="sm-bars__zero"
            style={{ bottom: `${zeroFrac * 100}%` }}
            aria-hidden="true"
          >
            <span>0</span>
          </div>
        )}
        {values.map((v, i) => {
          const finite = Number.isFinite(v);
          const norm = finite ? v / bound : 0;
          const clamped = Math.max(-CLAMP, Math.min(CLAMP, norm));
          const over = onLogitAxis
            ? finite && (v > LOGIT_MAX + 1e-9 || v < LOGIT_MIN - 1e-9)
            : finite && Math.abs(norm) > CLAMP + 0.001;
          const frac = onLogitAxis
            ? logitFrac(finite ? v : 0)
            : signed
              ? zeroFrac + clamped / 2
              : Math.abs(clamped);
          const bottom = signed ? Math.min(frac, zeroFrac) : 0;
          const height = signed ? Math.abs(frac - zeroFrac) : Math.min(1, frac);
          return (
            <div key={labels[i]!} className="sm-bars__col">
              <span
                className={`sm-bars__bar sm-bars__bar--static${
                  finite && v < 0 ? " sm-bars__bar--neg" : ""
                }${!finite || over ? " sm-bars__bar--over" : ""}`}
                style={{
                  bottom: `${bottom * 100}%`,
                  height: `${Math.max(height, 0.005) * 100}%`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="sm-bars__labels">
        {labels.map((l, i) => (
          <div key={l} className="sm-bars__label">
            <span className="sm-bars__name">{l}</span>
            <span
              className={`sm-mono sm-bars__num${
                Number.isFinite(values[i]!) && values[i]! < 0 ? " sm-bad" : ""
              }`}
            >
              {format(values[i]!)}
            </span>
          </div>
        ))}
      </div>
      {/* Keeps the four columns' baselines aligned with the draggable one. */}
      <p className="sm-bars__hint" aria-hidden="true">
        &nbsp;
      </p>
    </div>
  );
}
