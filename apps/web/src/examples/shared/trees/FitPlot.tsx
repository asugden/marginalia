// Scatter with the model's current prediction drawn through it, and the errors
// it still makes underneath. Shared by both ensemble pages so a forest and a
// boosted model are read the same way.
//
// The residual panel has a FIXED vertical scale, set once from the errors the
// model starts with and never recomputed. This matters more than it sounds. If
// the panel rescales to whatever is left, the bars look roughly the same height
// at every round and the shrinking — the entire thing boosting is doing —
// becomes invisible. Pinned to the starting scale, the bars visibly collapse
// toward the line, which is the intuition worth having.

import { useMemo } from "react";
import type { Dataset, Row } from "./cart.js";

const W = 460;
const H = 352;
const PAD_L = 46;
const PAD_R = 12;
const PAD_T = 12;
const FIT_H = 180;
const GAP = 48;
const RES_H = 84;

export interface FitPlotProps {
  dataset: Dataset;
  train: Row[];
  test: Row[];
  predict: (x: number[]) => number;
  /** Vertical extent of the residual panel, in target units. Pass the same
   *  value at every step — normally the largest error before any tree was
   *  added — so the bars can be compared across steps. */
  residualScale: number;
}

export function FitPlot({ dataset, train, test, predict, residualScale }: FitPlotProps) {
  const rows = dataset.rows;
  const xs = rows.map((r) => r.x[0]!);
  const ys = rows.map((r) => r.y);
  const xLo = Math.min(...xs) - 0.3;
  const xHi = Math.max(...xs) + 0.3;
  const yHi = Math.max(...ys) * 1.06;

  const plotW = W - PAD_L - PAD_R;
  const sx = (v: number) => PAD_L + ((v - xLo) / (xHi - xLo)) * plotW;
  const sy = (v: number) => PAD_T + FIT_H - (v / yHi) * FIT_H;

  // Dense sampling, so a piecewise-constant prediction shows up as the
  // staircase it actually is rather than a smooth line through the steps.
  const step = useMemo(() => {
    const N = 320;
    return Array.from({ length: N }, (_, i) => {
      const x = xLo + ((xHi - xLo) * i) / (N - 1);
      return { x, y: predict([x]) };
    });
  }, [predict, xLo, xHi]);

  const resid = train.map((r) => ({ x: r.x[0]!, e: r.y - predict(r.x) }));
  const worst = Math.max(0, ...resid.map((r) => Math.abs(r.e)));
  const resBase = PAD_T + FIT_H + GAP + RES_H / 2;
  const half = RES_H / 2;
  const testIds = new Set(test.map((r) => r.id));
  const unit = dataset.target?.unit ?? "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="fitplot" role="img"
      aria-label="Target against feature, with the current fit and its remaining errors">
      <line x1={PAD_L} y1={PAD_T + FIT_H} x2={PAD_L + plotW} y2={PAD_T + FIT_H} className="lchart__axis" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + FIT_H} className="lchart__axis" />

      {rows.map((r) => (
        <circle
          key={r.id}
          cx={sx(r.x[0]!)}
          cy={sy(r.y)}
          r={testIds.has(r.id) ? 2.6 : 3}
          className={testIds.has(r.id) ? "fitplot__test" : "fitplot__train"}
        />
      ))}

      <path
        d={step.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ")}
        className="fitplot__step"
      />

      <text x={PAD_L} y={PAD_T + FIT_H + 15} className="lchart__label">
        {dataset.features[0]!.name}
        {dataset.features[0]!.unit ? ` (${dataset.features[0]!.unit})` : ""}
      </text>
      <text x={0} y={0} transform={`translate(13 ${PAD_T + FIT_H}) rotate(-90)`} className="lchart__label">
        {dataset.target?.name ?? "target"} ({unit})
      </text>

      {/* ── Residual panel, on a fixed scale ─────────────────────── */}
      <text x={PAD_L} y={resBase - half - 12} className="fitplot__restitle">
        How far off it still is, one bar per dog
      </text>
      {/* The starting envelope stays drawn so the bars have something to
          shrink against rather than shrinking against nothing. */}
      <line x1={PAD_L} y1={resBase - half} x2={PAD_L + plotW} y2={resBase - half} className="fitplot__envelope" />
      <line x1={PAD_L} y1={resBase + half} x2={PAD_L + plotW} y2={resBase + half} className="fitplot__envelope" />
      <text x={PAD_L + plotW} y={resBase - half - 3} textAnchor="end" className="fitplot__envlabel">
        {residualScale.toFixed(0)} {unit} too low
      </text>
      <text x={PAD_L + plotW} y={resBase + half + 10} textAnchor="end" className="fitplot__envlabel">
        {residualScale.toFixed(0)} {unit} too high
      </text>

      <line x1={PAD_L} y1={resBase} x2={PAD_L + plotW} y2={resBase} className="lchart__axis" />
      {resid.map((r, i) => (
        <line
          key={i}
          x1={sx(r.x)}
          y1={resBase}
          x2={sx(r.x)}
          y2={resBase - Math.max(-half, Math.min(half, (r.e / residualScale) * half))}
          className={"fitplot__resid" + (r.e >= 0 ? " is-pos" : " is-neg")}
        />
      ))}
      <text x={PAD_L} y={H - 5} className="lchart__label">
        worst error now: {worst.toFixed(1)} {unit}
      </text>
    </svg>
  );
}
