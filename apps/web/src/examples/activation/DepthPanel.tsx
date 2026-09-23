// Panel 3: why ReLU won.
//
// Two chains of single neurons, side by side, identical in everything but the
// activation: every layer has weight 1 and no bias. Move the input and watch
// how far the change travels. Down the sigmoid chain every value drifts to the
// same number (0.66) whatever you feed it, and the bar beside each neuron —
// how much that neuron moves when the input moves — shrinks by at least four
// times per layer, because a sigmoid's slope is never more than 1/4. Down the
// ReLU chain the change arrives intact.
//
// That bar is exactly the number training uses to decide how to adjust the
// earliest weights, which is why deep sigmoid networks barely trained and deep
// ReLU networks did. The page shows the bar; the note under the panel says
// what it is.

import { useState } from "react";
import { input, value } from "../shared/palette.js";
import { chain, type Act } from "./act.js";
import { Glyph, Neuron, fmt } from "./draw.js";

const W = 640;
const COLS: { kind: Act; name: string; cx: number }[] = [
  { kind: "sigmoid", name: "sigmoid", cx: 110 },
  { kind: "relu", name: "ReLU", cx: 410 },
];
const Y_HEAD = 22;
const Y_IN = 64;
const STEP = 40;
const BAR_X = 44; // from the column's centre
const BAR_W = 120;
const TILE = 34;

export function DepthPanel() {
  const [layers, setLayers] = useState(6);
  const [x, setX] = useState(0.8);
  const runs = COLS.map((c) => chain(c.kind, x, layers));
  const last = runs.map((r) => r[r.length - 1]!);

  return (
    <div className="af-layout">
      <aside className="af-side">
        <div className="af-box">
          <label className="af-slider af-slider--wide">
            <span>input</span>
            <input type="range" min={0.1} max={1} step={0.01} value={x} onChange={(e) => setX(parseFloat(e.target.value))} />
            <span className="af-slider__val">{fmt(x)}</span>
          </label>
          <label className="af-slider af-slider--wide">
            <span>layers</span>
            <input type="range" min={1} max={10} step={1} value={layers} onChange={(e) => setLayers(parseInt(e.target.value, 10))} />
            <span className="af-slider__val">{layers}</span>
          </label>
        </div>

        <div className="af-box" aria-live="polite">
          <span className="af-kicker">After {layers} {layers === 1 ? "layer" : "layers"}, moving the input moves the output</span>
          {COLS.map((c, i) => (
            <div key={c.kind} className="af-flow">
              <span className="af-flow__fn">{c.name}</span>
              <b className="af-big--value">{times(last[i]!.response)}</b>
            </div>
          ))}
        </div>
      </aside>

      <svg
        className="af-fig"
        viewBox={`0 0 ${W} ${Y_IN + (layers + 1) * STEP + 20}`}
        width={W}
        height={Y_IN + (layers + 1) * STEP + 20}
        role="img"
        aria-label={`Two chains of ${layers} neurons, one sigmoid and one ReLU, each layer with weight 1 and no bias. After ${layers} layers the sigmoid chain's output moves ${times(last[0]!.response)} as much as its input; the ReLU chain's moves ${times(last[1]!.response)}.`}
      >
        {COLS.map((c, ci) => {
          const run = runs[ci]!;
          return (
            <g key={c.kind}>
              <Glyph kind={c.kind} x={c.cx - 13} y={Y_HEAD - 11} />
              <text className="fig-row" x={c.cx + 20} y={Y_HEAD + 1}>
                {c.name}
              </text>
              <text className="fig-label" x={c.cx + BAR_X} y={Y_IN - 8}>
                moves with the input
              </text>

              {/* The wire down the chain: every weight is 1. */}
              <line className="af-chain__wire" x1={c.cx} y1={Y_IN + TILE / 2} x2={c.cx} y2={Y_IN + layers * STEP - 12} />

              <rect className="af-tile" x={c.cx - TILE / 2} y={Y_IN - TILE / 2} width={TILE} height={TILE} rx={9} style={{ fill: input(x) }} />
              <text className="fig-num" x={c.cx - TILE / 2 - 8} y={Y_IN + 4} textAnchor="end">
                {fmt(x)}
              </text>
              <Bar cx={c.cx} y={Y_IN} r={1} />

              {run.map((l, k) => {
                const y = Y_IN + (k + 1) * STEP;
                return (
                  <g key={k}>
                    <Neuron cx={c.cx} cy={y} fill={value(l.value)} />
                    <text className="fig-num" x={c.cx - 20} y={y + 4} textAnchor="end">
                      {fmt(l.value)}
                    </text>
                    <Bar cx={c.cx} y={y} r={l.response} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** How much this neuron moves per unit the input moves, as a bar and a
 *  number. Linear length, so the sigmoid chain's vanishing is literal. */
function Bar({ cx, y, r }: { cx: number; y: number; r: number }) {
  const dead = r < 0.01;
  return (
    <g>
      <rect className="af-chain__track" x={cx + BAR_X} y={y - 5} width={BAR_W} height={10} rx={5} />
      <rect className="af-chain__bar" x={cx + BAR_X} y={y - 5} width={Math.max(0, Math.min(1, r)) * BAR_W} height={10} rx={5} />
      <text className={`fig-num${dead ? " af-chain__resp--dead" : ""}`} x={cx + BAR_X + BAR_W + 8} y={y + 4}>
        {times(r)}
      </text>
    </g>
  );
}

/** A response as "×0.21", or in scientific form once it is too small to read. */
function times(r: number): string {
  if (r === 0) return "×0";
  if (r >= 0.01) return `×${r.toFixed(2)}`;
  const e = Math.floor(Math.log10(r));
  const m = r / 10 ** e;
  return `×${m.toFixed(1)}·10${sup(e)}`;
}

function sup(n: number): string {
  const map: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return String(n)
    .split("")
    .map((c) => map[c] ?? c)
    .join("");
}
