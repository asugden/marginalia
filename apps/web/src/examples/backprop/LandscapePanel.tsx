// Panel 2: the climb, flipped and given a second direction.
//
// An error landscape over two weights, drawn in 3D as a shaded mesh
// (painter's algorithm, no library), height = error, so low is good. It is
// made up for the picture: one bottom, reached along a valley whose floor
// bends, with ripples on its walls. The steepest way down keeps changing, so
// the walker's path winds instead of running straight in, and every start
// still ends at the same bottom. The page shows that and leaves it unsaid.
//
//   click the surface   stand there
//   drag sideways       turn the view
//   step                four test steps (east, west, north, south) are drawn
//                       from where the walker stands, green where the ground
//                       drops and red where it rises; the step taken goes
//                       the steepest way down
//
// Greyscale terrain, lighter with height like the Everest drawing above it,
// so the only colours on the surface are the test steps. A recorded
// exception to the computed scale (docs/style.md §11).

import { useMemo, useRef, useState } from "react";
import { Button } from "../../components/index.js";
import { LANDSCAPE_PANEL } from "./content.js";
import { Panel, Readout, fmt } from "./ui.js";

// The landscape: a valley whose floor follows a bend (FLOOR), rising gently
// toward one bottom at (1, −0.5), with ripples on the walls that fade to
// nothing along the floor (so they bend the path without making a second
// resting place). Measured over 289 starts across the patch: every walk ends
// at the same bottom; from the default start it takes 77 steps and turns
// through about 390° on the way. Ripples half as large again start trapping
// walkers, so RIPPLE leaves room.
const RIPPLE = 1.0;
const floorAt = (u: number) => 0.9 * Math.sin(1.2 * (u - 1)) - 0.5;
const raw = (u: number, v: number) => {
  const off = v - floorAt(u);
  return (
    0.45 * (u - 1) ** 2 +
    0.9 * off ** 2 +
    RIPPLE * Math.tanh((off * off) / 1.2) * Math.sin(2.6 * u + 0.5) * Math.cos(2.3 * v)
  );
};

// The patch of landscape drawn, centred near the valley floor.
const U0 = -2;
const U1 = 4;
const V0 = -3.5;
const V1 = 2.5;
const N = 26; // cells per side
const START: [number, number] = [-1.5, 2];
const RATE = 0.15; // the step size
const MAX_STEP = 0.3; // the longest single step
const TEST = 0.45; // how far each test step reaches

const W = 640;
const H = 430;
const SCALE = 52; // pixels per unit of weight
const HEIGHT = 170; // pixels for the tallest error drawn
const TILT = 0.5; // sin of the viewing elevation (30°)

// Error measured from the lowest point on the patch, so it never reads below 0.
const RAW_MIN = (() => {
  let m = Infinity;
  for (let i = 0; i <= 120; i++) for (let j = 0; j <= 120; j++) m = Math.min(m, raw(U0 + ((U1 - U0) * i) / 120, V0 + ((V1 - V0) * j) / 120));
  return m;
})();
const error = (u: number, v: number) => raw(u, v) - RAW_MIN;
const grad = (u: number, v: number): [number, number] => {
  const h = 1e-4;
  return [(raw(u + h, v) - raw(u - h, v)) / (2 * h), (raw(u, v + h) - raw(u, v - h)) / (2 * h)];
};
/** One step down: against the slope, never longer than MAX_STEP. */
function stepFrom(u: number, v: number): [number, number] {
  const [gu, gv] = grad(u, v);
  let du = -RATE * gu;
  let dv = -RATE * gv;
  const len = Math.hypot(du, dv);
  if (len > MAX_STEP) {
    du *= MAX_STEP / len;
    dv *= MAX_STEP / len;
  }
  return [u + du, v + dv];
}

