// The corridor: a sentence laid out as a row of pellets, and a Pac-Man who
// eats them one at a time. He can see the pellet in front of him and nothing
// behind — what he has eaten is gone. The only thing he carries forward is
// what is in him: one vector, redrawn above his head after every word.
//
// That is the whole of a recurrent network, and the figure is built so the
// student can check it by eye: the trail of strips above the track is the
// sequence of states, one per word, and the little meter under each strip is
// the same readout the network gives at the end, asked early.
//
// Pieces are exported so the LSTM and "lights off" panels can draw the same
// corridor with different things carried.

import type { ReactNode } from "react";
import { sign } from "../transformers/draw.js";

export const COL = 64; // one word
export const X0 = 40; // Pac-Man's starting square, before any gutter
export const TRACK_H = 44;
const PAC_R = 15;
export const PAC_FILL = "#f2c230";

/** A vertical strip of signed numbers, the gallery's vector glyph. */
export function VStrip({
  v,
  bound,
  x,
  y,
  cell = 5,
  thick = 10,
  faded = false,
}: {
  v: Float32Array;
  bound: number;
  x: number;
  y: number;
  cell?: number;
  thick?: number;
  faded?: boolean;
}) {
  return (
    <g transform={`translate(${x - thick / 2}, ${y})`} opacity={faded ? 0.35 : 1}>
      {Array.from(v, (val, d) => (
        <rect key={d} x={0} y={d * cell} width={thick} height={cell - 1} style={{ fill: sign(val / bound) }} />
      ))}
    </g>
  );
}

/** A vertical strip of 0..1 values (a gate), shaded surface → accent. */
export function GateStrip({
  v,
  x,
  y,
  cell = 5,
  thick = 10,
  hot,
}: {
  v: Float32Array;
  x: number;
  y: number;
  cell?: number;
  thick?: number;
  /** Index to outline — the unit the page is following. */
  hot?: number;
}) {
  return (
    <g transform={`translate(${x - thick / 2}, ${y})`}>
      {Array.from(v, (val, d) => (
        <rect
          key={d}
          x={0}
          y={d * cell}
          width={thick}
          height={cell - 1}
          style={{
            fill: `color-mix(in srgb, var(--accent) ${Math.round(Math.max(0, Math.min(1, val)) * 92)}%, var(--surface))`,
          }}
        />
      ))}
      {hot !== undefined && (
        <rect className="rn-gate__hot" x={-1.5} y={hot * cell - 1.5} width={thick + 3} height={cell + 2} />
      )}
    </g>
  );
}

/** The readout as a little meter: how sure of "positive" the network is.
 *  Fills right of centre for positive, left for negative. */
export function Meter({ p, x, y, w = 46 }: { p: number; x: number; y: number; w?: number }) {
  const positive = p >= 0.5;
  const len = Math.abs(p - 0.5) * w;
  return (
    <g transform={`translate(${x - w / 2}, ${y})`}>
      <rect className="rn-meter__track" x={0} y={0} width={w} height={6} rx={3} />
      <rect
        className={positive ? "rn-meter__fill rn-meter__fill--pos" : "rn-meter__fill rn-meter__fill--neg"}
        x={positive ? w / 2 : w / 2 - len}
        y={0}
        width={len}
        height={6}
        rx={3}
      />
      <line className="rn-meter__mid" x1={w / 2} y1={-2} x2={w / 2} y2={8} />
      <text
        className={`rn-meter__label${positive ? " rn-meter__label--pos" : " rn-meter__label--neg"}`}
        x={w / 2}
        y={18}
        textAnchor="middle"
      >
        {positive ? `${Math.round(p * 100)}% good` : `${Math.round((1 - p) * 100)}% bad`}
      </text>
    </g>
  );
}

/** Pac-Man, facing right, mouth open by `open` (0..1). */
export function PacMan({
  x,
  y,
  open,
  r = PAC_R,
  dim = false,
}: {
  x: number;
  y: number;
  open: number;
  r?: number;
  dim?: boolean;
}) {
  const a = 0.12 + open * 0.55; // half-angle of the mouth, radians
  const x1 = x + r * Math.cos(a);
  const y1 = y - r * Math.sin(a);
  const x2 = x + r * Math.cos(-a);
  const y2 = y - r * Math.sin(-a);
  return (
    <g opacity={dim ? 0.55 : 1}>
      <path d={`M ${x} ${y} L ${x1} ${y1} A ${r} ${r} 0 1 0 ${x2} ${y2} Z`} fill={PAC_FILL} />
      <circle cx={x + r * 0.25} cy={y - r * 0.55} r={1.8} fill="#1c1917" />
    </g>
  );
}

