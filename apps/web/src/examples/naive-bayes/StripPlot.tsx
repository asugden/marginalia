// The 1D view: true class densities on top, the sample as a dot strip below,
// and draggable cuts through both.
//
// One feature is the case where naive Bayes is not naive at all. Conditional
// independence is a claim about how features relate to one another, and a lone
// feature has nothing to relate to — so with a single feature the model reduces
// to "one Gaussian per class" and is optimal whenever the classes really are
// Gaussian. The only assumption left to break here is the *shape* one, which is
// why the filled true density and the fitted line can be made to disagree
// wildly under the interleaved setting and hardly at all under round.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DOMAIN,
  classDensity,
  nbMarginal,
  nbPredict,
  studentPredict,
  type NBModel,
  type Scenario,
  type Student1D,
} from "./nb.js";
import { CLASS_COLORS, bandDataUrl, clampToDomain, makeScale } from "./plot.js";
import type { RegionMode } from "./ScatterPlot.js";

const PAD = 14;
const LEFT = 44;
const PLOTW = 480;
const CURVE_TOP = 18;
const CURVE_H = 168;
const STRIP_TOP = CURVE_TOP + CURVE_H + 14;
const STRIP_H = 54;
const W = LEFT + PLOTW + PAD;
const H = STRIP_TOP + STRIP_H + 30;
const RES = 480;

export interface StripPlotProps {
  scenario: Scenario;
  student: Student1D;
  onChange: (s: Student1D) => void;
  nb: NBModel | null;
  regionMode: RegionMode;
  showShapes: boolean;
  /** Reveal the held-out points behind the sample, after a fit. */
  showTest: boolean;
}

