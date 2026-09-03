// Gain against threshold for one continuous feature, drawn *underneath the node
// it is choosing for*.
//
// A binary feature offers the search exactly one candidate split. A continuous
// one offers a candidate at every midpoint between neighbouring values, so
// choosing it means answering a second question — *where* to cut — and this
// curve is that second search made visible.
//
// The curve alone is a plot of a function with no stakes: a reader has no
// reason yet to care that some number is higher at one x than another. So the
// node and the two children it would produce sit directly above, and dragging
// re-renders them live — the question text rewrites, the row counts change, and
// the two class-mix bars shift. At the peak the children go as clean as they
// can get; away from it they muddy back toward the parent's mix. That is the
// lesson made physical rather than asserted.
//
// The curve's x-axis is the feature's own axis, so the cut is a *point on it*,
// shaded blue to the left and red to the right to match the no/yes edges above.
// Once a threshold reads as an interval boundary, a later step showing the same
// feature cut three times needs no new vocabulary.

import { useCallback, useMemo, useRef } from "react";
import {
  classCounts,
  searchSplits,
  splitQuestion,
  type Criterion,
  type Dataset,
  type Row,
} from "./cart.js";
import {
  CLASS_PALETTE,
  EDGE_BOTH,
  EDGE_NO,
  EDGE_YES,
  GAIN_BAR,
  GAIN_BAR_WIN,
} from "./palette.js";

const W = 460;
const H = 170;
const PAD_L = 44;
const PAD_B = 30;
const PAD_T = 14;
const PAD_R = 14;

/* ── Split preview geometry ──────────────────────────────────────────────── */
const BOX_W = 150;
const BOX_H = 46;
const BAR_H = 11;
const CHILD_W = 132;
const CHILD_Y = 96;
const PREVIEW_H = 158;

export interface ThresholdCurveProps {
  dataset: Dataset;
  rows: Row[];
  featureIndex: number;
  criterion: Criterion;
  nClasses: number;
  /** Student's chosen threshold; when absent the peak is used. */
  value: number | null;
  onChange: (threshold: number) => void;
}

