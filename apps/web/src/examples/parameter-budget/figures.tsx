// The smaller figures on the counting page: the smallest models, the rounded
// neurons, and the copying panel's digits and bars. A parameter takes the
// learned scale (sage above zero, plum below), except where it belongs to a
// class (naive Bayes), where the class owns the hue (style.md §11).

import { Link } from "react-router-dom";
import type { Net } from "../mnist-mlp/net.js";
import { classHue, input, learned, VALUE_POS } from "../shared/palette.js";
import { COUNT_FILL } from "./network.js";
import {
  countLinear,
  countLogistic,
  countNaiveBayes,
  countSvm,
} from "./budget.js";

/** A stable pseudo-random value in −1..1 for tile i: the same squares every
 *  render, so adding a feature adds squares rather than reshuffling them. */
function jitter(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const f = x - Math.floor(x);
  const v = f * 2 - 1;
  // Keep every square visible: nothing closer to zero than ±0.3.
  return Math.sign(v || 1) * (0.3 + 0.7 * Math.abs(v));
}

// ── The smallest models ─────────────────────────────────────────────────

export const FEATURES = [
  "size",
  "beds",
  "baths",
  "age",
  "lot",
  "garage",
  "schools",
  "distance",
];

const T = 16; // tile side
const TG = 3; // gap between a class's two tiles

