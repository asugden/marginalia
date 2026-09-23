// Panel 1: draw a shape, then give the model parameters until it follows.
//
// The shape starts as one heartbeat on a monitor: long flat stretches that
// cost almost nothing, and one sharp spike that costs a lot. The reader can
// draw over any part of it, or draw something else entirely. The model is
// refitted on every stroke; there is no noise here, so each extra parameter
// can only bring the curve closer.

import { useMemo, useRef, useState } from "react";
import { Button } from "../../components/index.js";
import { DRAW_N, fitOne, heartbeat, modelOf, paramsOf, rms, type Kind, type Pt } from "./fit.js";
import { ParamSlider, fitPath, sizeFor } from "./draw.js";

const W = 680;
const H = 320;
const PAD = 12;
const X0 = PAD;
const X1 = W - PAD;
const Y0 = PAD;
const Y1 = H - PAD - 10;
const MAX_STEPS = 40;
const MAX_BENDS = 30;

const px = (x: number) => X0 + x * (X1 - X0);
const py = (y: number) => Y1 - y * (Y1 - Y0);

export function DrawPanel({ kind }: { kind: Kind }) {
  const [shape, setShape] = useState<number[]>(heartbeat);
  // The budget is kept in parameters, so switching kind keeps it.
  const [params, setParams] = useState(7);
  const maxSize = kind === "steps" ? MAX_STEPS : MAX_BENDS;
  const size = sizeFor(kind, params, maxSize);

  const pts: Pt[] = useMemo(() => shape.map((y, i) => ({ x: i / (DRAW_N - 1), y })), [shape]);
  const fit = useMemo(() => fitOne(kind, pts, size), [kind, pts, size]);
  const miss = useMemo(() => rms(fit, pts), [fit, pts]);

  return (
    <div className="cs-layout">
      <aside className="cs-side">
        <div className="cs-box cs-box--controls">
          <ParamSlider kind={kind} size={size} maxSize={maxSize} onSize={(s) => setParams(paramsOf(kind, s))} />
          <span className="cs-model">{modelOf(kind, size)}</span>
        </div>

        <div className="cs-box" aria-live="polite">
          <span className="cs-kicker">Average miss</span>
          <span className="cs-big">{(miss * 100).toFixed(1)}%</span>
          <span className="cs-model">of the plot's height</span>
        </div>

        <div className="cs-box cs-box--controls">
          <span className="cs-kicker">Start from</span>
          <div className="cs-buttons">
          <Button size="sm" variant="subtle" onClick={() => setShape(heartbeat())}>
            Heartbeat
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setShape(Array(DRAW_N).fill(0.5))}>
            Blank
          </Button>
          </div>
        </div>

        <div className="cs-legend">
          <span className="cs-legend__row">
            <svg width="22" height="10" aria-hidden="true">
              <line className="cs-shape" x1="3" y1="5" x2="19" y2="5" />
            </svg>
            your shape
          </span>
          <span className="cs-legend__row">
            <svg width="22" height="10" aria-hidden="true">
              <line className="cs-fit" x1="3" y1="5" x2="19" y2="5" />
            </svg>
            the model
          </span>
        </div>
      </aside>

      <DrawFigure shape={shape} onShape={setShape} kind={kind} fitD={fitPath(fit, 0, 1, px, py)} knots={fit.knots} />
    </div>
  );
}

function DrawFigure({
  shape,
  onShape,
  kind,
  fitD,
  knots,
}: {
  shape: number[];
  onShape: (s: number[]) => void;
  kind: Kind;
  fitD: string;
  knots: number[];
}) {
  // The last sample the pen touched, so a fast stroke fills the columns it
  // skipped rather than leaving gaps.
  const last = useRef<{ i: number; y: number } | null>(null);

  const toData = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const x = Math.max(0, Math.min(1, (p.x - X0) / (X1 - X0)));
    const y = Math.max(0, Math.min(1, (Y1 - p.y) / (Y1 - Y0)));
    return { i: Math.round(x * (DRAW_N - 1)), y };
  };

  const paint = (e: React.PointerEvent<SVGRectElement>) => {
    const here = toData(e);
    const from = last.current ?? here;
    const next = [...shape];
    const lo = Math.min(from.i, here.i);
    const hi = Math.max(from.i, here.i);
    for (let i = lo; i <= hi; i++) {
      const t = hi === lo ? 1 : (i - from.i) / (here.i - from.i);
      next[i] = from.y + (here.y - from.y) * t;
    }
    last.current = here;
    onShape(next);
  };

  const shapeD = shape.map((y, i) => `${i ? "L" : "M"} ${px(i / (DRAW_N - 1)).toFixed(2)} ${py(y).toFixed(2)}`).join(" ");

  return (
    <svg
      className="cs-fig"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`A hand-drawn shape and the best fit to it built from ${knots.length + (kind === "steps" ? 1 : 0)} ${kind}.`}
    >
      <rect className="cs-frame" x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} rx={4} />
      <clipPath id="cs-draw-clip">
        <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} />
      </clipPath>
      <g clipPath="url(#cs-draw-clip)">
        <path className="cs-shape" d={shapeD} />
        <path className="cs-fit" d={fitD} />
      </g>
      {/* Where the pieces meet: one tick per threshold or corner. */}
      {knots.map((k, i) => (
        <line key={i} className="cs-knot" x1={px(k)} y1={Y1 + 3} x2={px(k)} y2={Y1 + 9} />
      ))}
      <rect
        className="cs-hit cs-hit--draw"
        x={X0}
        y={Y0}
        width={X1 - X0}
        height={Y1 - Y0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = null;
          paint(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) paint(e);
        }}
        onPointerUp={() => (last.current = null)}
      />
    </svg>
  );
}
