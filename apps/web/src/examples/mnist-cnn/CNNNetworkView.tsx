// The CNN visualization. One SVG, laid out top-to-bottom, mirroring the MLP
// example's house style (input at the top, output at the bottom):
//
//   input    20x20         the drawing grid (also the drawing surface)
//   conv 1   8 kernels (3x3) each shown above its 18x18 feature map
//   pool 1   8 maps (9x9)   2x2 max pool
//   conv 2   8 kernels (3x3 summary) above their 7x7 feature maps
//   pool 2   8 maps (3x3)   flattened to 72 values
//   dense    24 neurons     rounded-rect, like the MLP hidden layers
//   output   11 tiles       0-9 + blank
//
// Feature maps shade white->black by activation (per-map normalized so there's
// contrast). Kernels show their 3x3 weights as red (positive) / blue (negative)
// squares — the same weight vocabulary as the MLP example. Conv-2 kernels are
// really 3x3x8 stacks (one 3x3 per input channel); the swatch above each conv-2
// map is the channel-mean 3x3, a faithful summary of that filter's shape.
//
// Connections:
//  • pool2 -> dense and dense -> output are FULLY connected, so we draw them as
//    real thresholded red/blue lines (exactly like the MLP web).
//  • conv/pool connections are LOCAL (a conv cell sees a 3x3 patch; a pool cell
//    a 2x2 patch), so drawing them all would be noise. Instead they're revealed
//    on hover: hovering a cell highlights its receptive field in the layer
//    above.
//
// Clicking a conv-1 kernel arms the "scan": a 3x3 window over the INPUT grid
// with a visual panel (image patch x kernel -> products -> one output neuron).
//
// Drawing reuses the shared useGridDraw hook. SVG stays smooth by redrawing
// only on new activations (throttled upstream).

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CNNNet, CNNActivations } from "./cnn-net.js";
import { useGridDraw } from "../shared/useGridDraw.js";

export interface CNNNetworkViewProps {
  net: CNNNet;
  activations: CNNActivations | null;
  predicted: number;
  onInput: (v: Float32Array) => void;
  clearSignal: number;
  scanKernel: number | null;
  onPickKernel: (f: number | null) => void;
  /** Show the representative connectivity "Sankey" bands. */
  showWiring: boolean;
}

const VW = 1000;
const GRID = 20;

// Vertical band CENTERS (input at top). Chosen so the gap between one row's
// bottom edge and the next row's top edge is a uniform ROW_GAP everywhere
// (input->conv1 kernels, conv1 map->pool1, pool1->conv2 kernels, conv2
// map->pool2). Conv rows carry a kernel swatch (KSW) above the map, 14px above
// it. The dense/output rows below keep looser spacing for their connection fan.
const Y_INPUT = 150;
const Y_CONV1 = 416;
const Y_POOL1 = 552;
const Y_CONV2 = 732;
const Y_POOL2 = 844;
const Y_DENSE = 940;
const Y_OUT = 1025;
const VH = 1095;

const INPUT_BLOCK = 220;
const MAP1 = 108;   // conv1 (18x18)
const MAPP1 = 72;   // pool1 (9x9)
const MAP2 = 84;    // conv2 (7x7)
const MAPP2 = 48;   // pool2 (3x3)
const KSW = 42;     // kernel swatch (3x3)

function shade(v: number): string {
  const t = Math.max(0, Math.min(1, v));
  const g = Math.round(255 * (1 - t));
  return `rgb(${g},${g},${g})`;
}
// Positive weight -> red, negative -> blue, intensity by |w|/scale.
function weightFill(w: number, scale: number): string {
  const t = Math.max(0, Math.min(1, Math.abs(w) / scale));
  if (w >= 0) { const c = Math.round(255 * (1 - t)); return `rgb(209,${52 + c * 0.6},${75 + c * 0.5})`; }
  const c = Math.round(255 * (1 - t)); return `rgb(${47 + c * 0.6},${111 + c * 0.4},208)`;
}
function rowCenters(n: number, cx: number, w: number): number[] {
  const gap = w / n;
  return Array.from({ length: n }, (_, i) => cx - w / 2 + gap * (i + 0.5));
}

// Geometry of one rendered map, so hover -> cell and receptive-field boxes work
// uniformly across every layer.
interface MapGeo { x: number; y: number; size: number; cols: number; rows: number; }
function cellRect(g: MapGeo, r: number, c: number) {
  const cw = g.size / g.cols, ch = g.size / g.rows;
  return { x: g.x + c * cw, y: g.y + r * ch, w: cw, h: ch };
}

// A hovered cell in some layer.
type Hover =
  | { layer: "conv1" | "pool1" | "conv2" | "pool2"; ch: number; r: number; c: number }
  | null;

