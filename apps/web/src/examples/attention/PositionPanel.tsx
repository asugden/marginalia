// Positional encoding, drawn as clocks.
//
// Nothing on the page before this knows which word came first: every cell of
// the grid is computed from two words alone, and a weighted sum does not care
// what order it adds things in. So before anything runs, each word is handed
// a second vector saying WHERE it is, and the two are added. This panel is
// about that second vector — and about why the way it is written is clever.
//
// The sinusoidal encoding from the original paper is, literally, a set of
// clock hands turning at different speeds: each pair of components is the
// sine and cosine of an angle that grows with position, and each pair grows
// at half the rate of the one before. So the figure draws it as exactly that:
// one column per position, a stack of small clocks per column, the fast hand
// a quarter-turn per word, the next half as fast, and so on. Three things
// the clocks make obvious without a formula:
//
//   - every position gets a unique pattern of hands;
//   - neighbours look alike and distant positions do not;
//   - the shift from any position to the one k later is always the same set
//     of turns, so "the word just before me" is one pattern the model can
//     learn once and use anywhere.
//
// The bottom half adds it to the word: what + where = the vector that enters
// attention. A slider moves the word to a different position and the "what"
// half stays put while the sum changes.
//
// Honesty: the head on this page was fitted without positions, so this panel
// shows the input it WOULD receive, not a re-run. Real encodings use more and
// slower hands so they can count to thousands; modern models turn the hands
// inside the attention step instead of adding them, but the idea is the same.

import { useMemo, useState } from "react";
import { value } from "../shared/palette.js";
import type { AttentionRun } from "./attention.js";
import { cosine } from "./attention.js";
import { maxAbs } from "./AttentionGrid.js";

interface Props {
  run: AttentionRun;
  /** The word the page is following: its column is the selected one. */
  row: number;
}

const CLOCKS = 4; // hands drawn; the code itself has eDim/2 of them
const COL = 78;
const X0 = 168; // left gutter for the row labels
const R = 11; // clock radius
const CELL = 5; // one component of the position strip
const Y_NUM = 30;
const Y_WORD = 46;
const Y_CLOCK0 = 72;
const CLOCK_GAP = 28;

/** Hand angle (radians, clockwise from twelve) of hand k at position p:
 *  a quarter turn per word for the first hand, half that for the next. */
function angle(p: number, k: number): number {
  return (p * (Math.PI / 2)) / 2 ** k;
}

/** The position code: eDim/2 hands, each contributing (sin, cos). Scaled to
 *  unit length so it is the same size as the word vectors it is added to. */
export function positionCode(p: number, eDim: number): Float32Array {
  const hands = eDim / 2;
  const out = new Float32Array(eDim);
  const s = 1 / Math.sqrt(hands);
  for (let k = 0; k < hands; k++) {
    const a = angle(p, k);
    out[2 * k] = Math.sin(a) * s;
    out[2 * k + 1] = Math.cos(a) * s;
  }
  return out;
}