export function SmallModelsFigure({ features }: { features: number }) {
  const W = 740;
  const labelW = 170;
  const colW = 58;
  const rows: Array<{ title: string; sub: string; y: number; nb: boolean; to?: string }> = [
    { title: "linear regression", sub: "predicts a price", y: 34, nb: false },
    {
      title: "logistic regression",
      sub: "predicts yes or no",
      y: 84,
      nb: false,
    },
    {
      title: "support vector machine",
      sub: "predicts yes or no",
      y: 134,
      nb: false,
      to: "/examples/svm",
    },
    { title: "naive Bayes", sub: "predicts yes or no", y: 184, nb: true, to: "/examples/naive-bayes" },
  ];
  const H = 246;
  const colX = (i: number) => labelW + i * colW + colW / 2;
  const baseX = colX(features);
  const counts = [
    countLinear(features),
    countLogistic(features),
    countSvm(features),
    countNaiveBayes(features, 2),
  ];

  const tile = (key: string, cx: number, y: number, fill: string) => (
    <rect
      key={key}
      x={cx - T / 2}
      y={y}
      width={T}
      height={T}
      rx={2}
      fill={fill}
    />
  );

  return (
    <svg
      className="pb-svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Parameters of linear regression, logistic regression, a support vector machine and naive Bayes"
    >
      {FEATURES.slice(0, features).map((f, i) => (
        <text
          key={f}
          className="fig-label"
          x={colX(i)}
          y={12}
          textAnchor="middle"
        >
          {f}
        </text>
      ))}
      <text className="fig-label" x={baseX} y={12} textAnchor="middle">
        bias
      </text>
      <text className="fig-label" x={W} y={12} textAnchor="end">
        parameters
      </text>

      {rows.map((r, ri) => {
        const mid = r.nb ? r.y + T + TG / 2 : r.y + T / 2;
        return (
          <g key={r.title}>
            {r.to ? (
              <Link to={r.to} className="fig-link">
                <text className="fig-row" x={0} y={mid - 2}>
                  {r.title}
                </text>
              </Link>
            ) : (
              <text className="fig-row" x={0} y={mid - 2}>
                {r.title}
              </text>
            )}
            <text className="fig-label-sub" x={0} y={mid + 12}>
              {r.sub}
            </text>
            {r.nb ? (
              <>
                {Array.from({ length: features }, (_, i) =>
                  [0, 1].map((c) =>
                    [0, 1].map((k) =>
                      tile(
                        `${i}-${c}-${k}`,
                        colX(i) + (k ? T / 2 + TG / 2 : -T / 2 - TG / 2),
                        r.y + c * (T + TG),
                        classHue(c),
                      ),
                    ),
                  ),
                )}
                {[0, 1].map((c) =>
                  tile(`b${c}`, baseX, r.y + c * (T + TG), classHue(c)),
                )}
                <text
                  className="fig-label-sub"
                  x={baseX}
                  y={r.y + 2 * T + TG + 13}
                  textAnchor="middle"
                >
                  how common
                </text>
              </>
            ) : (
              <>
                {Array.from({ length: features }, (_, i) =>
                  tile(`${i}`, colX(i), r.y, learned(jitter(i * 7 + ri * 31))),
                )}
                {tile("b", baseX, r.y, learned(jitter(ri * 31 + 99)))}
              </>
            )}
            <text
              className="fig-num pb-fig-strong"
              x={W}
              y={mid + 4}
              textAnchor="end"
            >
              {counts[ri]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Rounding ────────────────────────────────────────────────────────────

/** Incoming weights of the first few hidden neurons, each as a 20 × 20
 *  picture: the pixels it looks for (sage) and against (plum). Scaled
 *  against the unrounded weights, so rounding shows as lost shading. */
export function WeightPictures({
  net,
  bounds,
  count = 6,
}: {
  net: Net;
  bounds: number[];
  count?: number;
}) {
  const dim = net.dim;
  const cell = 4;
  const side = dim * cell;
  const gap = 18;
  const W = count * side + (count - 1) * gap;
  return (
    <svg
      className="pb-svg"
      width={W}
      height={side}
      viewBox={`0 0 ${W} ${side}`}
      role="img"
      aria-label="The first hidden neurons' weights, as pictures"
    >
      {Array.from({ length: count }, (_, n) => (
        <g key={n} transform={`translate(${n * (side + gap)} 0)`}>
          {Array.from({ length: dim * dim }, (_, p) => (
            <rect
              key={p}
              x={(p % dim) * cell}
              y={Math.floor(p / dim) * cell}
              width={cell}
              height={cell}
              fill={learned(net.W1[n * net.IN + p]! / bounds[n]!)}
            />
          ))}
          <rect
            x={0.5}
            y={0.5}
            width={side - 1}
            height={side - 1}
            fill="none"
            stroke="var(--border)"
          />
        </g>
      ))}
    </svg>
  );
}

// ── Distillation ────────────────────────────────────────────────────────

/** A 14 × 14 digit, the data as it arrived. */
export function DigitThumb({
  pixels,
  size = 42,
}: {
  pixels: Float32Array;
  size?: number;
}) {
  const dim = Math.round(Math.sqrt(pixels.length));
  const c = size / dim;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <rect width={size} height={size} fill="var(--surface)" />
      {Array.from(pixels, (v, i) =>
        v > 0.02 ? (
          <rect
            key={i}
            x={(i % dim) * c}
            y={Math.floor(i / dim) * c}
            width={c + 0.2}
            height={c + 0.2}
            fill={input(v)}
          />
        ) : null,
      )}
    </svg>
  );
}

/** Ten bars, one per digit. The answer key is data as it arrived (ink); the
 *  teacher's probabilities are computed (vermillion), and a bar's height is
 *  its probability. */
export function DigitBars({
  probs,
  kind,
}: {
  probs: number[];
  kind: "key" | "teacher";
}) {
  const col = 26;
  const W = col * 10;
  const top = 16;
  const hMax = 80;
  const H = top + hMax + 16;
  const fill = kind === "key" ? "var(--ml-input-ink)" : VALUE_POS;
  return (
    <svg
      className="pb-svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={kind === "key" ? "The answer key" : "The teacher's answer"}
    >
      <line
        x1={0}
        x2={W}
        y1={top + hMax + 0.5}
        y2={top + hMax + 0.5}
        stroke="var(--border)"
      />
      {probs.map((p, i) => {
        const h = p * hMax;
        return (
          <g key={i}>
            {h > 0.2 && (
              <rect
                x={i * col + 4}
                y={top + hMax - h}
                width={col - 8}
                height={h}
                fill={fill}
              />
            )}
            {p >= 0.01 && (
              <text
                className="fig-num"
                x={i * col + col / 2}
                y={top + hMax - h - 4}
                textAnchor="middle"
              >
                {Math.round(p * 100)}%
              </text>
            )}
            <text
              className="fig-tick"
              x={i * col + col / 2}
              y={H - 3}
              textAnchor="middle"
            >
              {i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Boosted trees ───────────────────────────────────────────────────────

/** The first few trees of a boosted model, each a full binary tree: every
 *  question learns which feature to ask about (the count grey: a pick, with
 *  no sign) and a cut-off (flat sage: a position, with no sign), every
 *  leaf learns a signed answer (sage or plum). Past ten trees the rest are
 *  counted, not drawn. */
export function TreesFigure({
  trees,
  depth,
}: {
  trees: number;
  depth: number;
}) {
  const W = 1000;
  const shown = Math.min(trees, 10);
  const gw = 84;
  const gap = 14;
  const top = 8;
  const ly = Math.min(20, 120 / depth);
  const H = top + depth * ly + 14 + 26 + (trees > 10 ? 18 : 0);
  const nodes: JSX.Element[] = [];
  for (let t = 0; t < shown; t++) {
    const gx = t * (gw + gap);
    for (let l = 0; l <= depth; l++) {
      const n = 2 ** l;
      const slot = gw / n;
      const s = Math.max(0.8, Math.min(10, slot - 1.5));
      const y = top + l * ly;
      for (let i = 0; i < n; i++) {
        const cx = gx + (i + 0.5) * slot;
        if (l < depth && slot > 3) {
          const child = gw / (2 * n);
          for (const k of [0, 1]) {
            nodes.push(
              <line
                key={`e${t}-${l}-${i}-${k}`}
                x1={cx}
                y1={y + s / 2}
                x2={gx + (2 * i + k + 0.5) * child}
                y2={y + ly}
                stroke="var(--border-strong)"
                strokeWidth={0.75}
              />,
            );
          }
        }
        if (l < depth) {
          // A question: which feature (a pick, no sign: the count grey) and
          // its cut-off (a position, no sign: flat sage), side by side.
          const q = Math.max(0.5, Math.min(s, (slot - 2) / 2));
          nodes.push(
            <rect key={`f${t}-${l}-${i}`} x={cx - q} y={y} width={q} height={q}
              rx={Math.min(2, q / 4)} fill={COUNT_FILL} />,
            <rect key={`c${t}-${l}-${i}`} x={cx} y={y} width={q} height={q}
              rx={Math.min(2, q / 4)} fill={learned(0.6)} />,
          );
        } else {
          nodes.push(
            <rect key={`n${t}-${l}-${i}`} x={cx - s / 2} y={y} width={s} height={s}
              rx={Math.min(2, s / 4)} fill={learned(jitter(t * 257 + i))} />,
          );
        }
      }
    }
  }
  const baseY = top + depth * ly + 14;
  return (
    <svg
      className="pb-svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${trees} trees of depth ${depth}`}
    >
      {nodes}
      {Array.from({ length: shown }, (_, t) => (
        <text
          key={t}
          className="fig-label"
          x={t * (gw + gap) + gw / 2}
          y={baseY + 12}
          textAnchor="middle"
        >
          tree {t + 1}
        </text>
      ))}
      {trees > shown && (
        <text className="fig-note" x={W} y={baseY + 30} textAnchor="end">
          and {(trees - shown).toLocaleString()} more
        </text>
      )}
    </svg>
  );
}

/** Three models on one log axis: the smallest model above, these trees, and
 *  the network below. The trees are the one this panel follows. */
export function InBetween({
  marks,
}: {
  marks: Array<{ name: string; n: number; on?: boolean }>;
}) {
  const W = 1000;
  const H = 80;
  const x0 = 10;
  const x1 = W - 10;
  const lo = 0;
  const hi = 6;
  const x = (n: number) =>
    x0 + ((Math.log10(Math.max(1, n)) - lo) / (hi - lo)) * (x1 - x0);
  const axisY = 56;
  return (
    <svg
      className="pb-svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="The three models on one scale of ten-times steps"
    >
      <line
        x1={x0}
        x2={x1}
        y1={axisY}
        y2={axisY}
        stroke="var(--border-strong)"
      />
      {[1, 10, 100, 1e3, 1e4, 1e5, 1e6].map((t) => (
        <g key={t}>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={axisY - 3}
            y2={axisY + 3}
            stroke="var(--border-strong)"
          />
          <text
            className="fig-tick"
            x={x(t)}
            y={axisY + 16}
            textAnchor={t === 1 ? "start" : t === 1e6 ? "end" : "middle"}
          >
            {t.toLocaleString()}
          </text>
        </g>
      ))}
      {marks.map((m) => (
        <g key={m.name}>
          {m.on && (
            <line
              x1={x(m.n)}
              x2={x(m.n)}
              y1={axisY - 26}
              y2={axisY - 5}
              stroke="var(--accent)"
            />
          )}
          <circle
            cx={x(m.n)}
            cy={axisY}
            r={5}
            fill={m.on ? "var(--accent)" : "var(--fig-text-label)"}
          />
          {/* The followed mark's label sits a line higher, clear of its neighbours'. */}
          <text
            className={`fig-label${m.on ? " fig-on" : ""}`}
            x={x(m.n)}
            y={m.on ? axisY - 30 : axisY - 12}
            textAnchor={
              x(m.n) < 80 ? "start" : x(m.n) > W - 80 ? "end" : "middle"
            }
          >
            {m.name} · {m.n.toLocaleString()}
          </text>
        </g>
      ))}
    </svg>
  );
}
