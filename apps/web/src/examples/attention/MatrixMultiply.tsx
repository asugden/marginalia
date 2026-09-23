// E × W → Q (or V), with the matrix actually drawn.
//
// The gap this fills: every other figure on the page shows the *outputs* of
// the three projections, so W_Q, W_K and W_V — the things that are actually
// learned, the things training changes — never appear. A student can come away
// having seen Q, K and V a dozen times without once seeing the matrix that
// produced them, which is exactly backwards: the vectors are transient, the
// matrix is the model.
//
// So the matrix is the centre of this figure. 8 × 16 is 128 cells, small
// enough to draw honestly at a readable size. Hovering an output component
// lights up the row of W and the E vector that produced it, and spells out
// the arithmetic underneath: one output number is one row of W dotted with E.
//
// Red positive, blue negative — the same convention the network examples use
// for weights.

import { useState } from "react";
import { learned, value } from "../shared/palette.js";

interface Props {
  /** The input embedding. */
  E: Float32Array;
  /** Row-major [rows x cols] weight matrix. */
  W: Float32Array;
  rows: number;
  cols: number;
  /** The result, W · E. */
  out: Float32Array;
  /** "Q" or "V" etc — what the output is called. */
  symbol: string;
  /** Subscript for the vectors, usually the token. */
  token: string;
  /** Plain-language gloss of what this projection is for. */
  question: string;
}

export function MatrixMultiply({
  E,
  W,
  rows,
  cols,
  out,
  symbol,
  token,
  question,
}: Props) {
  // Which output component (i.e. which row of W) is being examined.
  const [activeRow, setActiveRow] = useState<number | null>(null);

  const bound = (arr: Float32Array | number[]) => {
    let b = 0;
    for (let i = 0; i < arr.length; i++) {
      const a = Math.abs(arr[i]!);
      if (a > b) b = a;
    }
    return b || 1;
  };
  const wBound = bound(W);
  const eBound = bound(E);
  const oBound = bound(out);

  const r = activeRow;
  const terms =
    r === null
      ? null
      : Array.from(E, (e, c) => ({
          w: W[r * cols + c]!,
          e,
          p: W[r * cols + c]! * e,
        }));

  return (
    <div className="at-mm">
      <div className="at-mm__diagram">
        {/* W — the learned matrix, the point of this figure. */}
        <div className="at-mm__block">
          <div className="at-mm__blockhead">
            <span className="at-mm__sym">
              W<sub>{symbol}</sub>
            </span>
            <span className="at-mm__shape">
              {rows} × {cols}
            </span>
            <span className="at-mm__tag">learned</span>
          </div>
          <div
            className="at-mm__matrix"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            onMouseLeave={() => setActiveRow(null)}
          >
            {Array.from({ length: rows }, (_, row) =>
              Array.from({ length: cols }, (_, col) => (
                <span
                  key={`${row}-${col}`}
                  className={`at-mm__cell${
                    activeRow !== null && activeRow !== row
                      ? " at-mm__cell--dim"
                      : ""
                  }`}
                  style={{ background: learned(W[row * cols + col]! / wBound) }}
                  onMouseEnter={() => setActiveRow(row)}
                  title={`row ${row}, col ${col}: ${W[row * cols + col]!.toFixed(3)}`}
                />
              )),
            )}
          </div>
          <p className="at-mm__blockfoot">
            {rows * cols} numbers, shared by every token in every sentence
          </p>
        </div>

        <span className="at-mm__op">×</span>

        {/* E — the input. */}
        <div className="at-mm__block at-mm__block--vec">
          <div className="at-mm__blockhead">
            <span className="at-mm__sym">
              E<sub>{token}</sub>
            </span>
            <span className="at-mm__shape">{cols}</span>
          </div>
          <div className="at-mm__vector at-mm__vector--tall">
            {Array.from(E, (v, idx) => (
              <span
                key={idx}
                className="at-mm__vcell"
                style={{ background: value(v / eBound) }}
                title={`${idx}: ${v.toFixed(3)}`}
              />
            ))}
          </div>
          <p className="at-mm__blockfoot">looked up per word</p>
        </div>

        <span className="at-mm__op">=</span>

        {/* The result. */}
        <div className="at-mm__block at-mm__block--vec">
          <div className="at-mm__blockhead">
            <span className="at-mm__sym">
              {symbol}
              <sub>{token}</sub>
            </span>
            <span className="at-mm__shape">{rows}</span>
          </div>
          <div
            className="at-mm__vector at-mm__vector--tall"
            onMouseLeave={() => setActiveRow(null)}
          >
            {Array.from(out, (v, idx) => (
              <span
                key={idx}
                className={`at-mm__vcell at-mm__vcell--hot${
                  activeRow === idx ? " at-mm__vcell--on" : ""
                }`}
                style={{ background: value(v / oBound) }}
                onMouseEnter={() => setActiveRow(idx)}
                title={`${idx}: ${v.toFixed(3)}`}
              />
            ))}
          </div>
          <p className="at-mm__blockfoot">recomputed every pass</p>
        </div>
      </div>

      <div className="at-mm__explain">
        {r === null ? (
          <p className="at-mm__hint">
            <b>{question}</b> Hover a cell in{" "}
            <span className="at-mm__inline">
              {symbol}
              <sub>{token}</sub>
            </span>{" "}
            to see which row of W<sub>{symbol}</sub> produced it.
          </p>
        ) : (
          <>
            <p className="at-mm__hint">
              Component <b>{r}</b> of{" "}
              <span className="at-mm__inline">
                {symbol}
                <sub>{token}</sub>
              </span>{" "}
              is row <b>{r}</b> of W<sub>{symbol}</sub> dotted with E
              <sub>{token}</sub> the sum of {cols} multiplications
            </p>
          </>
        )}
      </div>
    </div>
  );
}
