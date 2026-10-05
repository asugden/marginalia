// Panel 4: ReLU, GELU and SwiGLU, each drawn as input × gate = output.
//
// ReLU first, because students already know its shape from panel 1: here it
// is rebuilt as the input (a straight line) times a hard switch (0 below
// zero, 1 above), and the familiar bent line falls out of the product. GELU
// swaps the hard switch for a smooth one — Φ(x), the chance a standard normal
// variable falls below the input, an S-curve like the sigmoid. SwiGLU, what
// most recent large language models use, takes the idea one step further:
// both sides of the product are learned. One weight scales the value (a·x),
// another feeds the gate, and the gate is SiLU (x·sigmoid(x)) rather than a
// 0–1 switch. With one input those are just two numbers, a and b, so the
// panel gives them sliders.
//
// Drag across any of the three plots to move the input. The output plot keeps
// a comparison activation as a dashed ghost, and the side column reads out the
// output's slope: just below zero a ReLU's is 0 — the neuron learns nothing
// from that input — while GELU's and SwiGLU's are not.

import { useState } from "react";
import { SegmentedControl } from "../../components/index.js";
import { value as valueInk } from "../shared/palette.js";
import { fmt, pathOf } from "./draw.js";

type Mode = "relu" | "gelu" | "swiglu";

const MODE_NAME: Record<Mode, string> = { relu: "ReLU", gelu: "GELU", swiglu: "SwiGLU" };
/** What the dashed ghost on the output plot shows, for comparison. */
const GHOST: Record<Mode, Mode> = { relu: "gelu", gelu: "relu", swiglu: "relu" };

// GELU's gate Φ(x), in the tanh form the original paper gives and most
// libraries use (Hendrycks & Gimpel, 2016).
const K = Math.sqrt(2 / Math.PI);
const phi = (x: number) => 0.5 * (1 + Math.tanh(K * (x + 0.044715 * x ** 3)));
const silu = (x: number) => x / (1 + Math.exp(-x));

interface Weights {
  a: number;
  b: number;
}

const valueOf = (m: Mode, x: number, w: Weights) => (m === "swiglu" ? w.a * x : x);
const gateOf = (m: Mode, x: number, w: Weights) =>
  m === "relu" ? (x > 0 ? 1 : 0) : m === "gelu" ? phi(x) : silu(w.b * x);
const outOf = (m: Mode, x: number, w: Weights) => valueOf(m, x, w) * gateOf(m, x, w);
/** The output's slope. ReLU's is exactly 0 or 1 away from the kink; the
 *  smooth ones by a central difference, exact enough to two places. */
const slopeOf = (m: Mode, x: number, w: Weights) =>
  m === "relu" ? (x > 0 ? 1 : 0) : (outOf(m, x + 1e-4, w) - outOf(m, x - 1e-4, w)) / 2e-4;

const W = 640;
const H = 236;
const X_MIN = -3;
const X_MAX = 3;
const PW = 168;
const PH = 140;
const PY0 = 34;
const GAP = 40;
const PLOTS = [0, 1, 2].map((i) => 14 + i * (PW + GAP));

/** A plot's vertical range: what its curve reaches over the input range, with
 *  a little air, always including the given values (zero, or 0–1 for a gate). */
