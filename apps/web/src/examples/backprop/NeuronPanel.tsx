// Panel 3: the activation example's neuron, given a target — and a price.
//
// Drawn with that example's own parts (tiles, weight pills, Σ node, ReLU
// plot, output) and its starting numbers, so it reads as the same neuron.
// The weights are the only handles: inputs, bias and target stay put.
//
//   drag a weight pill   the output and error follow
//   the squares          beside each weight, a square whose AREA is how far
//                        that weight has moved from the start, squared; the
//                        total change is their sum
//   your cheapest fix    the lowest total change the reader has found that
//                        puts the output on the target
//   backprop's fix       one button moves every weight at once, each in
//                        proportion to its input; dashed squares mark it
//
// Why this is the gradient, honestly: on ReLU's "on" side this neuron is a
// straight line in its weights, so the cheapest exact fix (least total
// squared change) points along the inputs, which is the gradient's direction;
// scaling it to land on the target gives Δw = (target − output) · x / |x|².
// From the start that costs 0.198. Moving one weight alone costs 0.31, 0.69
// or 2.78. A drag that brings the output within SNAP of the target snaps the
// dragged weight to the exact value that hits it, so the target is easy to
// land on and every recorded fix is an exact one: none can look cheaper than
// backprop's through rounding.

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/index.js";
import { act, slope } from "../activation/act.js";
import { ArrowDefs, Neuron, Pill, fmt as afmt, pathOf } from "../activation/draw.js";
import { LEARNED_NEG, LEARNED_POS, input, value } from "../shared/palette.js";
import { NEURON_PANEL } from "./content.js";
import { Panel, Readout, fmt } from "./ui.js";

// The activation example's starting neuron.
const XS = [0.9, 0.3, 0.6];
const WS0 = [0.8, -1.4, 0.5];
const BIAS = -0.1;
const TARGET = 1;
/** How close the output must come before the dragged weight snaps onto the
 *  target. */
const SNAP = 0.05;
/** Exact, up to float noise, once snapped. */
const ON_TARGET = 1e-6;

const W = 600;
const H = 664;
const CX = 300;
const Y_IN = 58;
// Room between the inputs and the sum for each weight's change square,
// which sits above its pill.
const Y_SUM = 270;
const SUM_NODE = 56;
const PX0 = 170;
const PW = 260;
const PY0 = 336;
const PH = 140;
const Y_OUT = 544;
const OUT_NODE = 44;
const TILE = 40;
const TILE_RX = 10;
// Wide enough apart that the pills (with their ◂ ▸ handles) and the squares
// above them never touch their neighbours.
const INPUT_X = [CX - 170, CX, CX + 170];
/** How far down each connection its pill sits (0 = input, 1 = sum). */
const PILL_AT = 0.45;
/** Gap between a pill's top and the bottom of its square. */
const SQUARE_GAP = 15;
const Z_MAX = 4;
const Y_RANGE: [number, number] = [-0.8, Z_MAX];
/** A change of 1 draws a square this many units on a side. */
const SQUARE = 40;
const SQUARE_CAP = 52;

const px = (z: number) => PX0 + ((z + Z_MAX) / (2 * Z_MAX)) * PW;
const py = (y: number) => PY0 + PH - ((y - Y_RANGE[0]) / (Y_RANGE[1] - Y_RANGE[0])) * PH;
const CURVE: [number, number][] = Array.from({ length: 81 }, (_, i) => {
  const z = -Z_MAX + (2 * Z_MAX * i) / 80;
  return [px(z), py(act("relu", z))];
});

function forward(ws: number[]) {
  const z = XS.reduce((s, x, i) => s + x * ws[i]!, BIAS);
  const out = act("relu", z);
  return { z, out, err: (out - TARGET) ** 2 };
}
const cost = (ws: number[]) => ws.reduce((s, w, i) => s + (w - WS0[i]!) ** 2, 0);

// Backprop's fix from the start: every weight moves along its input, scaled
// so the output lands exactly on the target.
const START = forward(WS0);
const XX = XS.reduce((s, x) => s + x * x, 0);
const BACKPROP = WS0.map((w, i) => w + ((TARGET - START.out) * XS[i]!) / XX);
const BACKPROP_COST = cost(BACKPROP);

