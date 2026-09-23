// Panel 1: one neuron, magnified.
//
// Three inputs come in at the top, each multiplied by its weight on the way
// down; the neuron adds them and its bias; the activation function turns that
// sum into what the neuron sends on. Every number is on the drawing and every
// one can be changed, so a student can make the sum go negative and watch
// what each activation does with it.
//
// The page's Neuroscience switch swaps the gutter captions for the biology
// the parts were named after, and draws them as cells: each input is a cell
// whose axon ends on one of this cell's apical dendrites — an excitatory
// pyramidal cell while its weight is positive, an inhibitory Martinotti cell
// while it is negative. Each synapse's bouton is sage or plum and sized by
// the weight. Every cell's nucleus is coloured by its firing rate: the
// inputs in greyscale, like the tiles, and this cell by its output. The
// parts are the same; only their names and drawing change.

import { useState } from "react";
import { input, value, LEARNED_NEG, LEARNED_POS } from "../shared/palette.js";
import { ACT_NAME, act, type Act } from "./act.js";
import { ArrowDefs, Axon, Cell, Neuron, Pill, axonPoint, axonStart, cellTips, fmt, pathOf, ringScale } from "./draw.js";

const W = 590;
const H = 560;
const CX = 330; // the neuron's column
const Y_IN = 64;
const Y_SUM = 226;
const PX0 = 200; // activation plot
const PW = 260;
const PY0 = 300;
const PH = 150;
const Y_OUT = 514;
const TILE = 40;
const SUM_NODE = 56;
// The Neuroscience view draws cells, which need more height than tiles.
const CELL_S = ringScale(22); // the cell the panel is about
const IN_S = 0.28; // the input cells: pyramidal...
const IN_S_INH = 0.36; // ...and Martinotti, whose soma is smaller
const Y_IN_BIO = 96;
const OUT_NODE = 36;
const GUTTER_X = 14;
const Z_MAX = 4; // the plot's sum axis runs −4..4

/** The plot's output range for each activation: what that function can
 *  actually produce over the sum axis, with a little air. */
const Y_RANGE: Record<Act, [number, number]> = {
  none: [-Z_MAX, Z_MAX],
  relu: [-0.8, Z_MAX],
  sigmoid: [-0.15, 1.15],
  tanh: [-1.15, 1.15],
};

const INPUT_X = [CX - 130, CX, CX + 130];

export function NeuronPanel({ kind, bio }: { kind: Act; bio: boolean }) {
  const [xs, setXs] = useState([0.9, 0.3, 0.6]);
  const [ws, setWs] = useState([0.8, -1.4, 0.5]);
  const [bias, setBias] = useState(-0.1);

  const terms = xs.map((x, i) => x * ws[i]!);
  const z = terms.reduce((a, b) => a + b, 0) + bias;
  const out = act(kind, z);

  const setAt = (arr: number[], set: (v: number[]) => void, i: number, v: number) =>
    set(arr.map((a, j) => (j === i ? v : a)));

  return (
    <div className="af-layout">
      <aside className="af-side">
        <div className="af-box" aria-live="polite">
          <span className="af-kicker">This neuron</span>
          <div className="af-flow">
            <span>sum</span>
            <b>{fmt(z)}</b>
            <span className="af-flow__arrow">→</span>
            <span className="af-flow__fn">{ACT_NAME[kind]}</span>
            <span className="af-flow__arrow">→</span>
            <b className="af-big--value">{fmt(out)}</b>
          </div>
        </div>

        <div className="af-box">
          <div className="af-sliders">
            <span className="af-kicker">{bio ? "Other neurons' firing" : "Inputs"}</span>
            {xs.map((x, i) => (
              <label key={i} className="af-slider">
                <span>x{sub(i + 1)}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={x}
                  onChange={(e) => setAt(xs, setXs, i, parseFloat(e.target.value))}
                />
                <span className="af-slider__val">{fmt(x)}</span>
              </label>
            ))}
          </div>
          <div className="af-sliders">
            <span className="af-kicker">{bio ? "Synapses" : "Weights"}</span>
            {ws.map((w, i) => (
              <label key={i} className={`af-slider af-slider--${w < 0 ? "neg" : "pos"}`}>
                <span>w{sub(i + 1)}</span>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.05}
                  value={w}
                  onChange={(e) => setAt(ws, setWs, i, parseFloat(e.target.value))}
                />
                <span className={`af-slider__val af-slider__val--${w < 0 ? "neg" : "pos"}`}>{fmt(w)}</span>
              </label>
            ))}
          </div>
          <div className="af-sliders">
            <label className={`af-slider af-slider--${bias < 0 ? "neg" : "pos"}`}>
              <span>b</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={bias}
                onChange={(e) => setBias(parseFloat(e.target.value))}
              />
              <span className={`af-slider__val af-slider__val--${bias < 0 ? "neg" : "pos"}`}>{fmt(bias)}</span>
            </label>
          </div>
        </div>

      </aside>

      <NeuronFigure kind={kind} xs={xs} ws={ws} bias={bias} z={z} out={out} terms={terms} bio={bio} />
    </div>
  );
}

