// "Pooling and stride": a small interactive panel, a sibling of the kernel
// scan. One 8×8 feature map (a diagonal stroke, as a conv-1 edge kernel would
// see it), a pooling window that steps across it, and the smaller map it makes.
//
// Top to bottom in the middle column, like the scan card: the window's cells →
// keep the largest → one output cell. Students pick the window (2×2, 3×3) and
// the stride (1, 2, 3), then hover or tap either map, or press Play, and see
// the output shrink (or not) as the stride changes.
//
// Colour: the maps are feature maps, so greyscale (docs/style.md §11's
// recorded exception); the current window, its largest cell and the output
// cell it lands in are "this one", so they take the accent (§12, one selected
// state). Cells a stride never reaches are hatched and named in a note.

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { SegmentedControl } from "../../components/index.js";
import { input } from "../shared/palette.js";

// A diagonal stroke, values 0–9 (integers so students can do the max by eye).
const MAP = [
  [0, 0, 0, 0, 0, 1, 4, 8],
  [0, 0, 0, 0, 1, 5, 9, 3],
  [0, 0, 0, 1, 6, 8, 2, 0],
  [0, 0, 2, 7, 9, 2, 0, 0],
  [0, 1, 6, 8, 3, 0, 0, 0],
  [1, 5, 9, 2, 0, 0, 0, 0],
  [4, 8, 3, 0, 0, 0, 0, 1],
  [7, 2, 0, 0, 0, 0, 0, 0],
];
const N = MAP.length;
const VMAX = 9;

const VW = 760;
const CELL = 30;
const IN_X = 10, TOP = 44;
const MID_X = 330;              // zoom column (window → max → output cell)
const ZCELL = 34;
const OUT_X = 520;
const ACCENT = "var(--accent)";

const shade = (v: number) => input(v / VMAX);
/** Numbers on a grey cell: dark ink on light cells, paper on dark ones. */
const ink = (v: number) => (v / VMAX > 0.55 ? "var(--surface)" : "var(--text-body)");

function outSize(win: number, stride: number) {
  return Math.floor((N - win) / stride) + 1;
}