export function Track({ x0, x1, y, dark = false }: { x0: number; x1: number; y: number; dark?: boolean }) {
  return (
    <rect
      className={dark ? "rn-track rn-track--dark" : "rn-track"}
      x={x0}
      y={y - TRACK_H / 2}
      width={x1 - x0}
      height={TRACK_H}
      rx={TRACK_H / 2}
    />
  );
}

export interface CorridorProps {
  tokens: string[];
  /** How many words have been eaten, 0..tokens.length (+ beyond). */
  step: number;
  onStep?: (t: number) => void;
  /** Indices of words the model does not know: drawn hollow. */
  unknown?: Set<number>;
  /** Draws what is carried after word t (0 = the start), centred on x. */
  above?: (t: number, x: number) => ReactNode;
  /** Height reserved above the track for `above`. */
  aboveH?: number;
  /** Row labels for the `above` region, drawn in a left gutter. */
  labels?: { y: number; text: string }[];
  /** Extra columns after the last word — the dark stretch of the lights-off panel. */
  beyond?: number;
  ariaLabel: string;
}

/** The corridor itself. */
export function Corridor({
  tokens,
  step,
  onStep,
  unknown,
  above,
  aboveH = 0,
  labels,
  beyond = 0,
  ariaLabel,
}: CorridorProps) {
  const T = tokens.length;
  const pad = labels && labels.length ? 118 : 0;
  const colX = (t: number) => pad + X0 + t * COL;
  const trackY = aboveH + 8 + TRACK_H / 2;
  const h = trackY + TRACK_H / 2 + 34;
  const last = colX(T + beyond);
  const w = last + COL / 2 + 10;
  return (
    <svg className="tf-fig rn-corridor" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ariaLabel}>
      {labels?.map((l) => (
        <text key={l.text} className="fig-label" x={pad - 8} y={l.y} textAnchor="end">
          {l.text}
        </text>
      ))}
      <Track x0={colX(0) - COL / 2} x1={colX(T) + COL / 2} y={trackY} />
      {beyond > 0 && <Track x0={colX(T) + COL / 2 - 2} x1={last + COL / 2} y={trackY} dark />}

      {tokens.map((tok, k) => {
        const t = k + 1;
        const x = colX(t);
        const eaten = t <= step;
        const current = t === step;
        return (
          <g key={`${tok}-${k}`} className={onStep ? "rn-pellet rn-pellet--click" : "rn-pellet"} onClick={() => onStep?.(t)}>
            <rect x={x - COL / 2} y={trackY - TRACK_H / 2 - 4} width={COL} height={TRACK_H + 36} fill="transparent" />
            {!eaten && <circle className={unknown?.has(k) ? "rn-dot rn-dot--unknown" : "rn-dot"} cx={x} cy={trackY} r={5} />}
            <text
              className={`rn-word${current ? " rn-word--now" : eaten ? " rn-word--eaten" : ""}${unknown?.has(k) ? " rn-word--unknown" : ""}`}
              x={x}
              y={trackY + TRACK_H / 2 + 20}
              textAnchor="middle"
            >
              {tok}
            </text>
          </g>
        );
      })}
      {Array.from({ length: beyond }, (_, k) => (
        <text key={`b-${k}`} className="rn-word rn-word--dark" x={colX(T + k + 1)} y={trackY + TRACK_H / 2 + 20} textAnchor="middle">
          —
        </text>
      ))}

      {above &&
        Array.from({ length: T + beyond + 1 }, (_, t) =>
          t <= step ? <g key={`a-${t}`}>{above(t, colX(t))}</g> : null,
        )}

      <g className="rn-pacmove" style={{ transform: `translate(${colX(step)}px, ${trackY}px)` }}>
        <PacMan x={0} y={0} open={step % 2 === 0 ? 0.9 : 0.3} dim={step > T} />
      </g>
    </svg>
  );
}
