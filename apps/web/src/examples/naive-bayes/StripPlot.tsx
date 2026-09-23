// The one-feature view: each class's curve on top, the sample as a dot strip
// below with the decision regions behind it.
//
// The reader fits the curves exactly as in two features — a handle at the
// peak to move one, a handle on its shoulder to widen it — and the regions
// in the strip are computed from them.
//
// One feature is the case where naive Bayes is not naive at all: conditional
// independence is a claim about how features relate, and a lone feature has
// nothing to relate to. With one feature the model is "one Gaussian per
// class", optimal whenever the classes really are Gaussian. The only
// assumption left to break is the shape one, which is why the true curve and
// a fitted one can be made to disagree wildly under interleaved and hardly at
// all under round.

import { useMemo, useRef, useState } from "react";
import { DOMAIN, normalPdf, trueMarginal, type Scenario } from "../shared/classification/data.js";
import { STRIP_PEAK, clampToDomain, domainSamples, jitter, makeScale } from "../shared/classification/plot.js";
import { classHue } from "../shared/palette.js";
import { SD_MAX, SD_MIN, nbMarginal, setCurve, type Curves, type NBModel } from "./nb.js";

const PAD = 12;
const LEFT = 12;
const PLOTW = 520;
const CURVE_TOP = 12;
const CURVE_H = 180;
const STRIP_TOP = CURVE_TOP + CURVE_H + 10;
const STRIP_H = 56;
const W = LEFT + PLOTW + PAD;
const H = STRIP_TOP + STRIP_H + 26;
const RES = 520;
const N = 200;

interface Drag {
  c: number;
  part: "mean" | "sd";
}

export interface StripPlotProps {
  scenario: Scenario;
  curves: Curves;
  priors: number[];
  onChange: (c: Curves) => void;
  nb: NBModel | null;
  bandUrl: string | null;
  showTruth: boolean;
  showTest: boolean;
}

export { RES as STRIP_RES };

export function StripPlot({
  scenario,
  curves,
  priors,
  onChange,
  nb,
  bandUrl,
  showTruth,
  showTest,
}: StripPlotProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scale = useMemo(() => makeScale(LEFT, 0, PLOTW), []);
  const xs = useMemo(() => domainSamples(N), []);

  // One fixed vertical scale (STRIP_PEAK), so a curve is the same height on
  // every sample; anything taller is clipped at the top.
  const truth = useMemo(
    () => scenario.classes.map((cm) => xs.map((v) => trueMarginal(cm, 0, v))),
    [scenario, xs],
  );

  const base = CURVE_TOP + CURVE_H;
  const yFor = (v: number) => base - Math.max(0, Math.min(1, v / STRIP_PEAK)) * (CURVE_H - 4);
  const linePath = (vals: number[]) =>
    xs.map((v, i) => `${i ? "L" : "M"}${scale.x(v).toFixed(1)} ${yFor(vals[i]!).toFixed(1)}`).join(" ");
  const areaPath = (vals: number[]) =>
    `${linePath(vals)} L${scale.x(DOMAIN[1]!).toFixed(1)} ${base} L${scale.x(DOMAIN[0]!).toFixed(1)} ${base} Z`;

  const yours = (c: number) => (v: number) =>
    priors[c]! * normalPdf(v, curves.means[c]![0]!, curves.sds[c]![0]! ** 2);

  const toData = (clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const ctm = svg.getScreenCTM();
    const loc = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
    return scale.invX(loc.x);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const v = toData(e.clientX);
    if (drag.part === "mean") {
      onChange(setCurve(curves, "mean", drag.c, 0, clampToDomain(v)));
    } else {
      const sd = Math.abs(v - curves.means[drag.c]![0]!);
      onChange(setCurve(curves, "sd", drag.c, 0, Math.max(SD_MIN, Math.min(SD_MAX, sd))));
    }
  };

  const grab = (next: Drag) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag(next);
  };

  const dotY = (i: number) => STRIP_TOP + 7 + jitter(i) * (STRIP_H - 14);

  return (
    <svg
      ref={svgRef}
      className="cls-fig"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="One-feature plot with a draggable curve per class"
      onPointerMove={onMove}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
    >
      {showTruth &&
        scenario.classes.map((_, c) => (
          <path key={`t-${c}`} d={areaPath(truth[c]!)} className="cls-truth-area" style={{ fill: classHue(c) }} />
        ))}
      {nb &&
        scenario.classes.map((_, c) => (
          <path
            key={`m-${c}`}
            d={linePath(xs.map((v) => nbMarginal(nb, c, 0, v)))}
            className="cls-curve cls-curve--model"
            style={{ stroke: classHue(c) }}
          />
        ))}
      {scenario.classes.map((_, c) => (
        <path key={`y-${c}`} d={linePath(xs.map(yours(c)))} className="cls-curve" style={{ stroke: classHue(c) }} />
      ))}
      <line x1={LEFT} y1={base} x2={LEFT + PLOTW} y2={base} className="cls-baseline" />

      {/* The sample, with the regions behind it. */}
      <rect x={LEFT} y={STRIP_TOP} width={PLOTW} height={STRIP_H} rx={4} className="cls-frame" />
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
        <g className="cls-points cls-points--test">
          {scenario.test.map((p, i) => (
            <circle key={i} cx={scale.x(p.x[0]!)} cy={dotY(i + 977)} r={1.8} style={{ fill: classHue(p.y) }} />
          ))}
        </g>
      )}
      <g className="cls-points">
        {scenario.train.map((p, i) => (
          <circle key={i} cx={scale.x(p.x[0]!)} cy={dotY(i)} r={3.2} style={{ fill: classHue(p.y) }} />
        ))}
      </g>

      {/* Handles last, so nothing paints over them. */}
      {scenario.classes.map((cm, c) => {
        const mu = curves.means[c]![0]!;
        const sd = curves.sds[c]![0]!;
        const f = yours(c);
        const shoulder = mu + sd <= DOMAIN[1]! ? mu + sd : mu - sd;
        const on = (p: Drag["part"]) =>
          drag?.c === c && drag.part === p ? " cls-handle--active" : "";
        return (
          <g key={`h-${c}`}>
            <rect
              x={scale.x(shoulder) - 4.5}
              y={yFor(f(shoulder)) - 4.5}
              width={9}
              height={9}
              rx={2}
              className={"cls-handle" + on("sd")}
              style={{ fill: classHue(c) }}
              onPointerDown={grab({ c, part: "sd" })}
              aria-label={`Widen class ${cm.label}`}
            />
            <circle
              cx={scale.x(mu)}
              cy={yFor(f(mu))}
              r={7.5}
              className={"cls-handle" + on("mean")}
              style={{ fill: classHue(c) }}
              onPointerDown={grab({ c, part: "mean" })}
              aria-label={`Move class ${cm.label}`}
            />
            <text x={scale.x(mu)} y={yFor(f(mu))} className="cls-handle-letter">
              {cm.label}
            </text>
          </g>
        );
      })}

      <text x={LEFT} y={H - 8} className="fig-label">
        feature 1
      </text>
    </svg>
  );
}
