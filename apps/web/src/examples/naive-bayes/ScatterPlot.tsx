// The two-feature view: the shared joint plot, with the reader's naive Bayes
// drawn on it.
//
// The reader edits only the strips. Each class has a curve along the top
// (feature 1) and down the right (feature 2), with a handle at its peak to
// move it and one on its shoulder to widen it. The middle of the plot is
// computed from those curves and cannot be touched: the regions, and each
// class's ellipse, which is the two curves multiplied together. The ellipse
// can stretch along either axis but can never turn — on tilted data that is
// the thing the reader will try to do and find they cannot.

import { useCallback, useState } from "react";
import { DOMAIN, normalPdf, type Scenario } from "../shared/classification/data.js";
import { JointPlot, type JointGeo, type MarginLine } from "../shared/classification/JointPlot.js";
import { clampToDomain } from "../shared/classification/plot.js";
import { classHue } from "../shared/palette.js";
import { SD_MAX, SD_MIN, nbMarginal, setCurve, type Curves, type NBModel } from "./nb.js";

interface Drag {
  c: number;
  d: 0 | 1;
  part: "mean" | "sd";
}

export interface ScatterPlotProps {
  scenario: Scenario;
  curves: Curves;
  priors: number[];
  onChange: (c: Curves) => void;
  nb: NBModel | null;
  regionUrl: string | null;
  showTruth: boolean;
  showTest: boolean;
}

export function ScatterPlot({
  scenario,
  curves,
  priors,
  onChange,
  nb,
  regionUrl,
  showTruth,
  showTest,
}: ScatterPlotProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toData, setToData] = useState<JointGeo["toData"] | null>(null);
  const k = scenario.classes.length;
  const span = DOMAIN[1]! - DOMAIN[0]!;

  const yours = (c: number, d: number) => (v: number) =>
    priors[c]! * normalPdf(v, curves.means[c]![d]!, curves.sds[c]![d]! ** 2);

  const lines: MarginLine[] = [];
  for (let c = 0; c < k; c++) {
    for (const d of [0, 1] as const) {
      if (nb) lines.push({ cls: c, feature: d, variant: "model", density: (v) => nbMarginal(nb, c, d, v) });
      lines.push({ cls: c, feature: d, variant: "yours", density: yours(c, d) });
    }
  }

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !toData) return;
      const [x, y] = toData(e.clientX, e.clientY);
      const v = drag.d === 0 ? x : y;
      if (drag.part === "mean") {
        onChange(setCurve(curves, "mean", drag.c, drag.d, clampToDomain(v)));
      } else {
        const sd = Math.abs(v - curves.means[drag.c]![drag.d]!);
        onChange(setCurve(curves, "sd", drag.c, drag.d, Math.max(SD_MIN, Math.min(SD_MAX, sd))));
      }
    },
    [drag, toData, curves, onChange],
  );

  const grab = (geo: JointGeo, next: Drag) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setToData(() => geo.toData);
    setDrag(next);
  };

  const ellipses = (geo: JointGeo) => (
    <g>
      {nb &&
        scenario.classes.map((_, c) => (
          <ellipse
            key={`m-${c}`}
            cx={geo.scale.x(nb.means[c]![0]!)}
            cy={geo.scale.y(nb.means[c]![1]!)}
            rx={(Math.sqrt(nb.vars[c]![0]!) / span) * geo.plot.size}
            ry={(Math.sqrt(nb.vars[c]![1]!) / span) * geo.plot.size}
            className="cls-ellipse cls-ellipse--model"
            style={{ stroke: classHue(c) }}
          />
        ))}
      {scenario.classes.map((_, c) => (
        <ellipse
          key={`y-${c}`}
          cx={geo.scale.x(curves.means[c]![0]!)}
          cy={geo.scale.y(curves.means[c]![1]!)}
          rx={(curves.sds[c]![0]! / span) * geo.plot.size}
          ry={(curves.sds[c]![1]! / span) * geo.plot.size}
          className="cls-ellipse"
          style={{ stroke: classHue(c) }}
        />
      ))}
    </g>
  );

  const handles = (geo: JointGeo) => (
    <g>
      {scenario.classes.map((cm, c) =>
        ([0, 1] as const).map((d) => {
          const mu = curves.means[c]![d]!;
          const sd = curves.sds[c]![d]!;
          const f = yours(c, d);
          // Feature 1 lives in the top strip (x along the axis, y up the
          // density); feature 2 in the right strip (the other way round).
          const at = (v: number): [number, number] =>
            d === 0 ? [geo.scale.x(v), geo.topY(f(v))] : [geo.rightX(f(v)), geo.scale.y(v)];
          const [px, py] = at(mu);
          // The shoulder handle sits on whichever side stays inside the plot.
          const [sx, sy] = at(mu + sd <= DOMAIN[1]! ? mu + sd : mu - sd);
          const on = (p: Drag["part"]) =>
            drag?.c === c && drag.d === d && drag.part === p ? " cls-handle--active" : "";
          return (
            <g key={`${c}-${d}`}>
              <rect
                x={sx - 4.5}
                y={sy - 4.5}
                width={9}
                height={9}
                rx={2}
                className={"cls-handle" + on("sd")}
                style={{ fill: classHue(c) }}
                onPointerDown={grab(geo, { c, d, part: "sd" })}
                aria-label={`Widen class ${cm.label}, feature ${d + 1}`}
              />
              <circle
                cx={px}
                cy={py}
                r={7.5}
                className={"cls-handle" + on("mean")}
                style={{ fill: classHue(c) }}
                onPointerDown={grab(geo, { c, d, part: "mean" })}
                aria-label={`Move class ${cm.label}, feature ${d + 1}`}
              />
              <text x={px} y={py} className="cls-handle-letter">
                {cm.label}
              </text>
            </g>
          );
        }),
      )}
    </g>
  );

  return (
    <JointPlot
      scenario={scenario}
      regionUrl={regionUrl}
      showTruth={showTruth}
      showTest={showTest}
      marginLines={lines}
      underlay={ellipses}
      overlay={handles}
      ariaLabel="Two-feature scatter plot with a draggable curve per class along each feature"
      onPointerMove={onMove}
      onPointerUp={() => setDrag(null)}
    />
  );
}
