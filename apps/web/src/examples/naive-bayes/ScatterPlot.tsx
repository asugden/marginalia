// The 2D view: a scatter of the sample, the hand-placed boundaries with drag
// handles, and — once naive Bayes has been fitted — its decision regions, its
// per-class ellipses, and the per-feature curves along each margin.
//
// The margins are the important part. Naive Bayes in 2D *is* the two curves
// drawn along the bottom and the two drawn up the side: for each class it keeps
// one mean and one variance per feature and multiplies them together. Nothing
// in the model can express how the features move together, which is why the
// fitted ellipses are always square-on to the axes while the true ones (dashed)
// can lie at any angle.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DOMAIN,
  clipLineToBox,
  covEllipse,
  nbEllipse,
  nbMarginal,
  studentPredict,
  nbPredict,
  type LineRule,
  type NBModel,
  type Scenario,
  type Student2D,
} from "./nb.js";
import { CLASS_COLORS, clampToDomain, makeScale, regionDataUrl } from "./plot.js";

const PAD = 14;
const MARGIN = 78; // width of the left strip / height of the bottom strip
const PLOT = 430;
const W = PAD * 2 + MARGIN + PLOT;
const H = PAD * 2 + MARGIN + PLOT;
const LEFT = PAD + MARGIN;
const TOP = PAD;

/** Region raster resolution. Upscaled to PLOT by the browser, which softens
 *  boundaries — appropriate, since the exact pixel is not the lesson. */
const RES = 180;

export type RegionMode = "you" | "nb" | "none";

export interface ScatterPlotProps {
  scenario: Scenario;
  student: Student2D;
  onChange: (s: Student2D) => void;
  nb: NBModel | null;
  regionMode: RegionMode;
  /** Draw the fitted ellipses, the true ellipses, and the margin curves. */
  showShapes: boolean;
  /** Reveal the held-out points behind the sample, after a fit. */
  showTest: boolean;
}

type DragPart = "p1" | "p2" | "mid";
interface Drag {
  ruleIndex: number;
  part: DragPart;
  /** For a whole-line drag: pointer position at grab time, in data units. */
  originX: number;
  originY: number;
  startP1: [number, number];
  startP2: [number, number];
}

