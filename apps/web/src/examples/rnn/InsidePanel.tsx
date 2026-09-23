// What is inside Pac-Man: one small dense layer, used again and again.
//
// Left, rolled up: a box with a loop from its output back to its input. That
// is how recurrent networks are drawn in papers, and it is the same picture as
// Pac-Man carrying something forward. Right, unrolled: the same box copied
// once per word, each copy handing its state to the next. The weight swatches
// inside every copy are IDENTICAL — that is weight sharing, visible — and the
// chain is as deep as the sentence is long. A deep network whose depth is the
// number of words, with one layer's worth of weights.

import { Link } from "react-router-dom";
import { Swatch } from "../transformers/draw.js";
import { maxAbs, type Models, type PlainRun } from "./rnn.js";
import { PAC_FILL, VStrip } from "./Corridor.js";

const COLW = 96;
const BOX = 58;

export function InsidePanel({ models, run, tokens }: { models: Models; run: PlainRun; tokens: string[] }) {
  const m = models.plain;
  const T = tokens.length;
  const eBound = maxAbs(run.E);
  const hBound = maxAbs(run.hs);
  const X0 = 30;
  const yWord = 16;
  const yE = 26; // embedding strip, 8 × 6 = 48 tall
  const yBox = 100;
  const yWire = yBox + BOX / 2;
  const yState = yWire - 30; // 12 × 5 = 60 tall, centred on the wire
  const h = yBox + BOX + 46;
  const w = X0 + T * COLW + 30;

  return (
    <div className="rn-inside">
      <svg className="tf-fig rn-loop" viewBox="0 0 200 190" width={200} height={190} role="img" aria-label="One box with a loop from its output back into its input: the recurrent network, rolled up.">
        <text className="fig-label" x={100} y={14} textAnchor="middle">
          rolled up
        </text>
        <text className="rn-word" x={100} y={40} textAnchor="middle">
          word t
        </text>
        <line className="rn-wire" x1={100} y1={46} x2={100} y2={70} markerEnd="url(#rn-arrow)" />
        <rect className="rn-box" x={40} y={72} width={120} height={BOX} rx={8} />
        <text className="tf-blk__label" x={100} y={98} textAnchor="middle">
          fully connected
        </text>
        <text className="tf-blk__sub" x={100} y={112} textAnchor="middle">
          multiply, add, tanh
        </text>
        <path className="rn-wire" d={`M 140 ${72 + BOX / 2} H 172 V 60 H 100`} markerEnd="url(#rn-arrow)" fill="none" />
        <text className="tf-stack__cap" x={176} y={100} textAnchor="start" transform={`rotate(90 176 100)`}>
          state, carried
        </text>
        <line className="rn-wire" x1={100} y1={72 + BOX} x2={100} y2={160} markerEnd="url(#rn-arrow)" />
        <text className="rn-word" x={100} y={176} textAnchor="middle">
          verdict
        </text>
        <circle cx={38} cy={72 + BOX / 2} r={11} fill={PAC_FILL} opacity={0.9} />
        <path d={`M 38 ${72 + BOX / 2} L 49 ${72 + BOX / 2 - 5} L 49 ${72 + BOX / 2 + 5} Z`} fill="var(--surface)" />
        <defs>
          <marker id="rn-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-stack__head" />
          </marker>
        </defs>
      </svg>

      <span className="rn-inside__eq">=</span>

      <div className="tf-figwrap rn-inside__chain">
        <svg className="tf-fig" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`The same box unrolled ${T} times, one per word, each passing its state to the next.`}>
          <text className="fig-label" x={X0} y={yWord - 6}>
            unrolled <tspan className="fig-label-sub">· one copy per word, {T} deep</tspan>
          </text>
          {run.E.map((e, k) => {
            const x = X0 + k * COLW + BOX / 2;
            const cx = x; // box centre
            const isLast = k === T - 1;
            const stateX = cx + BOX / 2 + 14;
            return (
              <g key={k}>
                <text className="rn-word" x={cx} y={yWord + 10} textAnchor="middle">
                  {tokens[k]}
                </text>
                <VStrip v={e} bound={eBound} x={cx} y={yE + 4} cell={6} thick={10} />
                <line className="rn-wire" x1={cx} y1={yE + 4 + 8 * 6 + 2} x2={cx} y2={yBox - 2} markerEnd="url(#rn-arrow)" />
                <rect className="rn-box" x={cx - BOX / 2} y={yBox} width={BOX} height={BOX} rx={8} />
                {/* the two weight matrices, identical in every copy */}
                <Swatch W={m.Wx} rows={m.H} cols={m.D} x={cx - BOX / 2 + 6} y={yBox + 6} cell={2} />
                <Swatch W={m.Wh} rows={m.H} cols={m.H} x={cx + 2} y={yBox + 6} cell={2} />
                <text className="tf-stack__cap" x={cx} y={yBox + BOX - 6} textAnchor="middle">
                  same weights
                </text>
                {/* state in from the left (zero at the start) */}
                {k === 0 ? (
                  <>
                    <line className="rn-wire" x1={cx - BOX / 2 - 22} y1={yWire} x2={cx - BOX / 2 - 2} y2={yWire} markerEnd="url(#rn-arrow)" />
                    <text className="tf-stack__cap" x={cx - BOX / 2 - 24} y={yWire + 3} textAnchor="end">
                      0
                    </text>
                  </>
                ) : null}
                {/* state out, drawn on the wire to the next copy */}
                <line className="rn-wire" x1={cx + BOX / 2} y1={yWire} x2={stateX - 7} y2={yWire} />
                <VStrip v={run.hs[k + 1]!} bound={hBound} x={stateX} y={yState} cell={5} thick={10} />
                {!isLast && (
                  <line className="rn-wire" x1={stateX + 7} y1={yWire} x2={cx + COLW - BOX / 2 - 2} y2={yWire} markerEnd="url(#rn-arrow)" />
                )}
                {isLast && (
                  <>
                    <line className="rn-wire" x1={stateX + 7} y1={yWire} x2={stateX + 26} y2={yWire} markerEnd="url(#rn-arrow)" />
                    <text className="rn-word rn-word--now" x={stateX + 30} y={yWire + 4} textAnchor="start">
                      {run.ps[T]! >= 0.5 ? `${Math.round(run.ps[T]! * 100)}% good` : `${Math.round((1 - run.ps[T]!) * 100)}% bad`}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="tf-readout">
        Every box is the <b>same</b> box: {m.H} neurons, the two weight matrices drawn inside
        it ({m.H}×{m.D} for the word, {m.H}×{m.H} for the carried state) are identical in every
        copy, and there are only <b>{(m.H * m.D + m.H * m.H + m.H).toLocaleString()}</b> numbers
        in it, plus {m.D} per word in the embedding table. Yet read left to right this is a{" "}
        <Link to="/examples/deep-neural-network">deep network</Link> {T} layers deep — one layer
        per word — and a longer sentence makes it deeper. That is the trick and the trouble of
        recurrence at once: any length of input, one layer's worth of weights, and a depth you do
        not get to choose.
      </p>
    </div>
  );
}