export function StripPlot({
  scenario,
  student,
  onChange,
  nb,
  regionMode,
  showShapes,
  showTest,
}: StripPlotProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // A 1D scale reuses the 2D helper's x mapping; the y mapping is unused here.
  const scale = useMemo(() => makeScale(LEFT, 0, PLOTW), []);

  const bandUrl = useMemo(() => {
    if (regionMode === "none") return null;
    if (regionMode === "nb") {
      if (!nb) return null;
      return bandDataUrl(RES, (x) => nbPredict(x, nb));
    }
    return bandDataUrl(RES, (x) => studentPredict(x, student));
  }, [regionMode, nb, student]);

  const toData = useCallback(
    (clientX: number): number => {
      const svg = svgRef.current;
      if (!svg) return 0;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = 0;
      const ctm = svg.getScreenCTM();
      const loc = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
      return scale.invX(loc.x);
    },
    [scale],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragIndex == null) return;
      const v = clampToDomain(toData(e.clientX));
      const cuts = student.cuts.map((c, i) => (i === dragIndex ? v : c));
      onChange({ ...student, cuts });
    },
    [dragIndex, onChange, student, toData],
  );

  // ── Curves ────────────────────────────────────────────────────────────────
  const curves = useMemo(() => {
    const N = 200;
    const xs = Array.from(
      { length: N },
      (_, i) => DOMAIN[0]! + ((DOMAIN[1]! - DOMAIN[0]!) * i) / (N - 1),
    );
    const truth = scenario.classes.map((cm) =>
      xs.map((v) => cm.prior * classDensity([v], cm, 1)),
    );
    const fitted = nb
      ? scenario.classes.map((_, c) => xs.map((v) => nbMarginal(nb, c, 0, v)))
      : null;
    let peak = 1e-9;
    for (const t of truth) for (const v of t) peak = Math.max(peak, v);
    if (fitted) for (const f of fitted) for (const v of f) peak = Math.max(peak, v);
    return { xs, truth, fitted, peak };
  }, [scenario, nb]);

  const yFor = (v: number) => CURVE_TOP + CURVE_H - (v / curves.peak) * (CURVE_H - 8);
  const linePath = (vals: number[]) =>
    curves.xs
      .map((v, i) => `${i === 0 ? "M" : "L"}${scale.x(v).toFixed(1)} ${yFor(vals[i]!).toFixed(1)}`)
      .join(" ");
  const areaPath = (vals: number[]) =>
    `${linePath(vals)} L${scale.x(DOMAIN[1]!).toFixed(1)} ${CURVE_TOP + CURVE_H} L${scale
      .x(DOMAIN[0]!)
      .toFixed(1)} ${CURVE_TOP + CURVE_H} Z`;

  // Stable vertical jitter so the dot strip does not reshuffle on every render.
  const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

  return (
    <svg
      ref={svgRef}
      className="nb-plot"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="One-feature density plot with draggable thresholds"
      onPointerMove={onMove}
      onPointerUp={() => setDragIndex(null)}
      onPointerLeave={() => setDragIndex(null)}
    >
      {/* True densities, filled; the fitted curves sit on top as solid lines. */}
      {showShapes &&
        scenario.classes.map((_, c) => (
          <path
            key={`t-${c}`}
            d={areaPath(curves.truth[c]!)}
            fill={CLASS_COLORS[c]!}
            className="nb-strip__truth"
          />
        ))}
      {showShapes &&
        curves.fitted &&
        scenario.classes.map((_, c) => (
          <path
            key={`f-${c}`}
            d={linePath(curves.fitted![c]!)}
            stroke={CLASS_COLORS[c]!}
            className="nb-strip__fit"
          />
        ))}

      <line
        x1={LEFT}
        y1={CURVE_TOP + CURVE_H}
        x2={LEFT + PLOTW}
        y2={CURVE_TOP + CURVE_H}
        className="nb-plot__grid"
      />

      {/* Sample strip, with decision bands behind it. */}
      <rect
        x={LEFT}
        y={STRIP_TOP}
        width={PLOTW}
        height={STRIP_H}
        className="nb-plot__frame"
        rx={4}
      />
      {bandUrl && (
        <image
          href={bandUrl}
          x={LEFT}
          y={STRIP_TOP}
          width={PLOTW}
          height={STRIP_H}
          preserveAspectRatio="none"
        />
      )}
      {showTest && (
        <g className="nb-plot__points nb-plot__points--test">
          {scenario.test.map((p, i) => (
            <circle
              key={i}
              cx={scale.x(p.x[0]!)}
              cy={STRIP_TOP + 7 + jitter(i) * (STRIP_H - 14)}
              r={1.8}
              fill={CLASS_COLORS[p.y]!}
            />
          ))}
        </g>
      )}
      {showTest && (
        <g className="nb-plot__test">
          {scenario.test.map((p, i) => (
            <circle
              key={i}
              cx={scale.x(p.x[0]!)}
              cy={STRIP_TOP + 5 + jitter(i + 977) * (STRIP_H - 10)}
              r={1.5}
              fill={CLASS_COLORS[p.y]!}
            />
          ))}
        </g>
      )}
      <g className="nb-plot__points">
        {scenario.train.map((p, i) => (
          <circle
            key={i}
            cx={scale.x(p.x[0]!)}
            cy={STRIP_TOP + 7 + jitter(i) * (STRIP_H - 14)}
            r={2.9}
            fill={CLASS_COLORS[p.y]!}
          />
        ))}
      </g>

      {/* Cuts, spanning both panels. */}
      {student.cuts.map((c, i) => (
        <g key={i} className={"nb-cut" + (dragIndex === i ? " nb-cut--active" : "")}>
          <line
            x1={scale.x(c)}
            y1={CURVE_TOP}
            x2={scale.x(c)}
            y2={STRIP_TOP + STRIP_H}
            className="nb-cut__line"
          />
          <rect
            x={scale.x(c) - 7}
            y={CURVE_TOP - 10}
            width={14}
            height={16}
            rx={3}
            className="nb-cut__handle"
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              setDragIndex(i);
            }}
          />
        </g>
      ))}

      <text x={LEFT} y={H - 8} className="nb-plot__axis">
        feature 1
      </text>
    </svg>
  );
}
