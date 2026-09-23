// The two-feature figure both classification examples draw on: a scatter of
// the sample, with each feature's curves in a strip along the top (feature 1)
// and the right (feature 2).
//
// The strips are there because the distributions are the lesson. Each class's
// true curve along one feature is a soft fill, the sample is a rug of ticks
// beside it, and a model's (or the reader's) fitted curve is a line on top. In
// the plot itself the true distribution is the same soft fill, one fade per
// Gaussian component.
//
// Everything a particular model adds — boundaries, ellipses, handles, streets
// — is passed in as an underlay (drawn beneath the points) or an overlay
// (above them), with the geometry they need to place themselves.

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { classHue } from "../palette.js";
import { DOMAIN, covEllipse, trueMarginal, type Scenario } from "./data.js";
import { STRIP_PEAK, domainSamples, makeScale, type Scale } from "./plot.js";

const PAD = 10;
/** Gutter left of and below the plot, for the axis names. */
const AX = 28;
/** Depth of each side strip. */
const MH = 78;
/** Gap between the plot and a strip. */
const GAP = 6;
/** Depth of the rug of sample ticks at a strip's inner edge. */
const RUG = 7;
export const PLOT = 400;

const PLOT_LEFT = AX;
const PLOT_TOP = PAD + MH + GAP;
const W = AX + PLOT + GAP + MH + PAD;
const H = PAD + MH + GAP + PLOT + AX;

const CURVE_N = 160;

export interface JointGeo {
  scale: Scale;
  plot: { left: number; top: number; size: number };
  /** Feature 1's strip, above the plot: density -> pixel y. */
  topY: (density: number) => number;
  /** Feature 2's strip, right of the plot: density -> pixel x. */
  rightX: (density: number) => number;
  /** Client coordinates -> data coordinates, through the SVG's own transform
   *  so the maths holds at whatever size the browser has drawn it. */
  toData: (clientX: number, clientY: number) => [number, number];
}

export interface MarginLine {
  cls: number;
  feature: 0 | 1;
  /** Prior-scaled density along the feature, the same units as the truth. */
  density: (v: number) => number;
  /** The reader's own curve (solid) or a model's (dashed). */
  variant: "yours" | "model";
}

export interface JointPlotProps {
  scenario: Scenario;
  regionUrl: string | null;
  showTruth: boolean;
  showTest: boolean;
  marginLines?: MarginLine[];
  underlay?: (geo: JointGeo) => ReactNode;
  overlay?: (geo: JointGeo) => ReactNode;
  ariaLabel: string;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
}

