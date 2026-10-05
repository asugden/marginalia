// The complexity line: one axis, drawn the way it goes on a whiteboard — a
// dot on the left, an arrow on the right, the model families ticked off along
// it by complexity, and a note at the arrow's end saying what grows that way.
//
// Same voice as the pipeline figure above it (shared/figure.css text, muted
// hairlines, one accent), drawn 1:1 in a fixed viewBox so every label is placed
// rather than flowed. Underneath the axis, a second, thinner bar carries
// interpretability: clear on the left, darkening to black on the right — the
// same open-box / black-box split as the pipeline's `model` square.
//
// Below the figure, two sliders ask "how many features, how many rows?" and
// the answer is shown ON the line: the family it lands on takes the accent.
// Nothing scrolls, pins or reveals; the whole line is there to be looked at.
//
// Everything clickable is inside the diagram — family labels and model names
// are the links to their examples.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../shared/controls.css";
import "../shared/figure.css";
import { AXIS_QUANTITIES, FAMILIES, OPEN_BOX_EDGE, classify, type Family } from "./taxonomy.js";

const W = 1132;
const X0 = 28;
const X1 = 1104;
const Y = 128;
const STRIP_Y = Y + 124;
const H = STRIP_Y + 30;
const MODEL_PITCH = 16;

const xFor = (pos: number) => X0 + pos * (X1 - X0);

// The axis is a shape, not a stroke: a hairline at the dot that swells steadily
// to the right — everything grows that way, so the line does too — and ends in
// a swept, notched head.
const NECK = X1 - 30; // where the shaft meets the head
const T0 = 1; // half-thickness at the dot
const T1 = 5; // half-thickness at the neck
const halfAt = (x: number) => T0 + ((x - X0) / (NECK - X0)) * (T1 - T0);
const AXIS_PATH = [
  `M ${X0} ${Y - T0}`,
  `L ${NECK} ${Y - T1}`,
  `L ${X1 - 40} ${Y - 17}`,
  `Q ${X1 - 16} ${Y - 7} ${X1} ${Y}`,
  `Q ${X1 - 16} ${Y + 7} ${X1 - 40} ${Y + 17}`,
  `L ${NECK} ${Y + T1}`,
  `L ${X0} ${Y + T0}`,
  "Z",
].join(" ");

export function ComplexityLine() {
  const [features, setFeatures] = useState(12);
  const [rows, setRows] = useState(800);
  const verdict = useMemo(() => classify(features, rows), [features, rows]);

  return (
    <>
      <div className="ovw-line__scroll">
        <svg
          className="ovw-line__fig"
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label="Models arranged by complexity on one axis, from regression at the simple end through support vector machines and naive Bayes, decision tree models, to neural networks at the complex end. Cost, training rows, parameters and feature count all grow to the right, and interpretability falls from open box to black box."
        >
          <defs>
            {/* Interpretability is lost gradually past the edge, not at a cliff. */}
            <linearGradient id="ovw-line-box" x1="0" x2="1" y1="0" y2="0">
              <stop offset={0} className="ovw-line__stop-open" />
              <stop offset={OPEN_BOX_EDGE} className="ovw-line__stop-open" />
              <stop offset={1} className="ovw-line__stop-black" />
            </linearGradient>
          </defs>

          {/* What grows to the right, stacked over the arrowhead. */}
          <text className="fig-label" x={X1} y={Y - 106} textAnchor="end">
            grows to the right
          </text>
          {AXIS_QUANTITIES.map((q, i) => (
            <text key={q} className="fig-num" x={X1} y={Y - 86 + i * 15} textAnchor="end">
              {q}
            </text>
          ))}

          {/* The axis: the dot it starts from, and the swelling shaft and head. */}
          <circle className="ovw-line__dot" cx={X0} cy={Y} r={5} />
          <path className="ovw-line__shaft" d={AXIS_PATH} />

          {/* Where open box ends, carried down to the strip. */}
          <line className="ovw-line__edge" x1={xFor(OPEN_BOX_EDGE)} y1={Y + 14} x2={xFor(OPEN_BOX_EDGE)} y2={STRIP_Y - 4} />

          {FAMILIES.map((f) => (
            <FamilyMark key={f.id} family={f} on={f.id === verdict.family.id} />
          ))}

          {/* Interpretability, as a bar under the axis. */}
          <rect className="ovw-line__strip" x={X0} y={STRIP_Y - 3} width={X1 - X0} height={6} rx={3} />
          <text className="fig-label" x={X0} y={STRIP_Y + 20}>
            open box
          </text>
          <text className="fig-label" x={X1} y={STRIP_Y + 20} textAnchor="end">
            black box
          </text>
        </svg>
      </div>

      <div className="ex-controls ovw-sizer">
        <Field label="Features" value={features} range={FEATURE_RANGE} onChange={setFeatures} />
        <Field label="Rows" value={rows} range={ROW_RANGE} onChange={setRows} />
        <p className="ovw-sizer__verdict">
          {(verdict.bumped && verdict.band.verdictFromRows) || verdict.band.verdict}
        </p>
        <p className="ovw-sizer__floor">
          {verdict.family.label} wants about <b>{verdict.neededRows.toLocaleString()}+ rows</b>
          {verdict.starved && <span className="ovw-sizer__short"> — you have {rows.toLocaleString()}</span>}
        </p>
      </div>
    </>
  );
}