export function ThresholdCurve({
  dataset,
  rows,
  featureIndex,
  criterion,
  nClasses,
  value,
  onChange,
}: ThresholdCurveProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const feature = dataset.features[featureIndex]!;

  const { curve, best, lo, hi, peak } = useMemo(() => {
    const s = searchSplits(rows, dataset.features, { criterion, nClasses });
    const c = s.candidates[featureIndex]!;
    const vals = rows.map((r) => r.x[featureIndex]!);
    return {
      curve: c.curve,
      best: c.best,
      lo: Math.min(...vals),
      hi: Math.max(...vals),
      peak: Math.max(1e-9, ...c.curve.map((t) => t.gain)),
    };
  }, [rows, dataset.features, featureIndex, criterion, nClasses]);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const sx = (v: number) => PAD_L + ((v - lo) / Math.max(hi - lo, 1e-9)) * plotW;
  const sy = (g: number) => PAD_T + plotH - (g / peak) * plotH;

  const path = curve
    .map((t, i) => `${i === 0 ? "M" : "L"}${sx(t.threshold).toFixed(1)} ${sy(t.gain).toFixed(1)}`)
    .join(" ");

  const chosen = value ?? best?.threshold ?? (lo + hi) / 2;
  /** Gain at the nearest evaluated threshold — the score is a step function, so
   *  snapping to the nearest candidate is exactly right rather than an
   *  approximation. */
  const chosenGain = useMemo(() => {
    let bestT = curve[0];
    for (const t of curve) {
      if (!bestT || Math.abs(t.threshold - chosen) < Math.abs(bestT.threshold - chosen)) {
        bestT = t;
      }
    }
    return bestT?.gain ?? 0;
  }, [curve, chosen]);

  /** The split the chosen threshold actually produces — recomputed on every
   *  drag, so the preview above is always the true consequence of the cut. */
  const preview = useMemo(() => {
    const left = rows.filter((r) => r.x[featureIndex]! <= chosen);
    const right = rows.filter((r) => r.x[featureIndex]! > chosen);
    const mix = (rs: Row[]) => {
      if (!rs.length) return { n: 0, counts: [] as number[], top: 0 };
      const counts = classCounts(rs, nClasses);
      let top = 0;
      for (let i = 1; i < counts.length; i++) if (counts[i]! > counts[top]!) top = i;
      return { n: rs.length, counts, top };
    };
    return { left: mix(left), right: mix(right), n: rows.length };
  }, [rows, featureIndex, chosen, nClasses]);

  const onDrag = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons === 0) return;
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      const loc = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
      const v = lo + ((loc.x - PAD_L) / plotW) * (hi - lo);
      onChange(Math.max(lo, Math.min(hi, v)));
    },
    [hi, lo, onChange, plotW],
  );

  /** One node box: question or predicted class, row count, class-mix bar. */
  const nodeBox = (
    x: number,
    y: number,
    w: number,
    title: string,
    n: number,
    counts: number[],
    leaf: boolean,
  ) => (
    <g className={"tree__node" + (leaf ? " tree__node--leaf" : "")}>
      <rect x={x} y={y} width={w} height={BOX_H} rx={6} />
      <text x={x + 9} y={y + 18} className={leaf ? "tree__leaf-name" : "tree__question"}>
        {title}
      </text>
      <text x={x + 9} y={y + 31} className="tree__meta">
        {n} {n === 1 ? "row" : "rows"}
      </text>
      {counts.reduce<{ acc: number; out: JSX.Element[] }>(
        (st, c, ci) => {
          if (c === 0 || n === 0) return st;
          const bw = (c / n) * w;
          st.out.push(
            <rect
              key={ci}
              x={x + st.acc}
              y={y + BOX_H - BAR_H}
              width={bw}
              height={BAR_H}
              fill={CLASS_PALETTE[ci % CLASS_PALETTE.length]}
            />,
          );
          return { acc: st.acc + bw, out: st.out };
        },
        { acc: 0, out: [] },
      ).out}
    </g>
  );

  const rootCounts = useMemo(
    () => (rows.length ? classCounts(rows, nClasses) : []),
    [rows, nClasses],
  );

  // Each child is centred over the middle of the interval it owns, so the two
  // boxes sit above their own stretch of the axis below. They are then pushed
  // apart to a minimum gap and clamped into the frame — the tie to the axis is
  // worth keeping approximate, but two boxes must never overlap.
  const cutX = sx(chosen);
  const [leftCx, rightCx] = (() => {
    const half = CHILD_W / 2;
    const xMin = PAD_L;
    const xMax = W - PAD_R - CHILD_W;
    let l = (PAD_L + cutX) / 2 - half;
    let r = (cutX + PAD_L + plotW) / 2 - half;
    const GAP = 10;
    const overlap = l + CHILD_W + GAP - r;
    if (overlap > 0) {
      l -= overlap / 2;
      r += overlap / 2;
    }
    return [
      Math.max(xMin, Math.min(l, xMax - CHILD_W - GAP)),
      Math.min(xMax, Math.max(r, xMin + CHILD_W + GAP)),
    ];
  })();

  return (
    <div className="tcurve">
      <svg
        viewBox={`0 0 ${W} ${PREVIEW_H}`}
        width="100%"
        className="tcurve__preview"
        role="img"
        aria-label={
          `Split preview: ${splitQuestion(feature, chosen)} sends ` +
          `${preview.left.n} rows to no and ${preview.right.n} to yes`
        }
      >
        {nodeBox(
          (W - BOX_W) / 2,
          0,
          BOX_W,
          splitQuestion(feature, chosen),
          preview.n,
          rootCounts,
          false,
        )}

        {(() => {
          const x1 = W / 2;
          const y1 = BOX_H;
          // Fan out below the parent, not alongside it: a child sitting near
          // the centre would otherwise have its edge run behind the box.
          const midY = y1 + 22;
          const wOf = (n: number) =>
            Math.max(1.2, Math.sqrt(preview.n ? n / preview.n : 0) * 9);
          const wl = wOf(preview.left.n);
          const wr = wOf(preview.right.n);
          return (
            <>
              {(["left", "right"] as const).map((side) => {
                const cx = side === "left" ? leftCx : rightCx;
                const x2 = cx + CHILD_W / 2;
                // A very lopsided cut can park a child almost under the parent,
                // leaving a horizontal run too short for the word — which would
                // then sit on top of the trunk. Drop the label in that case:
                // the edge colour still says which branch it is.
                const run = Math.abs(x2 - x1);
                return (
                  <g key={side}>
                    <path
                      d={`M${x1} ${midY} H${x2} V${CHILD_Y}`}
                      className="tree__edge"
                      stroke={side === "left" ? EDGE_NO : EDGE_YES}
                      strokeWidth={side === "left" ? wl : wr}
                    />
                    {run > 34 && (
                      <text
                        x={(x1 + x2) / 2}
                        y={midY - 5}
                        className="tree__edge-label"
                        textAnchor="middle"
                      >
                        {side === "left" ? "no" : "yes"}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* The trunk carries both answers: purple, and as wide as the two
                  arms together. Drawn last so the arms cannot overlap it. */}
              <path
                d={`M${x1} ${y1} V${midY}`}
                className="tree__edge"
                stroke={EDGE_BOTH}
                strokeWidth={wl + wr}
              />
              {/* Cap over the junction: the three strokes' square ends overlap
                  raggedly there, and one purple disc resolves it into a joint. */}
              <circle cx={x1} cy={midY} r={(wl + wr) / 2} fill={EDGE_BOTH} />
            </>
          );
        })()}

        {nodeBox(
          leftCx,
          CHILD_Y,
          CHILD_W,
          preview.left.n ? dataset.classes?.[preview.left.top] ?? "" : "empty",
          preview.left.n,
          preview.left.counts,
          true,
        )}
        {nodeBox(
          rightCx,
          CHILD_Y,
          CHILD_W,
          preview.right.n ? dataset.classes?.[preview.right.top] ?? "" : "empty",
          preview.right.n,
          preview.right.counts,
          true,
        )}
      </svg>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="tcurve__svg"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          onDrag(e);
        }}
        onPointerMove={onDrag}
        role="img"
        aria-label={`Gain against threshold for ${feature.name}`}
      >
        {/* The cut as an interval boundary: everything left of it answers no,
            everything right answers yes. Same two colours as the edges above,
            so the link between "a threshold" and "a branch" is visible rather
            than stated. */}
        <rect
          x={PAD_L}
          y={PAD_T + plotH}
          width={Math.max(0, sx(chosen) - PAD_L)}
          height={6}
          fill={EDGE_NO}
          opacity={0.5}
        />
        <rect
          x={sx(chosen)}
          y={PAD_T + plotH}
          width={Math.max(0, PAD_L + plotW - sx(chosen))}
          height={6}
          fill={EDGE_YES}
          opacity={0.5}
        />

        <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} className="tcurve__axis" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} className="tcurve__axis" />

        {best && (
          <line
            x1={sx(best.threshold)}
            y1={PAD_T}
            x2={sx(best.threshold)}
            y2={PAD_T + plotH}
            className="tcurve__peak"
            stroke={GAIN_BAR_WIN}
          />
        )}
        <path d={path} className="tcurve__line" stroke={GAIN_BAR} />

        {/* Every candidate threshold, so the discreteness of the search is
            visible rather than implied by a smooth curve. */}
        {curve.map((t, i) => (
          <circle key={i} cx={sx(t.threshold)} cy={sy(t.gain)} r={2} fill={GAIN_BAR} opacity={0.5} />
        ))}

        <line
          x1={sx(chosen)}
          y1={PAD_T}
          x2={sx(chosen)}
          y2={PAD_T + plotH}
          className="tcurve__cursor"
        />
        <circle cx={sx(chosen)} cy={sy(chosenGain)} r={5} className="tcurve__knob" />

        <text x={PAD_L} y={H - 8} className="tcurve__label">
          {feature.name}
          {feature.unit ? ` (${feature.unit})` : ""}
        </text>
        <text x={PAD_L + plotW} y={H - 8} textAnchor="end" className="tcurve__label">
          cut at {chosen.toFixed(1)} → gain {chosenGain.toFixed(3)}
          {best && chosenGain < best.gain - 1e-9 ? ` (best ${best.gain.toFixed(3)})` : " ← best"}
        </text>
        <text
          x={0}
          y={0}
          transform={`translate(12 ${PAD_T + plotH}) rotate(-90)`}
          className="tcurve__label"
        >
          gain
        </text>
      </svg>
    </div>
  );
}