export function LandscapePanel() {
  const [turn, setTurn] = useState(35); // degrees
  const [path, setPath] = useState<[number, number][]>([START]);
  const drag = useRef<{ x: number; turn: number; moved: boolean } | null>(null);

  const zMax = useMemo(() => {
    let m = 0;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) m = Math.max(m, error(U0 + ((U1 - U0) * i) / N, V0 + ((V1 - V0) * j) / N));
    return m;
  }, []);

  const th = (turn * Math.PI) / 180;
  const cu = (U0 + U1) / 2;
  const cv = (V0 + V1) / 2;
  const proj = (u: number, v: number, z: number) => {
    const x = u - cu;
    const y = v - cv;
    const X = x * Math.cos(th) - y * Math.sin(th);
    const Y = x * Math.sin(th) + y * Math.cos(th);
    return {
      x: W / 2 + SCALE * X,
      y: H / 2 + 70 - SCALE * Y * TILT - (z / zMax) * HEIGHT * Math.sqrt(1 - TILT * TILT),
      depth: Y,
    };
  };

  // The mesh: one shaded quad per cell, farthest first.
  const quads = useMemo(() => {
    const out: { d: string; depth: number; fill: string; u: number; v: number }[] = [];
    const du = (U1 - U0) / N;
    const dv = (V1 - V0) / N;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const u = U0 + du * i;
        const v = V0 + dv * j;
        const c = [
          [u, v],
          [u + du, v],
          [u + du, v + dv],
          [u, v + dv],
        ].map(([a, b]) => proj(a!, b!, error(a!, b!)));
        const zc = error(u + du / 2, v + dv / 2);
        // Light from the viewer's upper left: shade by the slope across the cell.
        const [gu, gv] = grad(u + du / 2, v + dv / 2);
        const lit = Math.max(-1, Math.min(1, (-gu * Math.cos(th) + gv * Math.sin(th)) / 3));
        // Greyscale: lighter with height, darker on slopes facing away.
        const t = Math.sqrt(zc / zMax);
        const ink = Math.round(Math.max(8, Math.min(88, 72 - 52 * t - 16 * lit)));
        out.push({
          d: `M ${c.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`,
          depth: c.reduce((s, p) => s + p.depth, 0) / 4,
          fill: `color-mix(in srgb, var(--ink-900) ${ink}%, var(--surface))`,
          u: u + du / 2,
          v: v + dv / 2,
        });
      }
    return out.sort((a, b) => b.depth - a.depth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, zMax]);

  const [u, v] = path[path.length - 1]!;
  const here = proj(u, v, error(u, v));
  const tests = (
    [
      [TEST, 0],
      [-TEST, 0],
      [0, TEST],
      [0, -TEST],
    ] as const
  ).map(([du, dv]) => {
    const e = error(u + du, v + dv);
    return { to: proj(u + du, v + dv, e), lower: e < error(u, v), e };
  });
  const steepest = tests.reduce((best, t) => (t.e < best.e ? t : best), tests[0]!);
  const [gu, gv] = grad(u, v);
  const next = stepFrom(u, v);
  const atBottom = Math.hypot(gu, gv) < 0.02;

  const take = (n: number) =>
    setPath((p) => {
      const out = [...p];
      for (let k = 0; k < n; k++) {
        const [a, b] = out[out.length - 1]!;
        const [g1, g2] = grad(a, b);
        if (Math.hypot(g1, g2) < 0.02) break;
        out.push(stepFrom(a, b));
      }
      return out;
    });

  return (
    <Panel title={LANDSCAPE_PANEL.title} standfirst={LANDSCAPE_PANEL.standfirst} note={LANDSCAPE_PANEL.note}>
      <div className="bp-controls">
        <Button size="sm" variant="primary" disabled={atBottom} onClick={() => take(1)}>
          {LANDSCAPE_PANEL.step}
        </Button>
        <Button size="sm" variant="subtle" disabled={atBottom} onClick={() => take(300)}>
          {LANDSCAPE_PANEL.run}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => setPath([START])}>
          {LANDSCAPE_PANEL.reset}
        </Button>
      </div>

      <div className="bp-land">
        <svg
          className="bp-land__fig"
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label="An error landscape over two weights, drawn in 3D, with the walker's steps down into the valley."
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, turn, moved: false };
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            if (Math.abs(dx) > 4) d.moved = true;
            if (d.moved) setTurn(d.turn + dx * 0.4);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (d && !d.moved) {
              // A click, not a drag: stand on the cell under the pointer.
              const el = document.elementFromPoint(e.clientX, e.clientY) as SVGElement | null;
              const cu2 = el?.dataset.u;
              const cv2 = el?.dataset.v;
              if (cu2 && cv2) setPath([[parseFloat(cu2), parseFloat(cv2)]]);
            }
          }}
        >
          {quads.map((q, i) => (
            <path key={i} d={q.d} style={{ fill: q.fill }} className="bp-land__cell" data-u={q.u} data-v={q.v} />
          ))}

          {/* The walker's footsteps, and where they stand. */}
          {path.length > 1 && (
            <polyline
              className="bp-land__path"
              points={path
                .map(([a, b]) => {
                  const p = proj(a, b, error(a, b));
                  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                })
                .join(" ")}
            />
          )}
          {path.slice(0, -1).map(([a, b], i) => {
            const p = proj(a, b, error(a, b));
            return <circle key={i} cx={p.x} cy={p.y} r={3} className="bp-land__foot" />;
          })}

          {/* Four test steps, then the step the walker will take. */}
          {!atBottom &&
            tests.map((t, i) => (
              <line
                key={i}
                x1={here.x}
                y1={here.y}
                x2={t.to.x}
                y2={t.to.y}
                className={`bp-land__test ${t.lower ? "bp-land__test--down" : "bp-land__test--up"}${t === steepest ? " is-steepest" : ""}`}
              />
            ))}
          {!atBottom && (
            <line
              x1={here.x}
              y1={here.y}
              x2={proj(next[0], next[1], error(next[0], next[1])).x}
              y2={proj(next[0], next[1], error(next[0], next[1])).y}
              className="bp-land__next"
              markerEnd="url(#bp-land-arrow)"
            />
          )}
          <defs>
            <marker id="bp-land-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" className="bp-land__arrowhead" />
            </marker>
          </defs>
          <circle cx={here.x} cy={here.y} r={6} className="bp-land__walker" />

          <AxisLabels proj={proj} />
        </svg>

        <div className="bp-land__side">
          <Readout label={LANDSCAPE_PANEL.errorLabel}>
            <span className="bp-big">{fmt(error(u, v), 3)}</span>
          </Readout>
          <Readout label={LANDSCAPE_PANEL.stepsLabel}>
            <span className="bp-big">{path.length - 1}</span>
          </Readout>
          <div className="bp-legend">
            <span className="bp-legend__row">
              <span className="bp-legend__line bp-legend__line--down" /> ground drops
            </span>
            <span className="bp-legend__row">
              <span className="bp-legend__line bp-legend__line--up" /> ground rises
            </span>
            <span className="bp-legend__row">
              <span className="bp-legend__line bp-legend__line--next" /> the step taken
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AxisLabels({ proj }: { proj: (u: number, v: number, z: number) => { x: number; y: number } }) {
  // Each weight's name beside the middle of the edge it runs along.
  const a = proj((U0 + U1) / 2, V0 - 0.6, 0);
  const b = proj(U0 - 0.6, (V0 + V1) / 2, 0);
  const top = proj(U0, V1, 0);
  return (
    <g>
      <text x={a.x} y={a.y + 14} className="fig-label" textAnchor="middle">
        {LANDSCAPE_PANEL.w1}
      </text>
      <text x={b.x} y={b.y + 14} className="fig-label" textAnchor="middle">
        {LANDSCAPE_PANEL.w2}
      </text>
      <text x={top.x} y={top.y - HEIGHT * 0.6} className="fig-label" textAnchor="middle">
        {LANDSCAPE_PANEL.height} ↑
      </text>
    </g>
  );
}