export function PoolingStride() {
  const [win, setWin] = useState(2);
  const [stride, setStride] = useState(2);
  const [rawPos, setPos] = useState({ r: 1, c: 2 });   // OUTPUT cell; starts on the stroke
  const [playing, setPlaying] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const M = outSize(win, stride);
  // Clamped at render: a smaller output (new stride) must never index off the map.
  const pos = { r: Math.min(rawPos.r, M - 1), c: Math.min(rawPos.c, M - 1) };
  // Input cells no window ever covers (the edge, or gaps when stride > window).
  const covered = (i: number) => {
    for (let k = 0; k < M; k++) if (i >= k * stride && i < k * stride + win) return true;
    return false;
  };
  const missed: { r: number; c: number }[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!covered(r) || !covered(c)) missed.push({ r, c });


  // Play: step the window through every output cell, row by row.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPos((p) => {
        const i = Math.min(p.r, M - 1) * M + Math.min(p.c, M - 1) + 1;
        return i >= M * M ? { r: 0, c: 0 } : { r: Math.floor(i / M), c: i % M };
      });
    }, 700);
    return () => window.clearInterval(id);
  }, [playing, M]);

  const r0 = pos.r * stride, c0 = pos.c * stride;
  const cells: { r: number; c: number; v: number }[] = [];
  for (let dr = 0; dr < win; dr++) for (let dc = 0; dc < win; dc++) {
    cells.push({ r: r0 + dr, c: c0 + dc, v: MAP[r0 + dr]![c0 + dc]! });
  }
  const best = cells.reduce((a, b) => (b.v > a.v ? b : a));
  const pooled = (r: number, c: number) => {
    let m = 0;
    for (let dr = 0; dr < win; dr++) for (let dc = 0; dc < win; dc++) m = Math.max(m, MAP[r * stride + dr]![c * stride + dc]!);
    return m;
  };

  // Pointer on either map picks an output cell (on the input: the window
  // whose top-left is nearest).
  const pick = (e: ReactPointerEvent, which: "in" | "out") => {
    const svg = svgRef.current; const ctm = svg?.getScreenCTM(); if (!svg || !ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const x0 = which === "in" ? IN_X : OUT_X;
    const c = Math.floor((pt.x - x0) / CELL), r = Math.floor((pt.y - TOP) / CELL);
    if (which === "out") {
      if (r >= 0 && r < M && c >= 0 && c < M) { setPlaying(false); setPos({ r, c }); }
    } else if (r >= 0 && r < N && c >= 0 && c < N) {
      setPlaying(false);
      const snap = (v: number) => Math.max(0, Math.min(M - 1, Math.floor((v - (win - 1) / 2) / stride + 0.5)));
      setPos({ r: snap(r), c: snap(c) });
    }
  };

  const zW = win * ZCELL;
  const zX = MID_X + (120 - zW) / 2;
  const zY = TOP;
  const resY = zY + 3 * ZCELL + 64;                  // fixed, so it doesn't jump
  const VH = TOP + N * CELL + 58;

  const overlap = stride < win;
  const gap = stride > win;

  return (
    <div className="cnn-pool">
      <div className="cnn-pool__controls">
        <span className="fig-label">window</span>
        <SegmentedControl options={[{ value: "2", label: "2×2" }, { value: "3", label: "3×3" }]}
          value={String(win)} onChange={(v) => setWin(Number(v))} />
        <span className="fig-label">stride</span>
        <SegmentedControl options={["1", "2", "3"]} value={String(stride)} onChange={(v) => setStride(Number(v))} />
        <button type="button" className={"mnist-clear" + (playing ? " mnist-clear--on" : "")}
          onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      <svg ref={svgRef} className="cnn-fig" viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} role="img"
        aria-label={`A ${win}×${win} max-pooling window moving ${stride} cell${stride > 1 ? "s" : ""} at a time over an 8×8 feature map, making a ${M}×${M} map.`}>
        <defs>
          <pattern id="cnn-pool-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="var(--border-strong)" strokeWidth={1.5} />
          </pattern>
        </defs>

        {/* Column heads. */}
        <text className="fig-label" x={IN_X} y={16}>input</text>
        <text className="fig-label-sub" x={IN_X} y={31}>8×8</text>
        <text className="fig-label" x={MID_X} y={16}>window</text>
        <text className="fig-label-sub" x={MID_X} y={31}>{win}×{win}, moves {stride}</text>
        <text className="fig-label" x={OUT_X} y={16}>output</text>
        <text className="fig-label-sub" x={OUT_X} y={31}>{M}×{M}</text>

        {/* Input map. */}
        <g style={{ cursor: "crosshair", touchAction: "none" }}
          onPointerDown={(e) => pick(e, "in")} onPointerMove={(e) => pick(e, "in")}>
          {MAP.flatMap((row, r) => row.map((v, c) => (
            <g key={`${r}-${c}`}>
              <rect x={IN_X + c * CELL} y={TOP + r * CELL} width={CELL} height={CELL}
                fill={shade(v)} stroke="var(--border)" strokeWidth={0.5} />
              <text className="fig-num" x={IN_X + (c + 0.5) * CELL} y={TOP + (r + 0.5) * CELL}
                textAnchor="middle" dominantBaseline="central" style={{ fill: ink(v) }}>{v}</text>
            </g>
          )))}
          {/* Cells no window reaches with this stride. */}
          {missed.map(({ r, c }) => (
            <rect key={`h-${r}-${c}`} x={IN_X + c * CELL} y={TOP + r * CELL} width={CELL} height={CELL}
              fill="url(#cnn-pool-hatch)" opacity={0.8} />
          ))}
          <rect x={IN_X} y={TOP} width={N * CELL} height={N * CELL} fill="none" stroke="#c9c2b8" />
          <rect x={IN_X + c0 * CELL} y={TOP + r0 * CELL} width={win * CELL} height={win * CELL}
            fill="none" stroke={ACCENT} strokeWidth={3} pointerEvents="none" />
        </g>

        {/* Zoom column: the window's cells → keep the largest → one cell. */}
        {cells.map(({ r, c, v }) => {
          const x = zX + (c - c0) * ZCELL, y = zY + (r - r0) * ZCELL;
          const isBest = r === best.r && c === best.c;
          return (
            <g key={`z-${r}-${c}`}>
              <rect x={x} y={y} width={ZCELL} height={ZCELL} fill={shade(v)} stroke="var(--border)" strokeWidth={0.75} />
              <text className={"fig-num" + (isBest ? " fig-on" : "")} x={x + ZCELL / 2} y={y + ZCELL / 2}
                textAnchor="middle" dominantBaseline="central" style={isBest && v / VMAX <= 0.55 ? undefined : { fill: ink(v) }}>{v}</text>
              {isBest && <rect x={x + 1.5} y={y + 1.5} width={ZCELL - 3} height={ZCELL - 3} fill="none" stroke={ACCENT} strokeWidth={2.5} />}
            </g>
          );
        })}
        <rect x={zX} y={zY} width={zW} height={zW} fill="none" stroke={ACCENT} strokeWidth={3} />
        <text className="cnn-card__op" x={MID_X + 60} y={resY - 36} textAnchor="middle" dominantBaseline="central">↓</text>
        <text className="fig-note" x={MID_X + 60} y={resY - 14} textAnchor="middle">keep the largest</text>
        <rect x={MID_X + 60 - ZCELL / 2} y={resY} width={ZCELL} height={ZCELL} fill={shade(best.v)} stroke={ACCENT} strokeWidth={3} />
        <text className="fig-num fig-on" x={MID_X + 60} y={resY + ZCELL / 2} textAnchor="middle" dominantBaseline="central"
          style={best.v / VMAX > 0.55 ? { fill: "var(--surface)" } : undefined}>{best.v}</text>

        {/* Flow arrows in the gutters, so the centre column stays whole. */}
        <text className="cnn-card__op" x={(IN_X + N * CELL + MID_X) / 2 + 12} y={TOP + ZCELL} textAnchor="middle" dominantBaseline="central">→</text>
        <text className="cnn-card__op" x={(MID_X + 120 + OUT_X) / 2} y={TOP + ZCELL} textAnchor="middle" dominantBaseline="central">→</text>

        {/* Output map. */}
        <g style={{ cursor: "crosshair", touchAction: "none" }}
          onPointerDown={(e) => pick(e, "out")} onPointerMove={(e) => pick(e, "out")}>
          {Array.from({ length: M * M }, (_, i) => {
            const r = Math.floor(i / M), c = i % M, v = pooled(r, c);
            return (
              <g key={`o-${i}`}>
                <rect x={OUT_X + c * CELL} y={TOP + r * CELL} width={CELL} height={CELL}
                  fill={shade(v)} stroke="var(--border)" strokeWidth={0.5} />
                <text className="fig-num" x={OUT_X + (c + 0.5) * CELL} y={TOP + (r + 0.5) * CELL}
                  textAnchor="middle" dominantBaseline="central" style={{ fill: ink(v) }}>{v}</text>
              </g>
            );
          })}
          <rect x={OUT_X} y={TOP} width={M * CELL} height={M * CELL} fill="none" stroke="#c9c2b8" />
          <rect x={OUT_X + pos.c * CELL} y={TOP + pos.r * CELL} width={CELL} height={CELL}
            fill="none" stroke={ACCENT} strokeWidth={3} pointerEvents="none" />
        </g>

        {/* What this setting does, in one line. */}
        <text className="fig-note" x={IN_X} y={TOP + N * CELL + 26}>
          {stride === win
            ? `Stride ${stride} = window ${win}: the windows tile the map without overlapping, so it shrinks ${stride}× each way.`
            : overlap
              ? `Stride ${stride} < window ${win}: neighbouring windows overlap, so the map ${stride === 1 ? "barely shrinks" : "shrinks less"}.`
              : `Stride ${stride} > window ${win}: the window skips cells between steps.`}
        </text>
        {missed.length > 0 && (
          <text className="fig-note" x={IN_X} y={TOP + N * CELL + 44}>
            {gap
              ? "Hatched: cells the window skips over. That is why the stride is rarely larger than the window."
              : "Hatched: cells no window reaches at this stride. Real networks usually pad the edge so none are lost."}
          </text>
        )}
      </svg>
    </div>
  );
}