/** A family's tick on the axis, its name under it, and its models under that. */
function FamilyMark({ family: f, on }: { family: Family; on: boolean }) {
  const x = xFor(f.pos);
  // Each column hangs off its tick toward the side with room (see taxonomy.ts).
  const anchor = f.lean === "right" ? "start" : "end";
  const tx = f.lean === "right" ? x - 3 : x + 3;
  // Below the line: name, then models downward. Above: name nearest the line,
  // models stacking upward away from it.
  const above = f.side === "above";
  const nameY = above ? Y - 22 : Y + 32;
  const modelY = (i: number) => (above ? Y - 42 - i * MODEL_PITCH : Y + 52 + i * MODEL_PITCH);
  const name = (
    <text className={`ovw-line__fam${on ? " fig-on" : ""}`} x={tx} y={nameY} textAnchor={anchor}>
      {f.label}
    </text>
  );

  return (
    <g>
      {on ? (
        <circle className="ovw-line__pick" cx={x} cy={Y} r={halfAt(x) + 4} />
      ) : (
        <line className="ovw-line__tick" x1={x} y1={Y - halfAt(x) - 6} x2={x} y2={Y + halfAt(x) + 6} />
      )}
      {f.slug ? (
        <Link to={`/examples/${f.slug}`} className="fig-link">
          {name}
        </Link>
      ) : (
        name
      )}
      {f.models.map((m, i) => {
        const text = (
          <text
            className={`fig-word${m.slug ? " ovw-line__model" : ""}`}
            x={tx}
            y={modelY(i)}
            textAnchor={anchor}
          >
            {m.name}
          </text>
        );
        return m.slug ? (
          <Link key={m.name} to={`/examples/${m.slug}`} className="fig-link">
            {text}
          </Link>
        ) : (
          <g key={m.name}>{text}</g>
        );
      })}
    </g>
  );
}

/**
 * Log-scale positions for the two sliders. Both quantities span several orders
 * of magnitude and the interesting range sits at the bottom — on a linear
 * track, everything from 1 to 100 features would be crushed into the first tenth
 * of the slider and undraggable.
 */
const FEATURE_RANGE = { min: 1, max: 1000 };
const ROW_RANGE = { min: 10, max: 1000000 };

const toLog = (v: number, r: { min: number; max: number }) =>
  ((Math.log(clamp(v, r.min, r.max)) - Math.log(r.min)) /
    (Math.log(r.max) - Math.log(r.min))) *
  1000;
const fromLog = (p: number, r: { min: number; max: number }) =>
  Math.round(Math.exp(Math.log(r.min) + (p / 1000) * (Math.log(r.max) - Math.log(r.min))));

function Field({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  onChange: (n: number) => void;
}) {
  return (
    <label className="ex-controls__row">
      <span className="ex-controls__label">{label}</span>
      <input
        className="ovw-sizer__slider"
        type="range"
        min={0}
        max={1000}
        step={1}
        value={toLog(value, range)}
        aria-label={label}
        onChange={(e) => onChange(fromLog(Number(e.target.value), range))}
      />
      <input
        className="ovw-sizer__num"
        type="number"
        min={range.min}
        max={range.max}
        value={value}
        aria-label={`${label}, exact`}
        onChange={(e) => onChange(clamp(Number(e.target.value), range.min, range.max))}
      />
    </label>
  );
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