export function JointPlot({
  scenario,
  regionUrl,
  showTruth,
  showTest,
  marginLines = [],
  underlay,
  overlay,
  ariaLabel,
  onPointerMove,
  onPointerUp,
}: JointPlotProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scale = useMemo(() => makeScale(PLOT_LEFT, PLOT_TOP, PLOT), []);
  const xs = useMemo(() => domainSamples(CURVE_N), []);

  // One fixed vertical scale for both strips (STRIP_PEAK), so a curve is the
  // same height on every sample and a curve being dragged moves against a
  // still background. Anything taller is clipped at the strip's edge.
  const truth = useMemo(
    () => [0, 1].map((d) => scenario.classes.map((cm) => xs.map((v) => trueMarginal(cm, d, v)))),
    [scenario, xs],
  );

  const topBase = PAD + MH - RUG - 3;
  const topH = topBase - PAD - 2;
  const rightBase = PLOT_LEFT + PLOT + GAP + RUG + 3;
  const rightW = W - PAD - 2 - rightBase;
  const frac = (d: number) => Math.max(0, Math.min(1, d / STRIP_PEAK));
  const topY = (d: number) => topBase - frac(d) * topH;
  const rightX = (d: number) => rightBase + frac(d) * rightW;

  const toData = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const svg = svgRef.current;
      if (!svg) return [0, 0];
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      const loc = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
      return [scale.invX(loc.x), scale.invY(loc.y)];
    },
    [scale],
  );

  const geo: JointGeo = {
    scale,
    plot: { left: PLOT_LEFT, top: PLOT_TOP, size: PLOT },
    topY,
    rightX,
    toData,
  };

  const topPath = (vals: number[]) =>
    xs.map((v, i) => `${i ? "L" : "M"}${scale.x(v).toFixed(1)} ${topY(vals[i]!).toFixed(1)}`).join(" ");
  const rightPath = (vals: number[]) =>
    xs.map((v, i) => `${i ? "L" : "M"}${rightX(vals[i]!).toFixed(1)} ${scale.y(v).toFixed(1)}`).join(" ");
  const topArea = (vals: number[]) =>
    `${topPath(vals)} L${scale.x(DOMAIN[1]!).toFixed(1)} ${topBase} L${scale.x(DOMAIN[0]!).toFixed(1)} ${topBase} Z`;
  const rightArea = (vals: number[]) =>
    `${rightPath(vals)} L${rightBase} ${scale.y(DOMAIN[1]!).toFixed(1)} L${rightBase} ${scale.y(DOMAIN[0]!).toFixed(1)} Z`;

  const span = DOMAIN[1]! - DOMAIN[0]!;
  const nClasses = scenario.classes.length;

  return (
    <svg
      ref={svgRef}
      className="cls-fig"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        {/* One radial fade per class: strongest at the mean, gone by the drawn
            edge, which is what a Gaussian looks like. */}
        {Array.from({ length: nClasses }, (_, i) => (
          <radialGradient key={i} id={`cls-truth-${i}`}>
            <stop offset="0%" style={{ stopColor: classHue(i), stopOpacity: 0.4 }} />
            <stop offset="55%" style={{ stopColor: classHue(i), stopOpacity: 0.16 }} />
            <stop offset="100%" style={{ stopColor: classHue(i), stopOpacity: 0 }} />
          </radialGradient>
        ))}
      </defs>

      {/* ── The plot ─────────────────────────────────────────────────── */}
      <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT} height={PLOT} rx={4} className="cls-frame" />
      {regionUrl && (
        <image
          href={regionUrl}
          x={PLOT_LEFT}
          y={PLOT_TOP}
          width={PLOT}
          height={PLOT}
          preserveAspectRatio="none"
        />
      )}
      <line x1={scale.x(0)} y1={PLOT_TOP} x2={scale.x(0)} y2={PLOT_TOP + PLOT} className="cls-grid" />
      <line x1={PLOT_LEFT} y1={scale.y(0)} x2={PLOT_LEFT + PLOT} y2={scale.y(0)} className="cls-grid" />

      {/* The true distributions: a soft fade per component, no edge — a
          density has none, and a drawn edge would read as a boundary. Two
          sigma, so the fade reaches zero inside the drawn radius. */}
      {showTruth &&
        scenario.classes.map((cm, ci) =>
          cm.components.map((comp, k) => {
            const e = covEllipse(comp.mean, comp.cov);
            const cx = scale.x(e.cx);
            const cy = scale.y(e.cy);
            return (
              <ellipse
                key={`t-${ci}-${k}`}
                cx={cx}
                cy={cy}
                rx={((e.rx * 2) / span) * PLOT}
                ry={((e.ry * 2) / span) * PLOT}
                // Screen y runs opposite to data y, so the angle flips sign.
                transform={`rotate(${-e.angle} ${cx} ${cy})`}
                fill={`url(#cls-truth-${ci})`}
                className="cls-truth-disk"
              />
            );
          }),
        )}

      {underlay?.(geo)}

      {/* Held-out points: behind the sample, small and faint, so they read as
          the distribution's shadow rather than more points to fit. */}
      {showTest && (
        <g className="cls-points cls-points--test">
          {scenario.test.map((p, i) => (
            <circle key={i} cx={scale.x(p.x[0]!)} cy={scale.y(p.x[1]!)} r={1.9} style={{ fill: classHue(p.y) }} />
          ))}
        </g>
      )}
      <g className="cls-points">
        {scenario.train.map((p, i) => (
          <circle key={i} cx={scale.x(p.x[0]!)} cy={scale.y(p.x[1]!)} r={3.4} style={{ fill: classHue(p.y) }} />
        ))}
      </g>

      {/* ── The strips ───────────────────────────────────────────────── */}
      {showTruth &&
        scenario.classes.map((_, c) => (
          <g key={`mt-${c}`} className="cls-truth-area" style={{ fill: classHue(c) }}>
            <path d={topArea(truth[0]![c]!)} />
            <path d={rightArea(truth[1]![c]!)} />
          </g>
        ))}
      <line x1={PLOT_LEFT} y1={topBase} x2={PLOT_LEFT + PLOT} y2={topBase} className="cls-baseline" />
      <line x1={rightBase} y1={PLOT_TOP} x2={rightBase} y2={PLOT_TOP + PLOT} className="cls-baseline" />
      <g className="cls-rug">
        {scenario.train.map((p, i) => (
          <g key={i} style={{ stroke: classHue(p.y) }}>
            <line x1={scale.x(p.x[0]!)} y1={topBase + 3} x2={scale.x(p.x[0]!)} y2={topBase + 3 + RUG} />
            <line x1={rightBase - 3} y1={scale.y(p.x[1]!)} x2={rightBase - 3 - RUG} y2={scale.y(p.x[1]!)} />
          </g>
        ))}
      </g>
      {marginLines.map((m, i) => {
        const vals = xs.map(m.density);
        return (
          <path
            key={i}
            d={m.feature === 0 ? topPath(vals) : rightPath(vals)}
            className={`cls-curve cls-curve--${m.variant}`}
            style={{ stroke: classHue(m.cls) }}
          />
        );
      })}

      {overlay?.(geo)}

      <text x={PLOT_LEFT} y={PLOT_TOP + PLOT + 18} className="fig-label">
        feature 1
      </text>
      <text
        x={0}
        y={0}
        transform={`translate(${PLOT_LEFT - 12} ${PLOT_TOP + PLOT}) rotate(-90)`}
        className="fig-label"
      >
        feature 2
      </text>
    </svg>
  );
}
