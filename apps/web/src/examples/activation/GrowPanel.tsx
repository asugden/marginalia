// Panel 2: grow a network, and find out why it needs to bend.
//
// The dots are a curve with a hump in it. By default it is how much someone
// enjoys a cup of coffee against its temperature — too cold, just right, too
// hot — which needs no background at all. With the page's Neuroscience
// switch on, it is an orientation-tuned neuron in visual cortex instead,
// firing most for a bar tilted at 60°. Either way, a network with one input,
// n hidden neurons and one output is fitted to the dots: the best fit for
// that n and that activation, found by gradient descent in the browser (see
// act.ts).
//
// With no activation, adding neurons changes nothing: the side column
// collapses the whole network, however wide, into one slope and one
// intercept computed from its own weights. With ReLU each neuron's own
// response (drawn under it) is a line with one bend in it, and the fit gets
// a bend per neuron. That is the lesson, and the page never states it.

import { useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { LEARNED_NEG, LEARNED_POS, value } from "../shared/palette.js";
import {
  ACT_NAME,
  COFFEE,
  CORTEX,
  collapse,
  fit,
  miss,
  run1D,
  type Act,
  type Curve,
  type Net1D,
} from "./act.js";
import { ArrowDefs, BarGlyph, Neuron, fmt, pathOf } from "./draw.js";

const W = 640;
const H = 560;
const CX = 360;
const Y_IN = 50;
const Y_HID = 150;
const MINI_Y = 172; // top of the per-neuron plots
const MINI_W = 62;
const MINI_H = 40;
const Y_OUT = 262;
const PX0 = 150; // the fit plot
const PW = 470;
const PY0 = 318;
const PH = 180;
const HID_STEP = 82;
const TILE = 40;
const GUTTER_X = 14;
const MAX_N = 6;

// Fits are deterministic and a few milliseconds each; remember them so
// flipping back and forth is instant.
const FITS = new Map<string, Net1D>();
function fitted(curve: Curve, kind: Act, n: number): Net1D {
  const key = `${curve.id}:${kind}:${n}`;
  let net = FITS.get(key);
  if (!net) {
    net = fit(kind, n, curve.points);
    FITS.set(key, net);
  }
  return net;
}

/** Everything the figure says that depends on which curve it is fitting. */
const LOOK: Record<
  Curve["id"],
  {
    input: string;
    output: string;
    y: string;
    x: string;
    slider: string;
    unit: string;
    ticks: number[];
    start: number;
    eq: string;
    about: string;
  }
> = {
  coffee: {
    input: "the temperature",
    output: "predicted enjoyment",
    y: "enjoyment",
    x: "the coffee's temperature →",
    slider: "coffee at",
    unit: "°C",
    ticks: [10, 30, 50, 70, 90],
    start: 66,
    eq: "enjoyment",
    about: "how much someone enjoys coffee at each temperature, highest near 66 °C",
  },
  cortex: {
    input: "the bar's angle",
    output: "predicted rate",
    y: "firing rate",
    x: "the bar's angle →",
    slider: "bar at",
    unit: "°",
    ticks: [0, 30, 60, 90, 120, 150, 180],
    start: 60,
    eq: "rate",
    about: "a visual-cortex tuning curve that peaks at 60 degrees",
  },
};

export function GrowPanel({
  kind,
  bio,
  onPickKind,
}: {
  kind: Act;
  /** Fit the visual-cortex tuning curve instead of the coffee curve. */
  bio: boolean;
  onPickKind: (k: Act) => void;
}) {
  const curve = bio ? CORTEX : COFFEE;
  const look = LOOK[curve.id];
  const [n, setN] = useState(1);
  const [at, setAt] = useState(look.start);
  const net = useMemo(() => fitted(curve, kind, n), [curve, kind, n]);
  const err = useMemo(() => miss(net, kind, curve.points), [net, kind, curve]);
  // The linear network collapsed to one line, restated in the input's own
  // units: the network sees (at − min) / range, so the slope per unit is the
  // slope over the range and the intercept moves back to zero.
  const line = kind === "none" ? collapse(net) : null;
  const range = curve.max - curve.min;
  const perUnit = line ? line.slope / range : 0;
  const atZero = line ? line.intercept - perUnit * curve.min : 0;

  return (
    <div className="af-layout">
      <aside className="af-side">
        <div className="af-box">
          <span className="af-kicker">Hidden neurons</span>
          <div className="af-stepper">
            <Button size="sm" variant="subtle" onClick={() => setN((v) => Math.max(1, v - 1))} disabled={n <= 1} aria-label="Remove a neuron">
              −
            </Button>
            <span className="af-big">{n}</span>
            <Button size="sm" variant="subtle" onClick={() => setN((v) => Math.min(MAX_N, v + 1))} disabled={n >= MAX_N} aria-label="Add a neuron">
              +
            </Button>
          </div>
        </div>

        <div className="af-box" aria-live="polite">
          <span className="af-kicker">Average miss</span>
          <span className="af-big af-big--value">{fmt(err)}</span>
          {line && (
            <p className="af-text">
              All {n} {n === 1 ? "neuron" : "neurons"}, collapsed:
              <span className="af-eq">
                {look.eq} = {fmt(atZero)} {perUnit < 0 ? "−" : "+"} {fmt(Math.abs(perUnit), 4)} × {curve.id === "coffee" ? "temp" : "θ"}
              </span>
            </p>
          )}
        </div>

        {kind === "none" && (
          <div className="af-box af-box--quiet">
            <p className="af-question">What is the dumbest non-linear function you can think of?</p>
            <Button size="sm" onClick={() => onPickKind("relu")}>
              Try it
            </Button>
          </div>
        )}

        <div className="af-box">
          <label className="af-slider af-slider--wide">
            <span>{look.slider}</span>
            <input
              type="range"
              min={curve.min}
              max={curve.max}
              step={1}
              value={at}
              onChange={(e) => setAt(parseInt(e.target.value, 10))}
            />
            <span className="af-slider__val">
              {at}
              {look.unit}
            </span>
          </label>
        </div>
      </aside>

      <GrowFigure kind={kind} net={net} curve={curve} at={at} onAt={setAt} />
    </div>
  );
}

function GrowFigure({
  kind,
  net,
  curve,
  at,
  onAt,
}: {
  kind: Act;
  net: Net1D;
  curve: Curve;
  at: number;
  onAt: (d: number) => void;
}) {
  const look = LOOK[curve.id];
  const n = net.w.length;
  const range = curve.max - curve.min;
  const x = (at - curve.min) / range;
  const pass = run1D(net, kind, x);
  const hx = (i: number) => CX + (i - (n - 1) / 2) * HID_STEP;

  // Each neuron's own response across every angle, for its mini plot. Scaled
  // per neuron, since the question each plot answers is its SHAPE.
  const minis = useMemo(
    () =>
      net.w.map((w, i) => {
        const ys = Array.from({ length: 61 }, (_, k) => {
          const xx = k / 60;
          return run1D(net, kind, xx).h[i]!;
        });
        const lo = Math.min(0, ...ys);
        const hi = Math.max(1e-6, ...ys);
        return { ys, lo, hi, w };
      }),
    [net, kind],
  );
  const hBound = Math.max(1e-6, ...minis.map((m) => Math.max(Math.abs(m.lo), Math.abs(m.hi))));
  const wMax = Math.max(1e-6, ...net.w.map(Math.abs));
  const vMax = Math.max(1e-6, ...net.v.map(Math.abs));

  // The fit plot: firing rate 0..1 against angle 0..180.
  const Y0 = -0.1;
  const Y1 = 1.1;
  const px = (d: number) => PX0 + ((d - curve.min) / range) * PW;
  const py = (r: number) => PY0 + PH - ((r - Y0) / (Y1 - Y0)) * PH;
  const fitPath = useMemo(() => {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 120; k++) {
      const r = run1D(net, kind, k / 120).y;
      pts.push([PX0 + (k / 120) * PW, py(Math.max(Y0 - 0.05, Math.min(Y1 + 0.05, r)))]);
    }
    return pathOf(pts);
    // py is a pure function of constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, kind]);

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    onAt(Math.round(curve.min + Math.max(0, Math.min(1, (p.x - PX0) / PW)) * range));
  };

  return (
    <svg
      className="af-fig"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`A network with one input, ${n} hidden ${n === 1 ? "neuron" : "neurons"} using ${ACT_NAME[kind]}, and one output, fitted to ${look.about}.`}
    >
      <ArrowDefs id="af-g-arrow" />

      <Caption y={Y_IN} main="input" sub={look.input} />
      <Caption y={Y_HID} main="hidden" sub={ACT_NAME[kind]} />
      <Caption y={Y_OUT} main="output" sub={look.output} />
      <Caption y={PY0 + PH / 2} main="fit" sub="drag across it" />

      {/* Connections: sage and plum, width by size. */}
      {net.w.map((w, i) => (
        <line
          key={`a${i}`}
          x1={CX}
          y1={Y_IN + TILE / 2}
          x2={hx(i)}
          y2={Y_HID - 13}
          strokeLinecap="round"
          style={{
            stroke: w >= 0 ? LEARNED_POS : LEARNED_NEG,
            strokeWidth: 0.8 + (Math.abs(w) / wMax) * 3,
            opacity: 0.35 + (Math.abs(w) / wMax) * 0.55,
          }}
        />
      ))}
      {net.v.map((v, i) => (
        <line
          key={`b${i}`}
          x1={hx(i)}
          y1={MINI_Y + MINI_H + 4}
          x2={CX}
          y2={Y_OUT - 13}
          strokeLinecap="round"
          style={{
            stroke: v >= 0 ? LEARNED_POS : LEARNED_NEG,
            strokeWidth: 0.8 + (Math.abs(v) / vMax) * 3,
            opacity: 0.35 + (Math.abs(v) / vMax) * 0.55,
          }}
        />
      ))}

      {/* The input: the bar itself, or the temperature. */}
      <rect className="af-tile" x={CX - TILE / 2} y={Y_IN - TILE / 2} width={TILE} height={TILE} rx={10} style={{ fill: "var(--surface)" }} />
      {curve.id === "cortex" ? (
        <>
          <BarGlyph cx={CX} cy={Y_IN} deg={at} len={26} />
          <text className="fig-label-sub" x={CX + TILE / 2 + 10} y={Y_IN + 4}>
            {at}°
          </text>
        </>
      ) : (
        <text className="af-num" x={CX} y={Y_IN + 4} textAnchor="middle" style={{ fill: "var(--text-strong)" }}>
          {at}°
        </text>
      )}

      {/* Hidden neurons, each with its own response underneath. */}
      {minis.map((m, i) => {
        const cx = hx(i);
        const x0 = cx - MINI_W / 2;
        const my = (v: number) => MINI_Y + MINI_H - ((v - m.lo) / (m.hi - m.lo || 1)) * MINI_H;
        const pts: [number, number][] = m.ys.map((v, k) => [x0 + (k / 60) * MINI_W, my(v)]);
        return (
          <g key={i}>
            <Neuron cx={cx} cy={Y_HID} fill={value(pass.h[i]! / hBound)} />
            <rect className="af-mini__frame" x={x0} y={MINI_Y} width={MINI_W} height={MINI_H} rx={3} />
            {m.lo < 0 && <line className="af-mini__zero" x1={x0} y1={my(0)} x2={x0 + MINI_W} y2={my(0)} />}
            <path className="af-mini__fn" d={pathOf(pts)} />
            <line className="af-plot__cursor" x1={x0 + x * MINI_W} y1={MINI_Y} x2={x0 + x * MINI_W} y2={MINI_Y + MINI_H} />
          </g>
        );
      })}

      {/* The output. */}
      <Neuron cx={CX} cy={Y_OUT} fill={value(pass.y)} />
      <text className="af-num" x={CX + 22} y={Y_OUT + 4} style={{ fill: "var(--ml-value-pos-ink)" }}>
        {fmt(pass.y)}
      </text>
      <line className="af-flowline" x1={CX} y1={Y_OUT + 16} x2={CX} y2={PY0 - 6} markerEnd="url(#af-g-arrow)" />

      {/* The fit. */}
      <rect className="af-plot__frame" x={PX0} y={PY0} width={PW} height={PH} rx={4} />
      {[0, 0.5, 1].map((r) => (
        <g key={r}>
          <line className="af-plot__grid" x1={PX0} y1={py(r)} x2={PX0 + PW} y2={py(r)} />
          <text className="fig-tick" x={PX0 - 6} y={py(r) + 3} textAnchor="end">
            {r}
          </text>
        </g>
      ))}
      <text className="fig-label" x={PX0 + 6} y={PY0 + 13}>
        {look.y}
      </text>
      <clipPath id="af-fit-clip">
        <rect x={PX0} y={PY0} width={PW} height={PH} />
      </clipPath>
      <g clipPath="url(#af-fit-clip)">
        <path className="af-plot__fit" d={fitPath} />
      </g>
      {curve.points.map((p) => (
        <circle key={p.at} className="af-plot__data" cx={px(p.at)} cy={py(p.y)} r={3.2} />
      ))}
      <line className="af-plot__cursor" x1={px(at)} y1={PY0} x2={px(at)} y2={PY0 + PH} />
      <circle
        className="af-node"
        cx={px(at)}
        cy={py(Math.max(Y0, Math.min(Y1, pass.y)))}
        r={5.5}
        style={{ fill: value(pass.y), strokeWidth: 1.5 }}
      />
      {/* Along the axis: the bar at each angle, or the temperatures. */}
      {look.ticks.map((d) => (
        <g key={d}>
          {curve.id === "cortex" && <BarGlyph cx={px(d)} cy={PY0 + PH + 16} deg={d} len={14} small />}
          <text className="fig-tick" x={px(d)} y={PY0 + PH + (curve.id === "cortex" ? 38 : 16)} textAnchor="middle">
            {d}
            {look.unit}
          </text>
        </g>
      ))}
      {curve.id === "coffee" && (
        <>
          <text className="fig-note af-note-italic" x={PX0 + 8} y={PY0 + PH - 8}>
            too cold
          </text>
          <text className="fig-note af-note-italic" x={PX0 + PW - 8} y={PY0 + PH - 8} textAnchor="end">
            too hot
          </text>
        </>
      )}
      <text className="fig-label" x={PX0 + PW} y={PY0 + PH + 52} textAnchor="end">
        {look.x}
      </text>
      <rect
        className="af-plot__hit"
        x={PX0}
        y={PY0}
        width={PW}
        height={PH}
        onPointerMove={pick}
        onPointerDown={pick}
      />
    </svg>
  );
}

function Caption({ y, main, sub }: { y: number; main: string; sub: string }) {
  return (
    <g>
      <text className="fig-label fig-label--lg" x={GUTTER_X} y={y - 3}>
        {main}
      </text>
      <text className="fig-label-sub" x={GUTTER_X} y={y + 10}>
        {sub}
      </text>
    </g>
  );
}
