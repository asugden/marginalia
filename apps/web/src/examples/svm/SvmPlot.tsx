// The SVM view: the shared joint plot, with the reader's line and street and,
// once fitted, the SVM's line, street and support vectors.
//
// Lines and streets separate classes rather than belonging to one, so they
// are ink. The reader's line is solid with handles — two ends to swing it, a
// square in the middle to slide it — and its street is dotted, out to the
// nearest point it gets right on each side (ringed, dashed). The SVM's line is
// dashed, its street a grey band, its support vectors ringed.

import { useCallback, useState } from "react";
import { DOMAIN, clipLineToBox, type Scenario } from "../shared/classification/data.js";
import { JointPlot, type JointGeo } from "../shared/classification/JointPlot.js";
import { clampToDomain } from "../shared/classification/plot.js";
import { offsetLine, svmBoundary, svmStreet, type Line, type Street, type SVMModel } from "./svm.js";

type Part = "p1" | "p2" | "mid";

interface Drag {
  part: Part;
  origin: [number, number];
  start: Line;
}

export interface SvmPlotProps {
  scenario: Scenario;
  line: Line;
  street: Street;
  onChange: (l: Line) => void;
  svm: SVMModel | null;
  regionUrl: string | null;
  showTruth: boolean;
  showTest: boolean;
}

export function SvmPlot({
  scenario,
  line,
  street,
  onChange,
  svm,
  regionUrl,
  showTruth,
  showTest,
}: SvmPlotProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toData, setToData] = useState<JointGeo["toData"] | null>(null);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !toData) return;
      const [x, y] = toData(e.clientX, e.clientY);
      if (drag.part === "mid") {
        const ox = x - drag.origin[0];
        const oy = y - drag.origin[1];
        const shift = (p: [number, number]): [number, number] => [
          clampToDomain(p[0] + ox),
          clampToDomain(p[1] + oy),
        ];
        onChange({ p1: shift(drag.start.p1), p2: shift(drag.start.p2) });
        return;
      }
      const p: [number, number] = [clampToDomain(x), clampToDomain(y)];
      onChange(drag.part === "p1" ? { ...line, p1: p } : { ...line, p2: p });
    },
    [drag, toData, line, onChange],
  );

  const grab = (geo: JointGeo, part: Part) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setToData(() => geo.toData);
    setDrag({ part, origin: geo.toData(e.clientX, e.clientY), start: line });
  };

  const seg = (geo: JointGeo, s: [[number, number], [number, number]] | null, cls: string) => {
    const c = s && clipLineToBox(s[0], s[1], DOMAIN[0], DOMAIN[1]);
    if (!c) return null;
    return (
      <line
        x1={geo.scale.x(c[0][0])}
        y1={geo.scale.y(c[0][1])}
        x2={geo.scale.x(c[1][0])}
        y2={geo.scale.y(c[1][1])}
        className={cls}
      />
    );
  };

  const ring = (geo: JointGeo, i: number, cls: string) => {
    const p = scenario.train[i]!;
    return <circle key={`${cls}-${i}`} cx={geo.scale.x(p.x[0]!)} cy={geo.scale.y(p.x[1]!)} r={6.5} className={cls} />;
  };

  const underlay = (geo: JointGeo) => {
    // A street wider than the plot means the SVM has given up and calls every
    // point one class (a checkerboard can do that); there is no street to show.
    if (!svm || 2 / Math.hypot(svm.w[0], svm.w[1]) > DOMAIN[1] - DOMAIN[0]) return null;
    const { left, top, size } = geo.plot;
    return (
      <g>
        <clipPath id="svm-plot-clip">
          <rect x={left} y={top} width={size} height={size} />
        </clipPath>
        <polygon
          points={svmStreet(svm)
            .map(([x, y]) => `${geo.scale.x(x).toFixed(1)},${geo.scale.y(y).toFixed(1)}`)
            .join(" ")}
          clipPath="url(#svm-plot-clip)"
          className="cls-street"
        />
      </g>
    );
  };

  const overlay = (geo: JointGeo) => {
    const mid: [number, number] = [(line.p1[0] + line.p2[0]) / 2, (line.p1[1] + line.p2[1]) / 2];
    const yours = clipLineToBox(line.p1, line.p2, DOMAIN[0], DOMAIN[1]);
    const theirs = svm && svmBoundary(svm);
    return (
      <g>
        {svm && svm.support.map((i) => ring(geo, i, "cls-ring"))}
        {theirs && seg(geo, theirs, "cls-boundary cls-boundary--model")}

        {street.left !== null && seg(geo, offsetLine(line, street.left), "cls-street-edge")}
        {street.right !== null && seg(geo, offsetLine(line, -street.right), "cls-street-edge")}
        {street.leftIndex !== null && ring(geo, street.leftIndex, "cls-ring cls-ring--yours")}
        {street.rightIndex !== null && ring(geo, street.rightIndex, "cls-ring cls-ring--yours")}
        {yours && seg(geo, yours, "cls-boundary")}

        {(["p1", "p2"] as const).map((part) => (
          <circle
            key={part}
            cx={geo.scale.x(line[part][0])}
            cy={geo.scale.y(line[part][1])}
            r={7}
            className={"cls-handle cls-handle--ink" + (drag?.part === part ? " cls-handle--active" : "")}
            onPointerDown={grab(geo, part)}
            aria-label="Swing the line"
          />
        ))}
        <rect
          x={geo.scale.x(mid[0]) - 6}
          y={geo.scale.y(mid[1]) - 6}
          width={12}
          height={12}
          rx={3}
          className={"cls-handle cls-handle--ink" + (drag?.part === "mid" ? " cls-handle--active" : "")}
          onPointerDown={grab(geo, "mid")}
          aria-label="Slide the line"
        />
      </g>
    );
  };

  return (
    <JointPlot
      scenario={scenario}
      regionUrl={regionUrl}
      showTruth={showTruth}
      showTest={showTest}
      underlay={underlay}
      overlay={overlay}
      ariaLabel="Two-feature scatter plot with a draggable dividing line"
      onPointerMove={onMove}
      onPointerUp={() => setDrag(null)}
    />
  );
}
