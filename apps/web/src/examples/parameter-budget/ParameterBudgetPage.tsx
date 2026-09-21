// The parameter budget explorer (/examples/parameter-budget).
//
// One question, asked properly: how many numbers is a model, and where do they
// go? "Parameters" is the unit everyone quotes and almost nobody derives, so
// this page refuses to quote anything it can compute. Drag a layer wider and
// watch the arithmetic change, term by term.
//
// Three things it is built to make obvious:
//
//   1. The count is a shape fact. from x to weights, plus one bias per
//      destination neuron. That is the whole rule, and once a student has it
//      they can read any architecture diagram as a budget.
//   2. Middle layers are expensive. Widening a hidden layer costs on BOTH
//      sides, so the cost is quadratic where the ends are linear. This is the
//      thing that surprises people, and the per-layer bars show it happening.
//   3. Scale is physical. Parameters times bytes-per-parameter is memory, and
//      that is why a 405B model does not fit on a laptop. The ladder puts the
//      gallery's own models on the same axis as the published ones.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./parameter-budget.css";
import {
  PRECISIONS,
  REFERENCES,
  bytesFor,
  countDense,
  formatBytes,
  formatParams,
} from "./budget.js";

/** Presets that map onto models the student has already met in the gallery. */
const PRESETS: Array<{ name: string; widths: number[]; note: string }> = [
  {
    name: "Digit recognizer",
    widths: [400, 25, 25, 11],
    note: "the gallery's MNIST network",
  },
  {
    name: "Training autoencoder",
    widths: [196, 16, 196],
    note: "the one that trains live",
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

export function ParameterBudgetPage() {
  const [widths, setWidths] = useState<number[]>([400, 25, 25, 11]);
  const [precision, setPrecision] = useState(PRECISIONS[0]!);

  const count = useMemo(() => countDense(widths), [widths]);

  const setWidth = (i: number, v: number) =>
    setWidths((w) => {
      const next = w.slice();
      next[i] = Math.max(MIN_W, Math.min(MAX_W, v));
      return next;
    });

  const addLayer = () =>
    setWidths((w) =>
      w.length >= 7 ? w : [...w.slice(0, -1), w[w.length - 2] ?? 32, w[w.length - 1]!],
    );
  const removeLayer = () =>
    setWidths((w) => (w.length <= 2 ? w : [...w.slice(0, -2), w[w.length - 1]!]));

  const biggestLayer = Math.max(...count.layers.map((l) => l.total), 1);

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
            <h1>Counting Parameters</h1>
            <p className="mnist-lede">
              "A 405-billion-parameter model" is the unit everyone quotes and
              almost nobody derives. It is not a mystery: between two layers,
              every neuron connects to every neuron, so the count is a
              rectangle — and you can work it out from the picture. Drag the
              layers below and watch the arithmetic.
            </p>
          </div>

          {/* ── The architecture ── */}
          <Card className="pb-panel" padding="md">
            <div className="pb-head">
              <div>
                <h2 className="pb-h2">Your architecture</h2>
                <p className="pb-sub">
                  Each column is a layer; drag its handle to make it wider or
                  narrower. The lines between them are the weights, and there
                  are <b>from × to</b> of them.
                </p>
              </div>
              <div className="pb-total">
                <span className="pb-total__label">total parameters</span>
                <span className="pb-total__val">
                  {count.total.toLocaleString()}
                </span>
                <span className="pb-total__sub">
                  {formatBytes(bytesFor(count.total, precision.bytes))} at{" "}
                  {precision.name}
                </span>
              </div>
            </div>

            <ArchFigure widths={widths} onChange={setWidth} />

            <div className="pb-archctl">
              <div className="pb-archctl__group">
                <span className="pb-archctl__label">presets</span>
                {PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    size="sm"
                    variant={
                      p.widths.length === widths.length &&
                      p.widths.every((v, i) => v === widths[i])
                        ? "primary"
                        : "subtle"
                    }
                    onClick={() => setWidths(p.widths)}
                    title={p.note}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
              <div className="pb-archctl__group">
                <span className="pb-archctl__label">hidden layers</span>
                <Button size="sm" variant="subtle" onClick={removeLayer}>
                  −
                </Button>
                <Button size="sm" variant="subtle" onClick={addLayer}>
                  +
                </Button>
              </div>
            </div>
          </Card>

          {/* ── The arithmetic ── */}
          <Card className="pb-panel" padding="md">
            <h2 className="pb-h2">Where the numbers go</h2>
            <p className="pb-sub">
              One row per gap between layers. The rule never changes:{" "}
              <b>from × to</b> weights, plus one bias for each destination
              neuron.
            </p>

            <div className="pb-table">
              <div className="pb-table__head">
                <span>connection</span>
                <span>weights</span>
                <span>biases</span>
                <span>subtotal</span>
                <span>share</span>
              </div>
              {count.layers.map((l, i) => (
                <div className="pb-table__row" key={i}>
                  <span className="pb-table__conn">
                    {l.from} → {l.to}
                  </span>
                  <span className="pb-mono">
                    {l.from} × {l.to} ={" "}
                    <b>{l.weights.toLocaleString()}</b>
                  </span>
                  <span className="pb-mono">{l.biases}</span>
                  <span className="pb-mono pb-table__sub">
                    {l.total.toLocaleString()}
                  </span>
                  <span className="pb-table__bar">
                    <span
                      className="pb-table__fill"
                      style={{ width: `${(l.total / biggestLayer) * 100}%` }}
                    />
                  </span>
                </div>
              ))}
              <div className="pb-table__foot">
                <span>total</span>
                <span className="pb-mono">
                  {count.weights.toLocaleString()}
                </span>
                <span className="pb-mono">{count.biases.toLocaleString()}</span>
                <span className="pb-mono pb-table__sub">
                  {count.total.toLocaleString()}
                </span>
                <span />
              </div>
            </div>

            <p className="pb-note">
              Notice which row dominates. Weights outnumber biases by a factor
              of the layer width, so the biases are a rounding error — and a
              layer in the <i>middle</i> pays twice, once for the connections
              coming in and once for those going out. That is why widening a
              hidden layer costs so much more than widening an input or output
              layer, and why <b>Wide and shallow</b> above is so much more
              expensive than <b>Narrow and deep</b> despite doing less.
            </p>
          </Card>

          {/* ── Memory ── */}
          <Card className="pb-panel" padding="md">
            <h2 className="pb-h2">Parameters are physical</h2>
            <p className="pb-sub">
              A parameter is a number, and a number takes space. Multiply the
              count by the bytes per number and you get the memory the model
              needs just to exist — before it runs.
            </p>
            <div className="pb-precisions">
              {PRECISIONS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`pb-precision${
                    p.name === precision.name ? " pb-precision--on" : ""
                  }`}
                  onClick={() => setPrecision(p)}
                >
                  <span className="pb-precision__name">{p.name}</span>
                  <span className="pb-precision__size">
                    {formatBytes(bytesFor(count.total, p.bytes))}
                  </span>
                  <span className="pb-precision__note">{p.note}</span>
                </button>
              ))}
            </div>
            <p className="pb-note">
              This is why quantization matters commercially rather than
              academically: the same model at int8 instead of float32 is a
              quarter of the memory, which can be the difference between fitting
              on a phone and not fitting at all. The embedding tables in the{" "}
              <Link to="/examples/word2vec">word embeddings</Link> example are
              int8 for exactly this reason.
            </p>
          </Card>

          {/* ── The ladder ── */}
          <Card className="pb-panel" padding="md">
            <h2 className="pb-h2">How your model compares</h2>
            <p className="pb-sub">
              A log scale, because a linear one would make everything except the
              largest model invisible. Each step to the right is ten times more
              parameters.
            </p>
            <Ladder current={count.total} precision={precision} />
            <p className="pb-note">
              The gallery's own models are marked. The gap between them and a
              frontier model is roughly eight orders of magnitude — which is
              worth sitting with, because the <i>mechanism</i> is identical.
              Every one of those 405 billion numbers is doing what the 6,484 in
              the <Link to="/examples/training">training example</Link> do: it
              gets multiplied by something, and gradient descent nudged it there.
            </p>
          </Card>

          <footer className="mnist-foot">
            <p>
              Every count on this page is computed from layer widths, including
              the gallery's own models — the digit recognizer really is 10,961
              parameters and the autoencoder really is 6,484. Counts for
              published models are as reported by their authors. This page
              models fully-connected layers; convolutional and attention layers
              count differently (a convolution shares one small kernel across
              the whole image, which is exactly why it is cheaper), but the
              principle — parameters are a shape fact you can derive — is the
              same everywhere.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/** The architecture, as draggable columns of neurons. */
function ArchFigure({
  widths,
  onChange,
}: {
  widths: number[];
  onChange: (i: number, v: number) => void;
}) {
  const H = 240;
  const maxW = Math.max(...widths);

  return (
    <div className="pb-arch">
      {widths.map((w, i) => {
        // Height of the column is the layer's width on a square-root scale, so
        // a 400-wide input and a 25-wide hidden layer can share a figure.
        const frac = Math.sqrt(w) / Math.sqrt(maxW);
        return (
          <div className="pb-layer" key={i}>
            <div className="pb-layer__bar" style={{ height: H }}>
              <div
                className={`pb-layer__fill${
                  i === 0 || i === widths.length - 1 ? " pb-layer__fill--end" : ""
                }`}
                style={{ height: `${frac * 100}%` }}
              />
            </div>
            <input
              className="pb-layer__slider"
              type="range"
              min={MIN_W}
              max={MAX_W}
              value={w}
              aria-label={`layer ${i + 1} width`}
              onChange={(e) => onChange(i, parseInt(e.target.value, 10))}
            />
            <div className="pb-layer__meta">
              <span className="pb-layer__n">{w}</span>
              <span className="pb-layer__role">
                {i === 0
                  ? "input"
                  : i === widths.length - 1
                    ? "output"
                    : `hidden ${i}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The log-scale ladder from this model to a frontier one. */
function Ladder({
  current,
  precision,
}: {
  current: number;
  precision: { name: string; bytes: number };
}) {
  const all = [
    ...REFERENCES,
    {
      name: "Your architecture",
      params: current,
      note: "the one above",
      ours: true,
      current: true,
    } as const,
  ].sort((a, b) => a.params - b.params);

  const lo = Math.log10(Math.max(1e3, Math.min(...all.map((a) => a.params))));
  const hi = Math.log10(Math.max(...all.map((a) => a.params)));
  const span = hi - lo || 1;

  return (
    <div className="pb-ladder">
      {all.map((r) => {
        const t = (Math.log10(Math.max(r.params, 1e3)) - lo) / span;
        const isCurrent = "current" in r && r.current;
        return (
          <div
            className={`pb-rung${isCurrent ? " pb-rung--current" : ""}${
              r.ours ? " pb-rung--ours" : ""
            }`}
            key={r.name}
          >
            <span className="pb-rung__name">{r.name}</span>
            <span className="pb-rung__track">
              <span
                className="pb-rung__fill"
                style={{ width: `${Math.max(2, t * 100)}%` }}
              />
            </span>
            <span className="pb-rung__params">{formatParams(r.params)}</span>
            <span className="pb-rung__bytes">
              {formatBytes(bytesFor(r.params, precision.bytes))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