function NeuronFigure({
  kind,
  xs,
  ws,
  bias,
  z,
  out,
  terms,
  bio,
}: {
  kind: Act;
  xs: number[];
  ws: number[];
  bias: number;
  z: number;
  out: number;
  terms: number[];
  bio: boolean;
}) {
  const [y0, y1] = Y_RANGE[kind];
  const px = (zz: number) => PX0 + ((zz + Z_MAX) / (2 * Z_MAX)) * PW;
  const py = (yy: number) => PY0 + PH - ((yy - y0) / (y1 - y0)) * PH;
  const zc = Math.max(-Z_MAX, Math.min(Z_MAX, z));
  const outC = Math.max(y0, Math.min(y1, out));
  const curve: [number, number][] = [];
  for (let i = 0; i <= 160; i++) {
    const zz = -Z_MAX + (2 * Z_MAX * i) / 160;
    const yy = act(kind, zz);
    if (yy >= y0 && yy <= y1) curve.push([px(zz), py(yy)]);
  }
  const outBound = kind === "sigmoid" || kind === "tanh" ? 1 : Z_MAX;
  const maxW = 2;
  const caps = bio ? BIO_CAPS(kind) : ML_CAPS(kind);
  // With cells, the frame rises to take in the apical dendrites and their
  // boutons, so the input axons cross it on their stems.
  const frameTop = bio ? 158 : Y_SUM - SUM_NODE / 2 - 22;

  return (
    <svg
      className="af-fig"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`One neuron. Inputs ${xs.map((x) => fmt(x)).join(", ")} are multiplied by weights ${ws
        .map((w) => fmt(w))
        .join(", ")} and added to the bias ${fmt(bias)}, giving ${fmt(z)}. ${ACT_NAME[kind]} turns that into ${fmt(out)}.`}
    >
      <ArrowDefs id="af-n-arrow" />

      {/* Gutter captions: the parts' names, in either vocabulary. */}
      {caps.map((c) => (
        <g key={c.main}>
          <text className="fig-label fig-label--lg" x={GUTTER_X} y={c.y - 3}>
            {c.main}
          </text>
          <text className="fig-label-sub" x={GUTTER_X} y={c.y + 10}>
            {c.sub}
          </text>
        </g>
      ))}

      {/* The neuron's boundary: the sum and the activation are ONE unit. */}
      <rect className="af-neuronframe" x={PX0 - 34} y={frameTop} width={W - PX0 + 20} height={PY0 + PH + 34 - frameTop} rx={14} />
      <text className="fig-label" x={PX0 - 24} y={frameTop + 14}>
        {bio ? "one cell" : "one neuron"}
      </text>

      {bio ? (
        <BioInputs xs={xs} ws={ws} />
      ) : (
        <>
      {/* Connections: a weight on each, coloured by its sign. */}
      {xs.map((_, i) => {
        const w = ws[i]!;
        const x1 = INPUT_X[i]!;
        const y1c = Y_IN + TILE / 2;
        const x2 = CX + (i - 1) * 14;
        const y2 = Y_SUM - SUM_NODE / 2;
        const t = 0.42;
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={y1c}
              x2={x2}
              y2={y2}
              style={{
                stroke: w >= 0 ? LEARNED_POS : LEARNED_NEG,
                strokeWidth: 1 + (Math.abs(w) / maxW) * 4,
                opacity: 0.3 + (Math.abs(w) / maxW) * 0.65,
              }}
              strokeLinecap="round"
            />
            <Pill
              x={x1 + (x2 - x1) * t}
              y={y1c + (y2 - y1c) * t}
              text={`× ${fmt(w)}`}
              className={`af-wlabel af-wlabel--${w < 0 ? "neg" : "pos"}`}
            />
          </g>
        );
      })}

      {/* Inputs. */}
      {xs.map((x, i) => (
        <g key={i}>
          <text className="fig-label-sub" x={INPUT_X[i]} y={Y_IN - TILE / 2 - 8} textAnchor="middle">
            x{sub(i + 1)}
          </text>
          <rect
            className="af-tile"
            x={INPUT_X[i]! - TILE / 2}
            y={Y_IN - TILE / 2}
            width={TILE}
            height={TILE}
            rx={10}
            style={{ fill: input(x) }}
          />
          <text
            className="af-num"
            x={INPUT_X[i]}
            y={Y_IN + 4}
            textAnchor="middle"
            style={{ fill: x > 0.55 ? "var(--surface)" : "var(--text-strong)" }}
          >
            {fmt(x)}
          </text>
        </g>
      ))}
        </>
      )}

      {/* The sum: a Σ node, or in the Neuroscience view a cell whose axon
          runs down to the activation. */}
      {bio ? (
        <Cell kind="interneuron" cx={CX} cy={Y_SUM} s={CELL_S} rate={value(out / outBound)} axon={PY0 - 2 - Y_SUM} />
      ) : (
        <>
          <Neuron cx={CX} cy={Y_SUM} size={SUM_NODE} fill={value(zc / Z_MAX)} className="af-node af-node--big" />
          <text className="af-sigma" x={CX} y={Y_SUM + 9} textAnchor="middle">
            Σ
          </text>
          <line className="af-flowline" x1={CX} y1={Y_SUM + SUM_NODE / 2 + 2} x2={CX} y2={PY0 - 4} markerEnd="url(#af-n-arrow)" />
        </>
      )}
      <SumWorking x={CX + SUM_NODE / 2 + 22} y={Y_SUM - 36} xs={xs} ws={ws} terms={terms} bias={bias} z={z} />

      {/* The activation, with the sum marked on it. */}
      <rect className="af-plot__frame" x={PX0} y={PY0} width={PW} height={PH} rx={4} />
      <line className="af-plot__axis" x1={PX0} y1={py(0)} x2={PX0 + PW} y2={py(0)} />
      <line className="af-plot__axis" x1={px(0)} y1={PY0} x2={px(0)} y2={PY0 + PH} />
      {[-4, -2, 2, 4].map((t) => (
        <text key={t} className="fig-tick" x={px(t)} y={py(0) + 12} textAnchor="middle">
          {fmt(t, 0)}
        </text>
      ))}
      <text className="fig-tick" x={px(0) - 4} y={PY0 + 10} textAnchor="end">
        {fmt(y1, 0)}
      </text>
      <text className="fig-label" x={PX0 + PW} y={PY0 + PH + 13} textAnchor="end">
        {bio ? "total input →" : "sum →"}
      </text>
      <text className="fig-label" x={PX0 + 4} y={PY0 + 12}>
        {bio ? "firing rate" : "output"}
      </text>
      <path className="af-plot__fn" d={pathOf(curve)} />
      <line className="af-plot__guide" x1={px(zc)} y1={py(0)} x2={px(zc)} y2={py(outC)} />
      <line className="af-plot__guide" x1={px(0)} y1={py(outC)} x2={px(zc)} y2={py(outC)} />
      <circle cx={px(zc)} cy={py(outC)} r={5.5} className="af-node" style={{ fill: value(out / outBound), strokeWidth: 1.5 }} />
      {bio && <BioNote kind={kind} px={px} py={py} />}

      <line className="af-flowline" x1={CX} y1={PY0 + PH + 18} x2={CX} y2={Y_OUT - OUT_NODE / 2 - 4} markerEnd="url(#af-n-arrow)" />

      {/* What it sends on. */}
      <Neuron cx={CX} cy={Y_OUT} size={OUT_NODE} fill={value(out / outBound)} />
      <text
        className="af-num"
        x={CX + OUT_NODE / 2 + 10}
        y={Y_OUT + 4}
        style={{ fill: "var(--ml-value-pos-ink)" }}
      >
        {fmt(out)}
      </text>
    </svg>
  );
}