function FeatureMap({ buf, ch, h, w, x, y, size, norm, dim }: {
  buf: Float32Array; ch: number; h: number; w: number;
  x: number; y: number; size: number; norm: number; dim?: boolean;
}) {
  const cw = size / w, chh = size / h;
  const cells = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const v = buf[ch * h * w + r * w + c]! / norm;
    cells.push(<rect key={`${r}-${c}`} x={x + c * cw} y={y + r * chh} width={cw + 0.4} height={chh + 0.4} fill={shade(v)} />);
  }
  return <g opacity={dim ? 0.55 : 1}>{cells}<rect x={x} y={y} width={size} height={size} fill="none" stroke="#c9c2b8" strokeWidth={1} /></g>;
}

export function CNNNetworkView({
  net, activations, predicted, onInput, clearSignal, scanKernel, onPickKernel, showWiring,
}: CNNNetworkViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const gx0 = VW / 2 - INPUT_BLOCK / 2;
  const gy0 = Y_INPUT - INPUT_BLOCK / 2;
  const cellS = INPUT_BLOCK / GRID;

  const draw = useGridDraw({ grid: GRID, svgRef, gx0, gy0, block: INPUT_BLOCK, onInput, clearSignal });

  const [scan, setScan] = useState<{ r: number; c: number }>({ r: 9, c: 9 });
  const [hover, setHover] = useState<Hover>(null);
  // Which conv-2 filter's 8-slice popup is open (or null). Clicking anywhere
  // dismisses it.
  const [conv2Popup, setConv2Popup] = useState<number | null>(null);
  const armed = scanKernel != null;

  const eventCell = (e: ReactPointerEvent): { r: number; c: number } | null => {
    const svg = svgRef.current; if (!svg) return null;
    const ctm = svg.getScreenCTM(); if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const c = Math.floor((pt.x - gx0) / cellS), r = Math.floor((pt.y - gy0) / cellS);
    if (c < 0 || c >= GRID || r < 0 || r >= GRID) return null;
    return { r, c };
  };
  const moveScan = (e: ReactPointerEvent) => {
    const cell = eventCell(e); if (!cell) return;
    setScan({ r: Math.max(0, Math.min(GRID - 3, cell.r - 1)), c: Math.max(0, Math.min(GRID - 3, cell.c - 1)) });
  };

  // Per-map normalizers (dynamic intensity is fine — it's the physical size
  // that must stay fixed).
  const norm = (buf: Float32Array | undefined, count: number, per: number) => {
    if (!buf) return new Array(count).fill(1);
    const out = new Array(count).fill(1e-6);
    for (let ch = 0; ch < count; ch++) { let m = 1e-6; for (let i = 0; i < per; i++) { const v = buf[ch * per + i]!; if (v > m) m = v; } out[ch] = m; }
    return out;
  };
  const n1 = useMemo(() => norm(activations?.conv1, net.f1, net.c1 * net.c1), [activations, net]);
  const np1 = useMemo(() => norm(activations?.pool1, net.f1, net.p1 * net.p1), [activations, net]);
  const n2 = useMemo(() => norm(activations?.conv2, net.f2, net.c2 * net.c2), [activations, net]);
  const np2 = useMemo(() => norm(activations?.pool2, net.f2, net.p2 * net.p2), [activations, net]);
  const nd = useMemo(() => { if (!activations) return 1; let m = 1e-6; for (const v of activations.dense) if (v > m) m = v; return m; }, [activations]);

  const k1scale = useMemo(() => { let m = 1e-6; for (const w of net.k1) m = Math.max(m, Math.abs(w)); return m; }, [net]);
  // Channel-mean 3x3 summary of each conv-2 filter (which is really 3x3x8).
  const k2mean = useMemo(() => {
    const out = new Float32Array(net.f2 * 9);
    for (let f = 0; f < net.f2; f++) for (let i = 0; i < 9; i++) {
      let s = 0; for (let ch = 0; ch < net.f1; ch++) s += net.k2[(f * net.f1 + ch) * 9 + i]!;
      out[f * 9 + i] = s / net.f1;
    }
    return out;
  }, [net]);
  const k2scale = useMemo(() => { let m = 1e-6; for (const w of k2mean) m = Math.max(m, Math.abs(w)); return m; }, [k2mean]);

  const colW = 820;
  const colX = rowCenters(net.f1, VW / 2, colW);

  // Map geometry per layer/channel (for hover + receptive fields).
  const conv1Geo = (f: number): MapGeo => ({ x: colX[f]! - MAP1 / 2, y: Y_CONV1 - MAP1 / 2, size: MAP1, cols: net.c1, rows: net.c1 });
  const pool1Geo = (f: number): MapGeo => ({ x: colX[f]! - MAPP1 / 2, y: Y_POOL1 - MAPP1 / 2, size: MAPP1, cols: net.p1, rows: net.p1 });
  const conv2Geo = (f: number): MapGeo => ({ x: colX[f]! - MAP2 / 2, y: Y_CONV2 - MAP2 / 2, size: MAP2, cols: net.c2, rows: net.c2 });
  const pool2Geo = (f: number): MapGeo => ({ x: colX[f]! - MAPP2 / 2, y: Y_POOL2 - MAPP2 / 2, size: MAPP2, cols: net.p2, rows: net.p2 });
  const inputGeo: MapGeo = { x: gx0, y: gy0, size: INPUT_BLOCK, cols: GRID, rows: GRID };

  // ── "Show wiring" Sankey bands ──────────────────────────────────────────────
  // Representative connectivity, drawn as soft curved purple ribbons under the
  // maps. It does NOT draw every connection (that's the local-conv noise we
  // avoid) — it shows the PATTERN with one representative column:
  //   input  -> the most-active conv-1 map        (input feeds each conv-1 map)
  //   conv1  -> its pool-1 map                     (1:1, same channel)
  //   ALL pool-1 maps -> the most-active conv-2 map (fan-in: conv-2 mixes all 8)
  //   conv2  -> its pool-2 map                      (1:1)
  // "Most-active" makes the highlighted column track what the drawing lights up.
  const activeIdx = (buf: Float32Array | undefined, count: number, per: number) => {
    if (!buf) return Math.floor(count / 2);
    let best = -1, bi = 0;
    for (let ch = 0; ch < count; ch++) { let s = 0; for (let i = 0; i < per; i++) s += buf[ch * per + i]!; if (s > best) { best = s; bi = ch; } }
    return bi;
  };
  const wireC1 = activeIdx(activations?.conv1, net.f1, net.c1 * net.c1);
  const wireC2 = activeIdx(activations?.conv2, net.f2, net.c2 * net.c2);

  // A filled cubic-Bézier ribbon from a source segment (bottom edge of one map)
  // to a destination segment (top edge of another). Verticals are eased so the
  // ribbon curves smoothly between rows.
  const ribbon = (sx0: number, sx1: number, sy: number, dx0: number, dx1: number, dy: number) => {
    const my = (sy + dy) / 2;
    // left edge goes sx0 -> dx0, right edge dx1 -> sx1 (so the band closes).
    return `M ${sx0} ${sy} C ${sx0} ${my} ${dx0} ${my} ${dx0} ${dy} `
      + `L ${dx1} ${dy} C ${dx1} ${my} ${sx1} ${my} ${sx1} ${sy} Z`;
  };
  // Bottom-edge and top-edge segments of a map, optionally insetting the width
  // so fan-in ribbons from 8 sources don't fully overlap at the destination.
  const bottomSeg = (g: MapGeo, frac = 1) => { const w = g.size * frac, cx = g.x + g.size / 2; return { x0: cx - w / 2, x1: cx + w / 2, y: g.y + g.size }; };
  const topSeg = (g: MapGeo, frac = 1) => { const w = g.size * frac, cx = g.x + g.size / 2; return { x0: cx - w / 2, x1: cx + w / 2, y: g.y }; };

  // Dense + output node centers (fully-connected below). The dense row matches
  // the MLP hidden layers exactly: DENSE_NODE-px rounded squares (rx 9) with a
  // 3px gap, so its width is dense * (DENSE_NODE + 3).
  const DENSE_NODE = 25;
  const DENSE_RX = 9;
  // Match the MLP hidden-layer spacing exactly: there, centers are 28.5px apart
  // (a 25px node with a 3.5px gap). rowCenters spaces centers by width/n, so
  // width = n * 28.5.
  const denseW = net.dense * (DENSE_NODE + 3.5);
  const denseX = rowCenters(net.dense, VW / 2, denseW);
  const outX = rowCenters(net.outN, VW / 2, 880);
  const denseTop = (i: number) => ({ x: denseX[i]!, y: Y_DENSE - DENSE_NODE / 2 });
  const denseBot = (i: number) => ({ x: denseX[i]!, y: Y_DENSE + DENSE_NODE / 2 });
  const outTop = (i: number) => ({ x: outX[i]!, y: Y_OUT - 20 });
  // pool2 flat index f*p2*p2 + r*p2 + c -> the bottom-center of that pool2 cell.
  const flatAnchor = (idx: number) => {
    const per = net.p2 * net.p2, f = Math.floor(idx / per), rem = idx % per;
    const r = Math.floor(rem / net.p2), c = rem % net.p2;
    const g = pool2Geo(f), cr = cellRect(g, r, c);
    return { x: cr.x + cr.w / 2, y: g.y + g.size };
  };

  // Dense-layer edges. Scored by |WEIGHT| (the wired connection strength), NOT
  // by weight*activation: scoring by activation dropped every edge of a
  // currently-inactive pool2 cell, so that cell showed no lines at all. Weight
  // magnitude is stable and shows the actual structure — the most extreme
  // (strongest-magnitude) connections. We keep roughly the strongest ~30% (well
  // under half, to render fast), and additionally guarantee every source keeps
  // its single strongest wire so no cell is ever blank.
  const denseEdges = useMemo(() => {
    // src -> dst edges scored by |weight|; keep the top `frac` plus each src's
    // own strongest edge.
    const build = (
      W: Float32Array, dstCount: number, srcCount: number,
      anchorA: (j: number) => { x: number; y: number },
      anchorB: (i: number) => { x: number; y: number },
      frac: number,
    ) => {
      type E = { a: {x:number;y:number}; b:{x:number;y:number}; w:number; s:number; src: number };
      const all: E[] = [];
      const bestPerSrc: (E | null)[] = new Array(srcCount).fill(null);
      for (let i = 0; i < dstCount; i++) for (let j = 0; j < srcCount; j++) {
        const w = W[i * srcCount + j]!, s = Math.abs(w);
        const e: E = { a: anchorA(j), b: anchorB(i), w, s, src: j };
        all.push(e);
        if (!bestPerSrc[j] || s > bestPerSrc[j]!.s) bestPerSrc[j] = e;
      }
      all.sort((p, q) => q.s - p.s);
      const keep = new Set<E>(all.slice(0, Math.ceil(all.length * frac)));
      for (const e of bestPerSrc) if (e) keep.add(e); // every source keeps one
      return [...keep];
    };
    const d1 = build(net.wd, net.dense, net.flat, flatAnchor, denseTop, 0.3);
    const d2 = build(net.wo, net.outN, net.dense, denseBot, outTop, 0.3);
    return { d1, d2 };
  }, [net]);

  // Receptive field of a hovered cell in the layer above.
  const receptive = useMemo(() => {
    if (!hover) return null;
    if (hover.layer === "pool1") {
      // pool1 cell (r,c) <- conv1 2x2 at (2r,2c)..(2r+1,2c+1)
      const g = conv1Geo(hover.ch), a = cellRect(g, hover.r * 2, hover.c * 2), b = cellRect(g, hover.r * 2 + 1, hover.c * 2 + 1);
      return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
    }
    if (hover.layer === "pool2") {
      const g = conv2Geo(hover.ch), a = cellRect(g, hover.r * 2, hover.c * 2), b = cellRect(g, hover.r * 2 + 1, hover.c * 2 + 1);
      return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
    }
    if (hover.layer === "conv1") {
      // conv1 cell (r,c) <- input 3x3 at (r,c)..(r+2,c+2)
      const a = cellRect(inputGeo, hover.r, hover.c), b = cellRect(inputGeo, hover.r + 2, hover.c + 2);
      return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
    }
    // conv2 is handled specially in the pool-1 render (it boxes ALL 8 channels,
    // since a conv-2 filter reads a 3x3 across every pool-1 channel at once), so
    // there's no single box to return here.
    return null;
  }, [hover, net]);

  // For a conv-2 hover, the 3x3 window boxed on any pool-1 channel `ch`. The
  // window is at the same (r,c) in every channel — that's the depth-8 receptive
  // field a conv-2 filter actually reads.
  const conv2Window = (ch: number) => {
    if (!hover || hover.layer !== "conv2") return null;
    const g = pool1Geo(ch);
    const a = cellRect(g, hover.r, hover.c), b = cellRect(g, hover.r + 2, hover.c + 2);
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
  };

  // A transparent per-cell hover grid over a feature map (so we can catch which
  // cell the pointer is on without hit-testing thousands of colored rects).
  const hoverGrid = (layer: "conv1" | "pool1" | "conv2" | "pool2", ch: number, g: MapGeo) => {
    const cells = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const cr = cellRect(g, r, c);
      cells.push(<rect key={`${r}-${c}`} x={cr.x} y={cr.y} width={cr.w} height={cr.h} fill="transparent"
        onPointerEnter={() => setHover({ layer, ch, r, c })}
        onPointerLeave={() => setHover((h) => (h && h.layer === layer && h.ch === ch && h.r === r && h.c === c ? null : h))} />);
    }
    return <g style={{ cursor: "crosshair" }}>{cells}</g>;
  };

  return (
    <svg ref={svgRef} className="mnist-net" viewBox={`0 0 ${VW} ${VH}`} width="100%"
      preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Convolutional network: draw a digit at the top; kernels, feature maps, pooling, a dense layer, then the output digits.">

      {/* "Show wiring" Sankey ribbons — drawn FIRST so every map sits on top.
          Soft purple, curved. input->activeConv1, conv1->pool1 (1:1), ALL
          pool1->activeConv2 (fan-in), conv2->pool2 (1:1). */}
      {showWiring && (() => {
        const PURPLE = "#7c5cc4";
        const c1 = conv1Geo(wireC1), p1 = pool1Geo(wireC1);
        const c2 = conv2Geo(wireC2), p2 = pool2Geo(wireC2);
        // input -> active conv1 (input bottom edge is wide; taper into conv1)
        const inB = bottomSeg(inputGeo, 0.5), c1T = topSeg(c1);
        // conv1 -> its pool1
        const c1B = bottomSeg(c1), p1T = topSeg(p1);
        // fan-in: each pool1 map -> a distinct slice of the active conv2's top
        const c2top = topSeg(c2);
        const slice = (c2top.x1 - c2top.x0) / net.f1;
        // active conv2 -> its pool2
        const c2B = bottomSeg(c2), p2T = topSeg(p2);
        return (
          <g className="mnist-wiring" pointerEvents="none" fill={PURPLE}>
            <path d={ribbon(inB.x0, inB.x1, inB.y, c1T.x0, c1T.x1, c1T.y)} fillOpacity={0.1} />
            <path d={ribbon(c1B.x0, c1B.x1, c1B.y, p1T.x0, p1T.x1, p1T.y)} fillOpacity={0.13} />
            {Array.from({ length: net.f1 }, (_, s) => {
              const src = bottomSeg(pool1Geo(s), 0.7);
              const dx0 = c2top.x0 + s * slice, dx1 = dx0 + slice;
              return <path key={s} d={ribbon(src.x0, src.x1, src.y, dx0, dx1, c2top.y)} fillOpacity={0.09} />;
            })}
            <path d={ribbon(c2B.x0, c2B.x1, c2B.y, p2T.x0, p2T.x1, p2T.y)} fillOpacity={0.13} />
          </g>
        );
      })()}

      {/* Layer captions. */}
      <g className="mnist-net__labels" fontSize={13}>
        <text x={10} y={Y_INPUT} dominantBaseline="middle">input</text>
        <text x={10} y={Y_CONV1 - 96} dominantBaseline="middle">conv 1</text>
        <text x={10} y={Y_POOL1} dominantBaseline="middle">pool 1</text>
        <text x={10} y={Y_CONV2 - 96} dominantBaseline="middle">conv 2</text>
        <text x={10} y={Y_POOL2} dominantBaseline="middle">pool 2</text>
        <text x={10} y={Y_DENSE} dominantBaseline="middle">dense</text>
        <text x={10} y={Y_OUT} dominantBaseline="middle">output</text>
      </g>

      {/* Fully-connected edges (pool2 -> dense -> output), drawn under nodes. */}
      <g strokeLinecap="round">
        {denseEdges.d1.map((e, i) => (
          <line key={`de1-${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
            stroke={e.w >= 0 ? "#d1344b" : "#2f6fd0"} strokeOpacity={0.28} strokeWidth={0.8} />
        ))}
        {denseEdges.d2.map((e, i) => (
          <line key={`de2-${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
            stroke={e.w >= 0 ? "#d1344b" : "#2f6fd0"} strokeOpacity={0.4} strokeWidth={1} />
        ))}
      </g>

      {/* Input grid (also the drawing surface). */}
      <g>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const r = Math.floor(i / GRID), c = i % GRID;
          const v = activations ? activations.raw[i]! : 0;
          return <rect key={`in-${i}`} x={gx0 + c * cellS} y={gy0 + r * cellS} width={cellS} height={cellS} fill={shade(v)} stroke="#e7e2da" strokeWidth={0.4} />;
        })}
        <rect x={gx0} y={gy0} width={INPUT_BLOCK} height={INPUT_BLOCK} fill="none" stroke="#888" strokeWidth={1.5} />
        <rect className="mnist-net__draw" x={gx0} y={gy0} width={INPUT_BLOCK} height={INPUT_BLOCK} fill="transparent"
          style={{ cursor: armed ? "cell" : "crosshair", touchAction: "none" }}
          onPointerDown={armed ? moveScan : draw.onPointerDown}
          onPointerMove={armed ? moveScan : draw.onPointerMove}
          onPointerUp={armed ? undefined : draw.onPointerUp}
          onPointerLeave={armed ? undefined : draw.onPointerUp} />
        {armed && (
          <rect x={gx0 + scan.c * cellS} y={gy0 + scan.r * cellS} width={cellS * 3} height={cellS * 3}
            fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2.5} pointerEvents="none" />
        )}
        {/* Receptive-field highlight lands on the input when hovering conv1. */}
        {receptive && hover?.layer === "conv1" && (
          <rect x={receptive.x} y={receptive.y} width={receptive.w} height={receptive.h}
            fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2.5} pointerEvents="none" />
        )}
      </g>

      {/* Visual convolution panel (click a conv-1 kernel). Image patch x kernel
          -> element-wise products -> one output neuron. */}
      {armed && activations && (() => {
        const f = scanKernel!, kb = f * 9;
        const patch: number[] = [], prod: number[] = [];
        let sum = net.b1[f]!;
        for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
          const px = activations.input[(scan.r + ky) * GRID + (scan.c + kx)]!;
          const w = net.k1[kb + ky * 3 + kx]!;
          patch.push(px); prod.push(px * w); sum += px * w;
        }
        const relu = Math.max(0, sum);
        // Normalize products to [-1,1] for grayscale display (signed -> we map
        // magnitude to darkness, sign is inherent in the value).
        let pmax = 1e-6; for (const p of prod) pmax = Math.max(pmax, Math.abs(p));
        const px0 = gx0 + INPUT_BLOCK + 30, py0 = gy0 + 4;
        const cell = 26;
        const gridW = cell * 3;
        const kX = px0, imgX = px0 + gridW + 40; // kernel left, image right (row 1)
        const prodY = py0 + gridW + 46;          // products grid top (row 2)
        // Output neuron sits to the RIGHT of the products grid (not below), so
        // the panel stays short and doesn't overlap the network below.
        const outX2 = imgX + (gridW - DENSE_NODE) / 2; // centered under the kernel column
        const outCY = prodY + gridW / 2;
        const panelBottom = prodY + gridW + 22;
        const panelW = imgX + gridW - px0 + 24;
        const draw3 = (vals: number[], x: number, y: number, kind: "gray" | "weight") => (
          Array.from({ length: 9 }, (_, i) => {
            const r = Math.floor(i / 3), c = i % 3;
            const fill = kind === "weight" ? weightFill(vals[i]!, k1scale) : shade(vals[i]!);
            return <rect key={i} x={x + c * cell} y={y + r * cell} width={cell} height={cell} fill={fill} stroke="#e7e2da" strokeWidth={0.6} />;
          })
        );
        return (
          <g className="mnist-conv-panel" pointerEvents="none" fontFamily="var(--font-mono, monospace)">
            <rect x={px0 - 16} y={py0 - 16} width={panelW + 20} height={panelBottom - py0 + 16} rx={10}
              fill="var(--surface,#fff)" stroke="var(--accent,#2b62a8)" strokeWidth={1.5} />
            <text x={px0 - 4} y={py0 + 4} fontSize={11} fill="var(--text-muted,#78716a)">kernel {f} · convolution</text>
            {/* row 1: image patch  ×  kernel */}
            {draw3(patch, kX, py0 + 14, "gray")}
            <rect x={kX} y={py0 + 14} width={gridW} height={gridW} fill="none" stroke="#888" strokeWidth={1} />
            <text x={kX + gridW + 20} y={py0 + 14 + gridW / 2} fontSize={20} textAnchor="middle" dominantBaseline="central" fill="var(--text-secondary,#57514a)">×</text>
            {draw3(net.k1.slice(f * 9, f * 9 + 9) as unknown as number[], imgX, py0 + 14, "weight")}
            <rect x={imgX} y={py0 + 14} width={gridW} height={gridW} fill="none" stroke="#888" strokeWidth={1} rx={3} />
            <text x={kX + 4} y={py0 + 14 + gridW + 14} fontSize={9} fill="var(--text-faint,#a8a097)">image patch</text>
            <text x={imgX + 4} y={py0 + 14 + gridW + 14} fontSize={9} fill="var(--text-faint,#a8a097)">kernel</text>
            {/* row 2: products (left)  ->  output neuron (right) */}
            <text x={px0 - 4} y={prodY - 8} fontSize={10} fill="var(--text-secondary,#57514a)">↓ multiply, cell by cell</text>
            {Array.from({ length: 9 }, (_, i) => {
              const r = Math.floor(i / 3), c = i % 3;
              const x = kX + c * cell, y = prodY + r * cell;
              return <rect key={i} x={x} y={y} width={cell} height={cell} fill={shade(Math.abs(prod[i]!) / pmax)} stroke="#e7e2da" strokeWidth={0.6} />;
            })}
            <rect x={kX} y={prodY} width={gridW} height={gridW} fill="none" stroke="#888" strokeWidth={1} />
            {/* arrow: sum + ReLU -> output neuron on the right */}
            <text x={kX + gridW + 20} y={prodY + gridW / 2 - 5} fontSize={16} textAnchor="middle" dominantBaseline="central" fill="var(--text-secondary,#57514a)">→</text>
            <text x={kX + gridW + 20} y={prodY + gridW / 2 + 12} fontSize={8} textAnchor="middle" fill="var(--text-faint,#a8a097)">sum+ReLU</text>
            <rect x={outX2} y={outCY - DENSE_NODE / 2} width={DENSE_NODE} height={DENSE_NODE} rx={DENSE_RX} ry={DENSE_RX}
              fill={shade(Math.min(1, relu / (pmax * 3 + 1e-6)))} stroke="#888888" strokeWidth={2} />
            <text x={outX2 + DENSE_NODE / 2} y={outCY + DENSE_NODE / 2 + 14} fontSize={11} textAnchor="middle" fill="var(--text-body,#3f3a34)">{relu.toFixed(2)}</text>
          </g>
        );
      })()}

      {/* Conv 1: clickable kernel swatch above each feature map + hover grid. */}
      <g>
        {colX.map((cx, f) => {
          const kx = cx - KSW / 2, ky = Y_CONV1 - MAP1 / 2 - KSW - 14;
          const g = conv1Geo(f);
          const isArmed = scanKernel === f;
          return (
            <g key={`c1-${f}`}>
              <g style={{ cursor: "pointer" }} onClick={() => onPickKernel(isArmed ? null : f)}>
                {Array.from({ length: 9 }, (_, i) => {
                  const w = net.k1[f * 9 + i]!, r = Math.floor(i / 3), c = i % 3, cs = KSW / 3;
                  return <rect key={i} x={kx + c * cs} y={ky + r * cs} width={cs} height={cs} fill={weightFill(w, k1scale)} stroke="#fff" strokeWidth={0.5} />;
                })}
                <rect x={kx} y={ky} width={KSW} height={KSW} fill="none" stroke={isArmed ? "var(--accent,#2b62a8)" : "#888"} strokeWidth={isArmed ? 3 : 1.5} rx={4} />
              </g>
              {activations
                ? <FeatureMap buf={activations.conv1} ch={f} h={net.c1} w={net.c1} x={g.x} y={g.y} size={MAP1} norm={n1[f]} dim={!!hover && !(hover.layer === "conv1" && hover.ch === f)} />
                : <rect x={g.x} y={g.y} width={MAP1} height={MAP1} fill="#fff" stroke="#c9c2b8" />}
              {activations && hoverGrid("conv1", f, g)}
            </g>
          );
        })}
      </g>

      {/* Pool 1. When a conv-2 cell is hovered, the 3x3 receptive-field box is
          drawn on EVERY pool-1 map — a conv-2 filter reads a 3x3 across all 8
          channels at once, so the true window is depth-8, not a single map. */}
      <g>
        {colX.map((cx, f) => {
          const g = pool1Geo(f);
          const c2win = conv2Window(f);
          // Dim pool-1 maps that aren't part of the current hover focus.
          const dimP1 = !!hover && hover.layer === "pool1" && hover.ch !== f;
          return (
            <g key={`p1-${f}`}>
              {activations && <FeatureMap buf={activations.pool1} ch={f} h={net.p1} w={net.p1} x={g.x} y={g.y} size={MAPP1} norm={np1[f]} dim={dimP1} />}
              {/* receptive field of a hovered pool1 cell lands here on conv1 */}
              {receptive && hover?.layer === "pool1" && hover.ch === f && (
                <rect x={receptive.x} y={receptive.y} width={receptive.w} height={receptive.h} fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2} pointerEvents="none" />
              )}
              {/* depth-8 receptive field of a hovered conv-2 cell, on this map */}
              {c2win && (
                <rect x={c2win.x} y={c2win.y} width={c2win.w} height={c2win.h} fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2} pointerEvents="none" />
              )}
              {activations && hoverGrid("pool1", f, g)}
            </g>
          );
        })}
      </g>

      {/* Conv 2: kernel swatch (channel-mean 3x3 summary) above each map. */}
      <g>
        {colX.map((cx, f) => {
          const kx = cx - KSW / 2, ky = Y_CONV2 - MAP2 / 2 - KSW - 14;
          const g = conv2Geo(f);
          return (
            <g key={`c2-${f}`}>
              {/* Clickable kernel: a subtle STACK behind the swatch hints that
                  each conv-2 filter is really 8 stacked 3x3s (one per pool-1
                  channel). Click opens the full 8-slice popup. */}
              <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setConv2Popup(f); }}>
                {/* two offset shadow tiles = the "there are more behind" cue */}
                <rect x={kx + 6} y={ky - 6} width={KSW} height={KSW} rx={4} fill="#efece6" stroke="#c9c2b8" strokeWidth={1} />
                <rect x={kx + 3} y={ky - 3} width={KSW} height={KSW} rx={4} fill="#f6f4ef" stroke="#c9c2b8" strokeWidth={1} />
                {/* the summary swatch (channel-mean 3x3) on top */}
                {Array.from({ length: 9 }, (_, i) => {
                  const w = k2mean[f * 9 + i]!, r = Math.floor(i / 3), c = i % 3, cs = KSW / 3;
                  return <rect key={i} x={kx + c * cs} y={ky + r * cs} width={cs} height={cs} fill={weightFill(w, k2scale)} stroke="#fff" strokeWidth={0.5} />;
                })}
                <rect x={kx} y={ky} width={KSW} height={KSW} fill="none" stroke="#888" strokeWidth={1.5} rx={4} />
              </g>
              {activations && <FeatureMap buf={activations.conv2} ch={f} h={net.c2} w={net.c2} x={g.x} y={g.y} size={MAP2} norm={n2[f]} dim={!!hover && !(hover.layer === "conv2" && hover.ch === f)} />}
              {activations && hoverGrid("conv2", f, g)}
            </g>
          );
        })}
      </g>

      {/* Pool 2. */}
      <g>
        {colX.map((cx, f) => {
          const g = pool2Geo(f);
          return (
            <g key={`p2-${f}`}>
              {activations && <FeatureMap buf={activations.pool2} ch={f} h={net.p2} w={net.p2} x={g.x} y={g.y} size={MAPP2} norm={np2[f]} dim={!!hover && !(hover.layer === "pool2" && hover.ch === f)} />}
              {receptive && hover?.layer === "pool2" && hover.ch === f && (
                <rect x={receptive.x} y={receptive.y} width={receptive.w} height={receptive.h} fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2} pointerEvents="none" />
              )}
              {activations && hoverGrid("pool2", f, g)}
            </g>
          );
        })}
      </g>

      {/* Dense neurons — heavily-rounded squares matching the MLP hidden
          layers (25px, rx 9, #888888 border at width 2, ~3px gaps). */}
      <g>
        {denseX.map((cx, i) => (
          <rect key={`d-${i}`} x={cx - DENSE_NODE / 2} y={Y_DENSE - DENSE_NODE / 2}
            width={DENSE_NODE} height={DENSE_NODE} rx={DENSE_RX} ry={DENSE_RX}
            fill={shade(activations ? activations.dense[i]! / nd : 0)} stroke="#888888" strokeWidth={2} />
        ))}
      </g>

      {/* Output tiles. */}
      <g>
        {outX.map((cx, i) => {
          const v = activations ? activations.output[i]! : 0;
          const label = net.labels[i] ?? "";
          const win = i === predicted && v > 0;
          const S = 40, long = label.length > 2;
          const glyph = win ? "#fff" : v > 0.55 ? "#fff" : "var(--text-strong,#1c1917)";
          return (
            <g key={`o-${i}`}>
              <rect x={cx - S / 2} y={Y_OUT - S / 2} width={S} height={S} rx={10} ry={10}
                fill={win ? "var(--accent,#2b62a8)" : shade(v)} stroke={win ? "var(--accent,#2b62a8)" : "#888"} strokeWidth={win ? 3.5 : 2.25} />
              <text x={cx} y={Y_OUT} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono, monospace)" fontSize={long ? 11 : 20} fontWeight={700} fill={glyph}>{label}</text>
            </g>
          );
        })}
      </g>

      {/* Conv-2 filter popup: the real 3x3x8 stack, all 8 slices wide (one per
          pool-1 channel). A conv-2 output = sum over these 8 slices of (that
          channel's 3x3 window · this 3x3), + bias, ReLU. A full-viewport
          backdrop dismisses it on any click. */}
      {conv2Popup != null && (() => {
        const f = conv2Popup;
        const sw = 54, gap = 14, cs = sw / 3;
        const total = net.f1 * sw + (net.f1 - 1) * gap;
        const startX = (VW - total) / 2;
        const py = VH / 2 - 70;
        // Scale by this filter's own max |weight| for good contrast.
        let scale = 1e-6;
        for (let ch = 0; ch < net.f1; ch++) for (let i = 0; i < 9; i++) scale = Math.max(scale, Math.abs(net.k2[(f * net.f1 + ch) * 9 + i]!));
        return (
          <g className="mnist-c2popup" onClick={() => setConv2Popup(null)} style={{ cursor: "pointer" }}>
            {/* backdrop */}
            <rect x={0} y={0} width={VW} height={VH} fill="#1c1917" fillOpacity={0.42} />
            {/* panel */}
            <rect x={startX - 26} y={py - 46} width={total + 52} height={sw + 108} rx={12}
              fill="var(--surface,#fff)" stroke="var(--accent,#2b62a8)" strokeWidth={2} />
            <text x={VW / 2} y={py - 22} textAnchor="middle" fontFamily="var(--font-mono, monospace)" fontSize={13} fontWeight={700} fill="var(--text-strong,#1c1917)">
              conv 2 · filter {f} — a 3×3 for each of the 8 pool-1 channels
            </text>
            {Array.from({ length: net.f1 }, (_, ch) => {
              const bx = startX + ch * (sw + gap);
              return (
                <g key={ch}>
                  {Array.from({ length: 9 }, (_, i) => {
                    const w = net.k2[(f * net.f1 + ch) * 9 + i]!, r = Math.floor(i / 3), c = i % 3;
                    return <rect key={i} x={bx + c * cs} y={py + r * cs} width={cs} height={cs} fill={weightFill(w, scale)} stroke="#fff" strokeWidth={0.6} />;
                  })}
                  <rect x={bx} y={py} width={sw} height={sw} fill="none" stroke="#888" strokeWidth={1.25} rx={4} />
                  <text x={bx + sw / 2} y={py + sw + 16} textAnchor="middle" fontFamily="var(--font-mono, monospace)" fontSize={10} fill="var(--text-muted,#78716a)">ch {ch}</text>
                </g>
              );
            })}
            <text x={VW / 2} y={py + sw + 40} textAnchor="middle" fontFamily="var(--font-mono, monospace)" fontSize={11} fill="var(--text-secondary,#57514a)">
              output = Σ (channel’s 3×3 window · its kernel) over all 8 channels, + bias, ReLU
            </text>
            <text x={VW / 2} y={py + sw + 58} textAnchor="middle" fontFamily="var(--font-mono, monospace)" fontSize={10} fill="var(--text-faint,#a8a097)">
              (click anywhere to close)
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