function rangeOf(fs: ((t: number) => number)[], include: number[]): [number, number] {
  let lo = Math.min(...include);
  let hi = Math.max(...include);
  for (const f of fs)
    for (let k = 0; k <= 60; k++) {
      const v = f(X_MIN + ((X_MAX - X_MIN) * k) / 60);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

export function GeluPanel() {
  // ReLU first: the shape students already know, rebuilt as input × switch.
  const [m, setM] = useState<Mode>("relu");
  // Starts just below zero, where they differ: ReLU's slope is 0 there.
  const [x, setX] = useState(-0.4);
  const [w, setW] = useState<Weights>({ a: 1, b: 1 });

  return (
    <div className="af-layout">
      <aside className="af-side">
        <div className="af-box">
          <span className="af-kicker">Gate</span>
          <SegmentedControl
            options={(["relu", "gelu", "swiglu"] as Mode[]).map((k) => ({ value: k, label: MODE_NAME[k] }))}
            value={m}
            onChange={(v) => setM(v as Mode)}
          />
        </div>
        {m === "swiglu" && (
          <div className="af-box">
            <div className="af-sliders">
              <span className="af-kicker">Learned weights</span>
              {(["a", "b"] as const).map((k) => (
                <label key={k} className={`af-slider af-slider--${w[k] < 0 ? "neg" : "pos"}`}>
                  <span>{k}</span>
                  <input
                    type="range"
                    min={-2}
                    max={2}
                    step={0.05}
                    value={w[k]}
                    onChange={(e) => setW({ ...w, [k]: parseFloat(e.target.value) })}
                  />
                  <span className={`af-slider__val af-slider__val--${w[k] < 0 ? "neg" : "pos"}`}>{fmt(w[k])}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="af-box" aria-live="polite">
          <span className="af-kicker">Slope</span>
          <span className="af-big af-big--value">{fmt(slopeOf(m, x, w))}</span>
        </div>
      </aside>

      <GateFigure m={m} w={w} x={x} onX={setX} />
    </div>
  );
}

function GateFigure({ m, w, x, onX }: { m: Mode; w: Weights; x: number; onX: (x: number) => void }) {
  const ghost = GHOST[m];
  const vf = (t: number) => valueOf(m, t, w);
  const gf = (t: number) => gateOf(m, t, w);
  const of = (t: number) => outOf(m, t, w);
  const ghostF = (t: number) => outOf(ghost, t, w);
  const vx = vf(x);
  const gx = gf(x);
  const ox = of(x);

  const vRange = rangeOf([vf], [0]);
  const gRange = m === "swiglu" ? rangeOf([gf], [0, 1]) : ([-0.15, 1.15] as [number, number]);
  const oRange = rangeOf([of], [0, 1]);
  const ink = (v: number, r: [number, number]) => v / Math.max(Math.abs(r[0]), Math.abs(r[1]));

  return (
    <svg
      className="af-fig"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`${MODE_NAME[m]} written as input times gate. Value ${fmt(vx)}, gate ${fmt(gx)}, output ${fmt(ox)}, slope ${fmt(slopeOf(m, x, w))}.`}
    >
      <PlotFrame
        x0={PLOTS[0]!}
        label={m === "swiglu" ? "a · input" : "input"}
        range={vRange}
        at={x}
        value={vx}
        ink={ink(vx, vRange)}
        fn={vf}
        onX={onX}
      />
      <Operator x={PLOTS[0]! + PW + GAP / 2} text="×" />
      <PlotFrame
        x0={PLOTS[1]!}
        label={m === "swiglu" ? "gate: SiLU(b · input)" : "gate"}
        range={gRange}
        at={x}
        value={gx}
        ink={ink(gx, gRange)}
        fn={gf}
        step={m === "relu"}
        onX={onX}
      />
      <Operator x={PLOTS[1]! + PW + GAP / 2} text="=" />
      <PlotFrame
        x0={PLOTS[2]!}
        label="output"
        range={oRange}
        at={x}
        value={ox}
        ink={ink(ox, oRange)}
        fn={of}
        ghost={ghostF}
        ghostLabel={MODE_NAME[ghost]}
        onX={onX}
      />

      {/* The product, written out under the plots. */}
      <text className="fig-num" x={PLOTS[0]! + PW / 2} y={PY0 + PH + 34} textAnchor="middle">
        {fmt(vx)}
      </text>
      <text className="fig-num" x={PLOTS[1]! + PW / 2} y={PY0 + PH + 34} textAnchor="middle">
        × {fmt(gx)}
      </text>
      <text className="fig-num af-sum--total" x={PLOTS[2]! + PW / 2} y={PY0 + PH + 34} textAnchor="middle">
        = {fmt(ox)}
      </text>
    </svg>
  );
}

function Operator({ x, text }: { x: number; text: string }) {
  return (
    <text className="af-sigma" x={x} y={PY0 + PH / 2 + 8} textAnchor="middle">
      {text}
    </text>
  );
}

function PlotFrame({
  x0,
  label,
  range,
  at,
  value,
  ink,
  fn,
  step,
  ghost,
  ghostLabel,
  onX,
}: {
  x0: number;
  label: string;
  range: [number, number];
  at: number;
  value: number;
  /** The dot's colour on the computed-value scale, −1..1. */
  ink: number;
  fn: (t: number) => number;
  /** Draw as a hard step (ReLU's gate), with no join across the jump. */
  step?: boolean;
  ghost?: (t: number) => number;
  ghostLabel?: string;
  onX: (x: number) => void;
}) {
  const [y0, y1] = range;
  const px = (t: number) => x0 + ((t - X_MIN) / (X_MAX - X_MIN)) * PW;
  const py = (v: number) => PY0 + PH - ((Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0)) * PH;
  const trace = (f: (t: number) => number): [number, number][] =>
    Array.from({ length: 121 }, (_, k) => {
      const t = X_MIN + ((X_MAX - X_MIN) * k) / 120;
      return [px(t), py(f(t))];
    });

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const t = X_MIN + Math.max(0, Math.min(1, (p.x - x0) / PW)) * (X_MAX - X_MIN);
    onX(Math.round(t * 100) / 100);
  };

  return (
    <g>
      <text className="fig-label" x={x0} y={PY0 - 10}>
        {label}
      </text>
      <rect className="af-plot__frame" x={x0} y={PY0} width={PW} height={PH} rx={4} />
      <line className="af-plot__axis" x1={x0} y1={py(0)} x2={x0 + PW} y2={py(0)} />
      <line className="af-plot__axis" x1={px(0)} y1={PY0} x2={px(0)} y2={PY0 + PH} />
      {[-2, 2].map((t) => (
        <text key={t} className="fig-tick" x={px(t)} y={PY0 + PH + 13} textAnchor="middle">
          {fmt(t, 0)}
        </text>
      ))}

      {ghost && (
        <>
          <path className="af-plot__ref" d={pathOf(trace(ghost))} />
          <text className="fig-tick" x={x0 + 5} y={PY0 + PH - 6}>
            {ghostLabel}
          </text>
        </>
      )}
      {step ? (
        <>
          <line className="af-plot__fn" x1={px(X_MIN)} y1={py(0)} x2={px(0)} y2={py(0)} />
          <line className="af-plot__fn" x1={px(0)} y1={py(1)} x2={px(X_MAX)} y2={py(1)} />
        </>
      ) : (
        <path className="af-plot__fn" d={pathOf(trace(fn))} />
      )}

      <line className="af-plot__cursor" x1={px(at)} y1={PY0} x2={px(at)} y2={PY0 + PH} />
      <circle
        className="af-node"
        cx={px(at)}
        cy={py(value)}
        r={5}
        style={{ fill: valueInk(ink), strokeWidth: 1.5 }}
      />
      <rect
        className="af-plot__hit"
        x={x0}
        y={PY0}
        width={PW}
        height={PH}
        onPointerMove={pick}
        onPointerDown={pick}
      />
    </g>
  );
}