/** The Neuroscience view's inputs: a cell per input, excitatory or
 *  inhibitory by its weight's sign, each axon curving down to end on one of
 *  the panel's cell's apical tips. */
function BioInputs({ xs, ws }: { xs: number[]; ws: number[] }) {
  const tips = cellTips(CX, Y_SUM, CELL_S);
  return (
    <g>
      {xs.map((_, i) => {
        const w = ws[i]!;
        const [x0, y0] = axonStart(w < 0 ? "martinotti" : "pyramidal", INPUT_X[i]!, Y_IN_BIO, w < 0 ? IN_S_INH : IN_S);
        const [x1, y1] = tips[i]!;
        const r = 1.8 + (Math.abs(w) / 2) * 2.4;
        const [lx, ly] = axonPoint(x0, y0, x1, y1, r, 0.5);
        return (
          <g key={i}>
            <Axon x0={x0} y0={y0} x1={x1} y1={y1} r={r} className={`af-bouton--${w < 0 ? "neg" : "pos"}`} />
            <Pill x={lx} y={ly} text={`× ${fmt(w)}`} className={`af-wlabel af-wlabel--${w < 0 ? "neg" : "pos"}`} />
          </g>
        );
      })}
      {xs.map((x, i) => (
        <g key={i}>
          <Cell
            kind={ws[i]! < 0 ? "martinotti" : "pyramidal"}
            cx={INPUT_X[i]!}
            cy={Y_IN_BIO}
            s={ws[i]! < 0 ? IN_S_INH : IN_S}
            rate={input(x)}
          />
          <text className="fig-label-sub" x={INPUT_X[i]} y={16} textAnchor="middle">
            x{sub(i + 1)} = {fmt(x)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** The sum written out beside the Σ: each input times its weight, the bias,
 *  and the total. */
function SumWorking({
  x,
  y,
  xs,
  ws,
  terms,
  bias,
  z,
}: {
  x: number;
  y: number;
  xs: number[];
  ws: number[];
  terms: number[];
  bias: number;
  z: number;
}) {
  const rows = xs.map((xi, i) => `${fmt(xi)} × ${fmt(ws[i]!)} = ${fmt(terms[i]!)}`);
  return (
    <g>
      {rows.map((r, i) => (
        <text key={i} className="fig-num" x={x} y={y + i * 15}>
          {i === 0 ? "  " : "+ "}
          {r}
        </text>
      ))}
      <text className="fig-num" x={x} y={y + 3 * 15}>
        + bias {fmt(bias)}
      </text>
      <line className="af-sum--rule" x1={x} y1={y + 3 * 15 + 6} x2={x + 150} y2={y + 3 * 15 + 6} />
      <text className="fig-num af-sum--total" x={x} y={y + 5 * 15 - 2}>
        = {fmt(z)}
      </text>
    </g>
  );
}

/** One short biological reading of the curve, placed on the curve. */
function BioNote({ kind, px, py }: { kind: Act; px: (z: number) => number; py: (y: number) => number }) {
  if (kind === "relu")
    return (
      <text className="fig-note af-note-italic" x={px(-3.8)} y={py(0) - 6}>
        below zero: silent
      </text>
    );
  if (kind === "sigmoid")
    return (
      <>
        <text className="fig-note af-note-italic" x={px(3.8)} y={py(1) + 13} textAnchor="end">
          tops out at its fastest rate
        </text>
        <text className="fig-note af-note-italic" x={px(-3.8)} y={py(0) - 6}>
          silent
        </text>
      </>
    );
  if (kind === "tanh")
    return (
      <>
        <text className="fig-note af-note-italic" x={px(3.8)} y={py(1) + 13} textAnchor="end">
          as far above resting as it goes
        </text>
        <text className="fig-note af-note-italic" x={px(-3.8)} y={py(-1) - 6}>
          as far below resting as it goes
        </text>
      </>
    );
  return (
    <text className="fig-note af-note-italic" x={px(-3.8)} y={py(-3.2)}>
      firing below zero? no real neuron can
    </text>
  );
}

interface Cap {
  y: number;
  main: string;
  sub: string;
}
function ML_CAPS(kind: Act): Cap[] {
  return [
    { y: Y_IN, main: "inputs", sub: "x₁, x₂, x₃" },
    { y: (Y_IN + Y_SUM) / 2 + 6, main: "weights", sub: "multiply each input" },
    { y: Y_SUM, main: "sum", sub: "Σ w·x + b" },
    { y: PY0 + PH / 2, main: "activation", sub: ACT_NAME[kind] },
    { y: Y_OUT, main: "output", sub: "to the next layer" },
  ];
}
function BIO_CAPS(kind: Act): Cap[] {
  return [
    { y: Y_IN_BIO, main: "other cells", sub: "how fast each fires" },
    { y: 138, main: "synapses", sub: "sage excites, plum inhibits" },
    { y: Y_SUM, main: "cell body", sub: "adds it all up" },
    { y: PY0 + PH / 2, main: "firing", sub: kind === "none" ? "no floor, no ceiling" : kind === "relu" ? "a floor at zero" : kind === "tanh" ? "change from its resting rate" : "a floor and a ceiling" },
    { y: Y_OUT, main: "firing rate", sub: "sent down the axon" },
  ];
}

function sub(n: number): string {
  return String.fromCharCode(0x2080 + n);
}