export function NeuronPanel() {
  const [ws, setWs] = useState(WS0);
  const [best, setBest] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const drag = useRef<{ i: number; x: number; w0: number } | null>(null);
  const f = forward(ws);
  const total = cost(ws);
  const onTarget = Math.abs(f.out - TARGET) < ON_TARGET;
  const maxW = Math.max(1, ...ws.map(Math.abs));

  // Keep the cheapest on-target fix the reader has reached by hand.
  useEffect(() => {
    if (onTarget && !isBackprop(ws)) setBest((b) => (b == null || total < b ? total : b));
  }, [onTarget, total, ws]);

  const onDown = (i: number) => (e: React.PointerEvent<SVGGElement>) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { i, x: e.clientX, w0: ws[i]! };
    setActive(i);
  };
  const onMove = (e: React.PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    // A hundred screen pixels move a weight by one, whatever the figure's size.
    const svg = (e.currentTarget as SVGGElement).ownerSVGElement!;
    const scale = svg.getBoundingClientRect().width / W;
    const w = Math.max(-3, Math.min(3, d.w0 + (e.clientX - d.x) / (100 * scale)));
    setWs((cur) => {
      const next = cur.map((v, k) => (k === d.i ? Math.round(w * 100) / 100 : v));
      // Close enough: snap this weight to the value that hits the target
      // exactly (only on ReLU's "on" side, where the output answers it).
      const n = forward(next);
      if (n.z > 0 && Math.abs(n.out - TARGET) < SNAP) next[d.i] = next[d.i]! + (TARGET - n.out) / XS[d.i]!;
      return next;
    });
  };
  const onUp = () => {
    drag.current = null;
    setActive(null);
  };

  const zc = Math.max(-Z_MAX, Math.min(Z_MAX, f.z));

  return (
    <Panel title={NEURON_PANEL.title} standfirst={NEURON_PANEL.standfirst} note={NEURON_PANEL.note}>
      <div className="bp-controls">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setWs(BACKPROP);
            setShown(true);
          }}
        >
          {NEURON_PANEL.setBackprop}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => setWs(WS0)}>
          {NEURON_PANEL.reset}
        </Button>
      </div>
      <div className="bp-neuron">
        <svg
          className="bp-neuron__fig"
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label={`One neuron: inputs ${XS.join(", ")} times weights ${ws.map((w) => afmt(w)).join(", ")}, plus bias, through ReLU, giving ${afmt(f.out)} against a target of ${TARGET}.`}
        >
          <ArrowDefs id="bp-n-arrow" />

          {/* Connections with draggable weights, and each weight's change as a
              square: solid for where it is now, dashed for backprop's fix. */}
          {XS.map((_, i) => {
            const w = ws[i]!;
            const x1 = INPUT_X[i]!;
            const y1 = Y_IN + TILE / 2;
            const x2 = CX + (i - 1) * 14;
            const y2 = Y_SUM - SUM_NODE / 2;
            const ly = y1 + PILL_AT * (y2 - y1);
            const lx = x1 + PILL_AT * (x2 - x1);
            const side = Math.min(SQUARE_CAP, SQUARE * Math.abs(w - WS0[i]!));
            const ghost = Math.min(SQUARE_CAP, SQUARE * Math.abs(BACKPROP[i]! - WS0[i]!));
            // Squares stand on a common baseline just above the pill,
            // centred over it.
            const base = ly - SQUARE_GAP;
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  style={{
                    stroke: w >= 0 ? LEARNED_POS : LEARNED_NEG,
                    strokeWidth: 1 + (Math.abs(w) / maxW) * 4,
                    opacity: 0.3 + (Math.abs(w) / maxW) * 0.65,
                  }}
                  strokeLinecap="round"
                />
                {side > 0.5 && <rect x={lx - side / 2} y={base - side} width={side} height={side} className="bp-cost" />}
                {shown && <rect x={lx - ghost / 2} y={base - ghost} width={ghost} height={ghost} className="bp-cost bp-cost--ghost" />}
                <g
                  className={`bp-drag${active === i ? " is-active" : ""}`}
                  onPointerDown={onDown(i)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                >
                  <Pill x={lx} y={ly} text={`◂ × ${afmt(w)} ▸`} className={`af-wlabel af-wlabel--${w < 0 ? "neg" : "pos"}`} />
                </g>
              </g>
            );
          })}

          {XS.map((x, i) => (
            <g key={`in${i}`}>
              <rect
                className="af-tile"
                x={INPUT_X[i]! - TILE / 2}
                y={Y_IN - TILE / 2}
                width={TILE}
                height={TILE}
                rx={TILE_RX}
                style={{ fill: input(x) }}
              />
              <text
                className="af-num"
                x={INPUT_X[i]}
                y={Y_IN + 4}
                textAnchor="middle"
                style={{ fill: x > 0.55 ? "var(--surface)" : "var(--text-strong)" }}
              >
                {afmt(x)}
              </text>
            </g>
          ))}

          {/* The sum, with its bias (fixed in this panel). */}
          <Neuron cx={CX} cy={Y_SUM} size={SUM_NODE} fill={value(zc / Z_MAX)} className="af-node af-node--big" />
          <text className="af-sigma" x={CX} y={Y_SUM + 9} textAnchor="middle">
            Σ
          </text>
          <Pill x={CX - SUM_NODE / 2 - 44} y={Y_SUM} text={`+ ${afmt(BIAS)}`} className="af-wlabel af-wlabel--neg" />
          <text className="fig-num" x={CX + SUM_NODE / 2 + 12} y={Y_SUM + 4}>
            = {afmt(f.z)}
          </text>
          <line className="af-flowline" x1={CX} y1={Y_SUM + SUM_NODE / 2 + 2} x2={CX} y2={PY0 - 4} markerEnd="url(#bp-n-arrow)" />

          {/* ReLU, with the sum marked on it and its slope there. */}
          <rect className="af-plot__frame" x={PX0} y={PY0} width={PW} height={PH} rx={4} />
          <line className="af-plot__axis" x1={PX0} y1={py(0)} x2={PX0 + PW} y2={py(0)} />
          <line className="af-plot__axis" x1={px(0)} y1={PY0} x2={px(0)} y2={PY0 + PH} />
          <path className="af-plot__fn" d={pathOf(CURVE)} />
          <line className="af-plot__guide" x1={px(zc)} y1={py(0)} x2={px(zc)} y2={py(act("relu", zc))} />
          <circle cx={px(zc)} cy={py(act("relu", zc))} r={5.5} className="af-node" style={{ fill: value(f.out / Z_MAX), strokeWidth: 1.5 }} />
          {/* On the rising side the curve runs up and to the right of the dot,
              so the label goes below and right of it; on the flat side,
              above. Kept inside the frame. */}
          <text
            className="fig-num"
            x={Math.min(px(zc) + 10, PX0 + PW - 64)}
            y={f.z > 0 ? Math.min(py(act("relu", zc)) + 18, PY0 + PH - 6) : py(0) - 10}
          >
            slope {afmt(slope("relu", f.z))}
          </text>
          <text className="fig-label" x={PX0 + 4} y={PY0 + 12}>
            relu
          </text>
          <line className="af-flowline" x1={CX} y1={PY0 + PH + 14} x2={CX} y2={Y_OUT - OUT_NODE / 2 - 4} markerEnd="url(#bp-n-arrow)" />

          {/* Output beside its target, and the error between them. */}
          <Neuron cx={CX} cy={Y_OUT} size={OUT_NODE} fill={value(f.out / Z_MAX)} rx={TILE_RX} />
          <text className="af-num" x={CX} y={Y_OUT + 4} textAnchor="middle">
            {afmt(f.out)}
          </text>
          <text className="fig-label" x={CX} y={Y_OUT + OUT_NODE / 2 + 14} textAnchor="middle">
            output
          </text>
          <rect
            className={`bp-target${onTarget ? " is-hit" : ""}`}
            x={CX + 120 - OUT_NODE / 2}
            y={Y_OUT - OUT_NODE / 2}
            width={OUT_NODE}
            height={OUT_NODE}
            rx={TILE_RX}
          />
          <text className="af-num" x={CX + 120} y={Y_OUT + 4} textAnchor="middle">
            {afmt(TARGET)}
          </text>
          <text className="fig-label" x={CX + 120} y={Y_OUT + OUT_NODE / 2 + 14} textAnchor="middle">
            {onTarget ? NEURON_PANEL.onTarget : NEURON_PANEL.targetLabel}
          </text>
          <text className="fig-num bp-errorline" x={CX + 60} y={H - 22} textAnchor="middle">
            {NEURON_PANEL.errorLabel} = ({afmt(f.out)} − {afmt(TARGET)})² = {fmt(f.err, 3)}
          </text>
        </svg>

        <div className="bp-neuron__side">
          <Readout label={NEURON_PANEL.costLabel}>
            <span className="bp-big">{total.toFixed(2)}</span>
            <CostBar value={total} />
          </Readout>
          <Readout label={NEURON_PANEL.yourFix}>
            <span className="bp-big">{best == null ? "·" : best.toFixed(2)}</span>
          </Readout>
          {shown && (
            <Readout label={NEURON_PANEL.backpropFix}>
              <span className="bp-big">{BACKPROP_COST.toFixed(2)}</span>
              <table className="bp-nudge">
                <tbody>
                  {XS.map((x, i) => (
                    <tr key={i}>
                      <th>input {afmt(x)}</th>
                      <td className="bp-nudge__d">
                        {BACKPROP[i]! - WS0[i]! >= 0 ? "+" : ""}
                        {fmt(BACKPROP[i]! - WS0[i]!, 3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Readout>
          )}
        </div>
      </div>
    </Panel>
  );
}

function isBackprop(ws: number[]): boolean {
  return ws.every((w, i) => Math.abs(w - BACKPROP[i]!) < 1e-9);
}

/** The total change as a bar, scaled so a cost of 1 fills it. */
function CostBar({ value }: { value: number }) {
  return (
    <span className="bp-costbar">
      <span className="bp-costbar__fill" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </span>
  );
}