export function PositionPanel({ run, row }: Props) {
  const n = run.tokens.length;
  const eDim = run.E[0]?.length ?? 16;
  const sel = Math.min(row, n - 1);
  const word = run.tokens[sel]!;
  const [placeAt, setPlaceAt] = useState<number | null>(null);
  const at = placeAt ?? sel;

  const codes = useMemo(
    () => Array.from({ length: n }, (_, p) => positionCode(p, eDim)),
    [n, eDim],
  );
  const codeBound = maxAbs(codes);
  const stripLen = eDim * CELL;
  const w = X0 + n * COL + 10;
  const yStrip = Y_CLOCK0 + CLOCKS * CLOCK_GAP - 6;
  const h = yStrip + stripLen + 16;

  // The sum: what + where, for the selected word at its real position and at
  // the slider's.
  const E = run.E[sel]!;
  const here = add(E, codes[sel]!);
  const moved = add(E, codes[at]!);
  const sumBound = maxAbs([E, codes[at]!, moved]);
  const movedAlike = cosine(here, moved);

  return (
    <div className="at-pos">
      <div className="at-grid__scroll">
        <svg
          className="at-grid"
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          role="img"
          aria-label={`${n} positions, each with ${CLOCKS} clock hands turning at different speeds; the hands' angles are the position code, drawn beneath as a strip of numbers.`}
        >
          {/* gutter labels */}
          <text
            className="fig-label"
            x={X0 - 10}
            y={Y_NUM}
            textAnchor="end"
          >
            position
          </text>
          <text
            className="fig-label"
            x={X0 - 10}
            y={Y_WORD}
            textAnchor="end"
          >
            word
          </text>
          {[
            "one quarter turn per word",
            "one eigth turn",
            "one sixteenth",
            "one thirty-second",
          ].map((label, k) => (
            <text
              key={k}
              className="fig-label"
              x={X0 - 10}
              y={Y_CLOCK0 + k * CLOCK_GAP + 3}
              textAnchor="end"
            >
              {label}
            </text>
          ))}
          <text
            className="fig-note"
            x={X0 - 10}
            y={yStrip + 8}
            textAnchor="end"
          >
            The same position encoding,
          </text>
          <text
            className="fig-note"
            x={X0 - 10}
            y={yStrip + 20}
            textAnchor="end"
          >
            written as vectors.
          </text>

          {run.tokens.map((t, p) => {
            const x = X0 + p * COL;
            const cx = x + COL / 2;
            const isSel = p === sel;
            return (
              <g
                key={`${t}-${p}`}
                className={`at-pos__col${isSel ? " at-pos__col--on" : ""}`}
              >
                <text
                  className="at-pos__num"
                  x={cx}
                  y={Y_NUM}
                  textAnchor="middle"
                >
                  {p + 1}
                </text>
                <text
                  className="at-pos__word"
                  x={cx}
                  y={Y_WORD}
                  textAnchor="middle"
                >
                  {t}
                </text>
                {Array.from({ length: CLOCKS }, (_, k) => {
                  const cy = Y_CLOCK0 + k * CLOCK_GAP;
                  const a = angle(p, k);
                  return (
                    <g key={k}>
                      <circle className="at-pos__clock" cx={cx} cy={cy} r={R} />
                      <line
                        className="at-pos__tick"
                        x1={cx}
                        y1={cy - R}
                        x2={cx}
                        y2={cy - R + 3}
                      />
                      <line
                        className="at-pos__hand"
                        x1={cx}
                        y1={cy}
                        x2={cx + (R - 2.5) * Math.sin(a)}
                        y2={cy - (R - 2.5) * Math.cos(a)}
                      />
                      <circle
                        className="at-pos__pivot"
                        cx={cx}
                        cy={cy}
                        r={1.2}
                      />
                    </g>
                  );
                })}
                <g transform={`translate(${cx - 4.5}, ${yStrip})`}>
                  {Array.from(codes[p]!, (v, d) => (
                    <rect
                      key={d}
                      x={0}
                      y={d * CELL}
                      width={9}
                      height={CELL - 1}
                      style={{ fill: value(v / codeBound) }}
                    />
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── what + where ── */}
      <div className="at-pos__sum">
        <div className="at-pos__sumhead">
          <span>
            Put <b>{word}</b> at position
          </span>
          <input
            type="range"
            min={1}
            max={n}
            step={1}
            value={at + 1}
            onChange={(e) => setPlaceAt(parseInt(e.target.value, 10) - 1)}
            aria-label={`position for ${word}`}
          />
          <b className="at-pos__at">{at + 1}</b>
          {at !== sel && (
            <button
              type="button"
              className="at-pos__reset"
              onClick={() => setPlaceAt(null)}
            >
              back to {sel + 1}
            </button>
          )}
        </div>
        <svg
          className="at-grid"
          viewBox={`0 0 ${3 * stripLen + 240} 70`}
          width={3 * stripLen + 240}
          height={70}
          role="img"
          aria-label={`${word}'s word vector plus the code for position ${at + 1} equals the vector that enters attention.`}
        >
          {(
            [
              [E, `what: ${word}`, 10],
              [codes[at]!, `where: position ${at + 1}`, stripLen + 70],
              [moved, "what enters attention", 2 * stripLen + 130],
            ] as const
          ).map(([v, label, x]) => (
            <g key={label}>
              <text className="fig-label" x={x} y={22}>
                {label}
              </text>
              <g transform={`translate(${x}, 30)`}>
                {Array.from(v, (val, d) => (
                  <rect
                    key={d}
                    x={d * CELL}
                    y={0}
                    width={CELL - 1}
                    height={12}
                    style={{ fill: value(val / sumBound) }}
                  />
                ))}
              </g>
            </g>
          ))}
          <text
            className="tf-op at-pos__op"
            x={stripLen + 40}
            y={41}
            textAnchor="middle"
          >
            +
          </text>
          <text
            className="tf-op at-pos__op"
            x={2 * stripLen + 100}
            y={41}
            textAnchor="middle"
          >
            =
          </text>
        </svg>
      </div>
    </div>
  );
}

function add(a: Float32Array, b: Float32Array): Float32Array {
  return Float32Array.from(a, (v, i) => v + b[i]!);
}