export function ScatterPlot({
  scenario,
  student,
  onChange,
  nb,
  regionMode,
  showShapes,
  showTest,
}: ScatterPlotProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scale = useMemo(() => makeScale(LEFT, TOP, PLOT), []);
  const nClasses = scenario.classes.length;

  // ── Decision regions ──────────────────────────────────────────────────────
  const regionUrl = useMemo(() => {
    if (regionMode === "none") return null;
    if (regionMode === "nb") {
      if (!nb) return null;
      return regionDataUrl(RES, (x) => nbPredict(x, nb));
    }
    return regionDataUrl(RES, (x) => studentPredict(x, student));
  }, [regionMode, nb, student]);

  // ── Pointer handling ──────────────────────────────────────────────────────
  // Client pixels -> SVG user units -> data units. Going through the SVG's own
  // CTM keeps the maths right whatever size the browser has scaled it to.
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

  const startDrag = useCallback(
    (e: React.PointerEvent, ruleIndex: number, part: DragPart) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      const [dx, dy] = toData(e.clientX, e.clientY);
      const rule = student.rules[ruleIndex]!;
      setDrag({
        ruleIndex,
        part,
        originX: dx,
        originY: dy,
        startP1: [...rule.p1] as [number, number],
        startP2: [...rule.p2] as [number, number],
      });
    },
    [student.rules, toData],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      const [dx, dy] = toData(e.clientX, e.clientY);
      const rules = student.rules.map((r, i) => {
        if (i !== drag.ruleIndex) return r;
        if (drag.part === "mid") {
          const ox = dx - drag.originX;
          const oy = dy - drag.originY;
          return {
            ...r,
            p1: [
              clampToDomain(drag.startP1[0]! + ox),
              clampToDomain(drag.startP1[1]! + oy),
            ] as [number, number],
            p2: [
              clampToDomain(drag.startP2[0]! + ox),
              clampToDomain(drag.startP2[1]! + oy),
            ] as [number, number],
          };
        }
        const p: [number, number] = [clampToDomain(dx), clampToDomain(dy)];
        return drag.part === "p1" ? { ...r, p1: p } : { ...r, p2: p };
      });
      onChange({ ...student, rules });
    },
    [drag, onChange, student, toData],
  );

  const endDrag = useCallback(() => setDrag(null), []);

  // ── Margin curves ─────────────────────────────────────────────────────────
  // For each feature, each class's fitted 1D Gaussian scaled by its prior.
  // Shared vertical scaling across both margins so the two are comparable.
  const margins = useMemo(() => {
    if (!nb || !showShapes) return null;
    const N = 120;
    const xs = Array.from(
      { length: N },
      (_, i) => DOMAIN[0]! + ((DOMAIN[1]! - DOMAIN[0]!) * i) / (N - 1),
    );
    const curves: number[][][] = [0, 1].map((d) =>
      Array.from({ length: nClasses }, (_, c) => xs.map((v) => nbMarginal(nb, c, d, v))),
    );
    let peak = 1e-9;
    for (const perFeature of curves) {
      for (const curve of perFeature) for (const v of curve) peak = Math.max(peak, v);
    }
    return { xs, curves, peak };
  }, [nb, showShapes, nClasses]);

  /** Bottom strip: feature 1's curves, hanging below the plot. */
  const bottomPath = (c: number): string => {
    if (!margins) return "";
    const base = TOP + PLOT + MARGIN - 16;
    const h = MARGIN - 26;
    return margins.xs
      .map((v, i) => {
        const px = scale.x(v);
        const py = base - (margins.curves[0]![c]![i]! / margins.peak) * h;
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(" ");
  };

  /** Left strip: feature 2's curves, growing leftwards from the plot edge. */
  const leftPath = (c: number): string => {
    if (!margins) return "";
    const base = LEFT - 10;
    const w = MARGIN - 26;
    return margins.xs
      .map((v, i) => {
        const py = scale.y(v);
        const px = base - (margins.curves[1]![c]![i]! / margins.peak) * w;
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(" ");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <svg
      ref={svgRef}
      className="nb-plot"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Two-feature scatter plot with draggable decision boundaries"
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
    >
      <defs>
        {/* One soft radial fade per class: strongest at the mean, gone by the
            drawn edge, which is what a Gaussian actually looks like. */}
        {CLASS_COLORS.map((c, i) => (
          <radialGradient key={i} id={`nb-airy-${i}`}>
            <stop offset="0%" stopColor={c} stopOpacity={0.34} />
            <stop offset="55%" stopColor={c} stopOpacity={0.14} />
            <stop offset="100%" stopColor={c} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>

      {/* Plot frame */}
      <rect
        x={LEFT}
        y={TOP}
        width={PLOT}
        height={PLOT}
        className="nb-plot__frame"
        rx={4}
      />

      {regionUrl && (
        <image
          href={regionUrl}
          x={LEFT}
          y={TOP}
          width={PLOT}
          height={PLOT}
          preserveAspectRatio="none"
        />
      )}

      {/* Zero gridlines, for orientation only. */}
      <line x1={scale.x(0)} y1={TOP} x2={scale.x(0)} y2={TOP + PLOT} className="nb-plot__grid" />
      <line x1={LEFT} y1={scale.y(0)} x2={LEFT + PLOT} y2={scale.y(0)} className="nb-plot__grid" />

      {/* True class shapes: airy disks, one per mixture component. A filled
          fade rather than a contour — the density has no edge, and drawing one
          invites reading it as a boundary. */}
      {showShapes &&
        scenario.classes.map((cm, ci) =>
          cm.components.map((comp, k) => {
            const e = covEllipse(comp.mean, comp.cov);
            // Two sigma, so the fade reaches zero inside the drawn radius.
            const rx = ((e.rx * 2) / (DOMAIN[1]! - DOMAIN[0]!)) * PLOT;
            const ry = ((e.ry * 2) / (DOMAIN[1]! - DOMAIN[0]!)) * PLOT;
            const cx = scale.x(e.cx);
            const cy = scale.y(e.cy);
            return (
              <ellipse
                key={`t-${ci}-${k}`}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                // Screen y runs opposite to data y, so the angle flips sign.
                transform={`rotate(${-e.angle} ${cx} ${cy})`}
                className="nb-plot__ellipse--airy"
                fill={`url(#nb-airy-${ci})`}
              />
            );
          }),
        )}

      {/* Fitted naive-Bayes ellipses, solid — never rotated, by construction. */}
      {showShapes &&
        nb &&
        scenario.classes.map((_, ci) => {
          const e = nbEllipse(nb, ci);
          if (!Number.isFinite(e.cx)) return null;
          return (
            <ellipse
              key={`f-${ci}`}
              cx={scale.x(e.cx)}
              cy={scale.y(e.cy)}
              rx={(e.rx / (DOMAIN[1]! - DOMAIN[0]!)) * PLOT}
              ry={(e.ry / (DOMAIN[1]! - DOMAIN[0]!)) * PLOT}
              className="nb-plot__ellipse nb-plot__ellipse--fit"
              stroke={CLASS_COLORS[ci]!}
            />
          );
        })}

      {/* The held-out points, behind the sample and faint enough to read as a
          different thing entirely. */}
      {showTest && (
        <g className="nb-plot__points nb-plot__points--test">
          {scenario.test.map((p, i) => (
            <circle
              key={i}
              cx={scale.x(p.x[0]!)}
              cy={scale.y(p.x[1]!)}
              r={1.9}
              fill={CLASS_COLORS[p.y]!}
            />
          ))}
        </g>
      )}

      {/* The held-out sample, drawn hollow and underneath so it reads as
          context rather than as more data to fit. */}
      {showTest && (
        <g className="nb-plot__test">
          {scenario.test.map((p, i) => (
            <circle
              key={i}
              cx={scale.x(p.x[0]!)}
              cy={scale.y(p.x[1]!)}
              r={1.7}
              fill={CLASS_COLORS[p.y]!}
            />
          ))}
        </g>
      )}

      {/* The sample. */}
      <g className="nb-plot__points">
        {scenario.train.map((p, i) => (
          <circle
            key={i}
            cx={scale.x(p.x[0]!)}
            cy={scale.y(p.x[1]!)}
            r={3.1}
            fill={CLASS_COLORS[p.y]!}
          />
        ))}
      </g>

      {/* Hand-placed boundaries. */}
      {student.rules.map((rule, i) => (
        <RuleLine
          key={rule.id}
          rule={rule}
          index={i}
          scale={scale}
          active={drag?.ruleIndex === i}
          onGrab={startDrag}
        />
      ))}

      {/* Margin curves — the whole of the fitted model, drawn twice. */}
      {margins && (
        <g className="nb-plot__margins">
          {scenario.classes.map((_, c) => (
            <path key={`b-${c}`} d={bottomPath(c)} stroke={CLASS_COLORS[c]!} />
          ))}
          {scenario.classes.map((_, c) => (
            <path key={`l-${c}`} d={leftPath(c)} stroke={CLASS_COLORS[c]!} />
          ))}
          <text x={LEFT} y={TOP + PLOT + MARGIN - 2} className="nb-plot__axis">
            feature 1 — fitted per-class curves
          </text>
          <text
            x={0}
            y={0}
            transform={`translate(${PAD + 8} ${TOP + PLOT}) rotate(-90)`}
            className="nb-plot__axis"
          >
            feature 2
          </text>
        </g>
      )}

      {!margins && (
        <>
          <text x={LEFT} y={TOP + PLOT + 22} className="nb-plot__axis">
            feature 1
          </text>
          <text
            x={0}
            y={0}
            transform={`translate(${LEFT - 14} ${TOP + PLOT}) rotate(-90)`}
            className="nb-plot__axis"
          >
            feature 2
          </text>
        </>
      )}
    </svg>
  );
}

interface RuleLineProps {
  rule: LineRule;
  index: number;
  scale: ReturnType<typeof makeScale>;
  active: boolean;
  onGrab: (e: React.PointerEvent, ruleIndex: number, part: DragPart) => void;
}

/** One boundary: the infinite line, a hatch marking the captured side, and
 *  three handles — two endpoints to swing it, one in the middle to slide it. */
function RuleLine({ rule, index, scale, active, onGrab }: RuleLineProps) {
  const clipped = clipLineToBox(rule.p1, rule.p2, DOMAIN[0]!, DOMAIN[1]!);
  if (!clipped) return null;
  const [a, b] = clipped;
  const color = CLASS_COLORS[rule.captures]!;
  const mid: [number, number] = [
    (rule.p1[0]! + rule.p2[0]!) / 2,
    (rule.p1[1]! + rule.p2[1]!) / 2,
  ];

  // Short arrow from the midpoint towards the captured side, so which half of
  // the plane the rule claims is visible on the plot and not only in the
  // controls.
  const dx = rule.p2[0]! - rule.p1[0]!;
  const dy = rule.p2[1]! - rule.p1[1]!;
  const len = Math.hypot(dx, dy) || 1;
  const sign = rule.flipped ? -1 : 1;
  // Normal chosen to agree with lineSide()'s cross-product convention.
  const nx = (-dy / len) * sign;
  const ny = (dx / len) * sign;
  const tipX = scale.x(mid[0]! + nx * 0.55);
  const tipY = scale.y(mid[1]! + ny * 0.55);

  return (
    <g className={"nb-rule" + (active ? " nb-rule--active" : "")}>
      <line
        x1={scale.x(a[0]!)}
        y1={scale.y(a[1]!)}
        x2={scale.x(b[0]!)}
        y2={scale.y(b[1]!)}
        stroke={color}
        className="nb-rule__line"
      />
      <line
        x1={scale.x(mid[0]!)}
        y1={scale.y(mid[1]!)}
        x2={tipX}
        y2={tipY}
        stroke={color}
        className="nb-rule__arrow"
      />
      <circle cx={tipX} cy={tipY} r={3} fill={color} />

      {(["p1", "p2"] as const).map((part) => (
        <circle
          key={part}
          cx={scale.x(rule[part]![0]!)}
          cy={scale.y(rule[part]![1]!)}
          r={7}
          fill={color}
          className="nb-rule__handle"
          onPointerDown={(e) => onGrab(e, index, part)}
        />
      ))}
      <rect
        x={scale.x(mid[0]!) - 6}
        y={scale.y(mid[1]!) - 6}
        width={12}
        height={12}
        rx={3}
        fill={color}
        className="nb-rule__handle nb-rule__handle--mid"
        onPointerDown={(e) => onGrab(e, index, "mid")}
      />
    </g>
  );
}
