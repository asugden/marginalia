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
//    on hover: hovering a cell highlights its receptive field in EVERY layer
//    above, traced back through the chain to the input pixels it came from.
//
// Clicking a conv-1 kernel arms the "scan": a 3x3 window over the INPUT grid
// with a visual panel (image patch x kernel -> products -> one output neuron).
//
// Drawing reuses the shared useGridDraw hook. SVG stays smooth by redrawing
// only on new activations (throttled upstream).

import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CNNNet, CNNActivations } from "./cnn-net.js";
import { useGridDraw } from "../shared/useGridDraw.js";
import { LEARNED_NEG, LEARNED_POS, input, learned, magnitude, value } from "../shared/palette.js";

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

// Colour follows the figure scales (docs/style.md §11, ../shared/palette.ts):
//   the drawing and any patch of it: input, paper to ink;
//   kernels and connections: learned, sage positive / plum negative;
//   feature maps: greyscale, paper to ink — a deliberate EXCEPTION to the
//   computed scale. A feature map is an image of the drawing as a kernel
//   sees it, and in grey the digit's shadow carries through every layer the
//   way it does in the input, which is the thing the figure is for;
//   dense neurons, output: computed and, after the ReLU (or the softmax),
//   never negative — the positive arm, paper to vermillion;
//   the kernel scan's products and raw sum, which can go negative: the signed
//   computed scale, vermillion / cerulean.
function inputShade(v: number): string {
  return input(Math.max(0, Math.min(1, v)));
}
/** A feature-map cell: greyscale, like the input (see the exception above). */
function mapShade(v: number): string {
  return input(Math.max(0, Math.min(1, v)));
}
/** A computed value that cannot be negative: a dense neuron, an output. */
function unitShade(v: number): string {
  return magnitude(Math.max(0, Math.min(1, v)));
}
function weightFill(w: number, scale: number): string {
  return learned(w / scale);
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
    cells.push(<rect key={`${r}-${c}`} x={x + c * cw} y={y + r * chh} width={cw + 0.4} height={chh + 0.4} fill={mapShade(v)} />);
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

  // The scan card is a pop-up, so it closes like one: a click anywhere but the
  // input grid or a kernel, or Esc. No separate "stop" control is needed.
  useEffect(() => {
    if (!armed) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(".mnist-net__draw, .cnn-kernel")) return;
      onPickKernel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPickKernel(null);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [armed, onPickKernel]);

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

  // Receptive field of a hovered cell, traced ALL THE WAY BACK to the input.
  //
  // Hovering one cell answers "which pixels did this actually come from?", so a
  // single step back isn't enough — the chain is what's intuitive. We walk the
  // hovered cell backwards layer by layer in CELL-RANGE space (inclusive
  // r0..r1, c0..c1), because each step is an exact integer rule:
  //   pool cell r  <- conv rows 2r .. 2r+1        (2x2 stride-2 window)
  //   conv cell r  <- prev rows  r  .. r+2        (3x3 valid window)
  // Composing ranges (not pixel rects) keeps it exact at every depth; we only
  // convert to pixels at draw time.
  //
  // The one branch: conv2 reads a 3x3 across ALL eight pool-1 channels at once,
  // so from conv2 back the trail covers every channel, not one. `chans` carries
  // that — null means "this layer's box applies to every channel".
  type Range = { r0: number; r1: number; c0: number; c1: number };
  const poolBack = (v: Range): Range => ({ r0: v.r0 * 2, r1: v.r1 * 2 + 1, c0: v.c0 * 2, c1: v.c1 * 2 + 1 });
  const convBack = (v: Range): Range => ({ r0: v.r0, r1: v.r1 + 2, c0: v.c0, c1: v.c1 + 2 });

  // The full backward trail for the current hover: one entry per upstream layer.
  const trail = useMemo(() => {
    if (!hover) return null;
    const out: { layer: "input" | "conv1" | "pool1" | "conv2"; ch: number | null; range: Range }[] = [];
    let v: Range = { r0: hover.r, r1: hover.r, c0: hover.c, c1: hover.c };
    let ch: number | null = hover.ch;

    // Walk back along the forward chain, starting one step above the hovered
    // layer and continuing to the input. `stage` is where we currently are.
    let stage: "pool2" | "conv2" | "pool1" | "conv1" = hover.layer;

    if (stage === "pool2") {                   // pool2 -> conv2 (2x2)
      v = poolBack(v);
      out.push({ layer: "conv2", ch, range: v });
      stage = "conv2";
    }
    if (stage === "conv2") {                   // conv2 -> pool1 (3x3, all 8 ch)
      v = convBack(v);
      ch = null;
      out.push({ layer: "pool1", ch, range: v });
      stage = "pool1";
    }
    if (stage === "pool1") {                   // pool1 -> conv1 (2x2)
      v = poolBack(v);
      out.push({ layer: "conv1", ch, range: v });
      stage = "conv1";
    }
    // conv1 -> input (3x3). Every path ends here.
    v = convBack(v);
    out.push({ layer: "input", ch: null, range: v });
    return out;
  }, [hover]);

  // Pixel rect for one trail entry on a given channel's map, or null if that
  // entry doesn't apply to this channel. Clamped to the map so the deep,
  // widened ranges (a pool-2 hover reaches a 12x12 patch of input) stay inside.
  const trailBox = (
    layer: "input" | "conv1" | "pool1" | "conv2", ch: number,
  ): { x: number; y: number; w: number; h: number } | null => {
    const e = trail?.find((t) => t.layer === layer);
    if (!e) return null;
    if (e.ch !== null && e.ch !== ch) return null;
    const g = layer === "input" ? inputGeo
      : layer === "conv1" ? conv1Geo(ch)
      : layer === "pool1" ? pool1Geo(ch)
      : conv2Geo(ch);
    const r0 = Math.max(0, Math.min(g.rows - 1, e.range.r0));
    const c0 = Math.max(0, Math.min(g.cols - 1, e.range.c0));
    const r1 = Math.max(0, Math.min(g.rows - 1, e.range.r1));
    const c1 = Math.max(0, Math.min(g.cols - 1, e.range.c1));
    const a = cellRect(g, r0, c0), b = cellRect(g, r1, c1);
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
  };

  // The input-grid box is just the trail's last entry, in input pixel space.
  const inputBox = useMemo(() => {
    const e = trail?.find((t) => t.layer === "input");
    if (!e) return null;
    const r0 = Math.max(0, e.range.r0), c0 = Math.max(0, e.range.c0);
    const r1 = Math.min(GRID - 1, e.range.r1), c1 = Math.min(GRID - 1, e.range.c1);
    const a = cellRect(inputGeo, r0, c0), b = cellRect(inputGeo, r1, c1);
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
  }, [trail, gx0, gy0]);

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
    <svg ref={svgRef} className="mnist-net" viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH}
      preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Convolutional network: draw a digit at the top; kernels, feature maps, pooling, a fully connected layer, then the output digits.">

      {/* "Show wiring" Sankey ribbons — drawn FIRST so every map sits on top.
          Soft purple, curved. input->activeConv1, conv1->pool1 (1:1), ALL
          pool1->activeConv2 (fan-in), conv2->pool2 (1:1). */}
      {showWiring && (() => {
        // Wiring is structure, not data: a general data-mark hue, never a
        // figure scale (docs/style.md §11).
        const PURPLE = "var(--purple-600)";
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
      <g>
        <text className="fig-label fig-label--lg" x={10} y={Y_INPUT} dominantBaseline="middle">input</text>
        <text className="fig-label fig-label--lg" x={10} y={Y_CONV1 - 96} dominantBaseline="middle">conv 1</text>
        <text className="fig-label fig-label--lg" x={10} y={Y_POOL1} dominantBaseline="middle">pool 1</text>
        <text className="fig-label fig-label--lg" x={10} y={Y_CONV2 - 96} dominantBaseline="middle">conv 2</text>
        <text className="fig-label fig-label--lg" x={10} y={Y_POOL2} dominantBaseline="middle">pool 2</text>
        <text className="fig-label fig-label--lg" x={10} y={Y_DENSE - 9} dominantBaseline="middle">fully
          <tspan x={10} dy={18}>connected</tspan>
        </text>
        <text className="fig-label fig-label--lg" x={10} y={Y_OUT} dominantBaseline="middle">output</text>
      </g>

      {/* Fully-connected edges (pool2 -> dense -> output), drawn under nodes. */}
      <g strokeLinecap="round">
        {denseEdges.d1.map((e, i) => (
          <line key={`de1-${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
            stroke={e.w >= 0 ? LEARNED_POS : LEARNED_NEG} strokeOpacity={0.28} strokeWidth={0.8} />
        ))}
        {denseEdges.d2.map((e, i) => (
          <line key={`de2-${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
            stroke={e.w >= 0 ? LEARNED_POS : LEARNED_NEG} strokeOpacity={0.4} strokeWidth={1} />
        ))}
      </g>

      {/* Input grid (also the drawing surface). */}
      <g>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const r = Math.floor(i / GRID), c = i % GRID;
          const v = activations ? activations.raw[i]! : 0;
          return <rect key={`in-${i}`} x={gx0 + c * cellS} y={gy0 + r * cellS} width={cellS} height={cellS} fill={inputShade(v)} stroke="var(--border)" strokeWidth={0.4} />;
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
        {/* Receptive field on the input — for a hover in ANY layer, since the
            trail is walked all the way back. */}
        {inputBox && (
          <rect x={inputBox.x} y={inputBox.y} width={inputBox.w} height={inputBox.h}
            fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2.5} pointerEvents="none" />
        )}
      </g>

      {/* Conv 1: clickable kernel swatch above each feature map + hover grid. */}
      <g>
        {colX.map((cx, f) => {
          const kx = cx - KSW / 2, ky = Y_CONV1 - MAP1 / 2 - KSW - 14;
          const g = conv1Geo(f);
          const isArmed = scanKernel === f;
          return (
            <g key={`c1-${f}`}>
              <g className="cnn-kernel" style={{ cursor: "pointer" }} onClick={() => onPickKernel(isArmed ? null : f)}>
                {Array.from({ length: 9 }, (_, i) => {
                  const w = net.k1[f * 9 + i]!, r = Math.floor(i / 3), c = i % 3, cs = KSW / 3;
                  return <rect key={i} x={kx + c * cs} y={ky + r * cs} width={cs} height={cs} fill={weightFill(w, k1scale)} stroke="var(--surface)" strokeWidth={0.5} />;
                })}
                <rect x={kx} y={ky} width={KSW} height={KSW} fill="none" stroke={isArmed ? "var(--accent,#2b62a8)" : "#888"} strokeWidth={isArmed ? 3 : 1.5} rx={4} />
              </g>
              {activations
                ? <FeatureMap buf={activations.conv1} ch={f} h={net.c1} w={net.c1} x={g.x} y={g.y} size={MAP1} norm={n1[f]} dim={!!hover && !(hover.layer === "conv1" && hover.ch === f)} />
                : <rect x={g.x} y={g.y} width={MAP1} height={MAP1} fill="var(--surface)" stroke="#c9c2b8" />}
              {(() => { const b = trailBox("conv1", f); return b && (
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2} pointerEvents="none" />
              ); })()}
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
          // Dim pool-1 maps that aren't part of the current hover focus.
          const dimP1 = !!hover && hover.layer === "pool1" && hover.ch !== f;
          return (
            <g key={`p1-${f}`}>
              {activations
                ? <FeatureMap buf={activations.pool1} ch={f} h={net.p1} w={net.p1} x={g.x} y={g.y} size={MAPP1} norm={np1[f]} dim={dimP1} />
                : <rect x={g.x} y={g.y} width={MAPP1} height={MAPP1} fill="var(--surface)" stroke="#c9c2b8" />}
              {/* Trail box on pool 1. For a conv-2 (or deeper) hover this lands
                  on EVERY channel — a conv-2 filter reads a 3x3 across all
                  eight pool-1 maps at once. */}
              {(() => { const b = trailBox("pool1", f); return b && (
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2} pointerEvents="none" />
              ); })()}
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
                <rect x={kx + 6} y={ky - 6} width={KSW} height={KSW} rx={4} fill="var(--sand-200)" stroke="#c9c2b8" strokeWidth={1} />
                <rect x={kx + 3} y={ky - 3} width={KSW} height={KSW} rx={4} fill="var(--sand-100)" stroke="#c9c2b8" strokeWidth={1} />
                {/* the summary swatch (channel-mean 3x3) on top */}
                {Array.from({ length: 9 }, (_, i) => {
                  const w = k2mean[f * 9 + i]!, r = Math.floor(i / 3), c = i % 3, cs = KSW / 3;
                  return <rect key={i} x={kx + c * cs} y={ky + r * cs} width={cs} height={cs} fill={weightFill(w, k2scale)} stroke="var(--surface)" strokeWidth={0.5} />;
                })}
                <rect x={kx} y={ky} width={KSW} height={KSW} fill="none" stroke="#888" strokeWidth={1.5} rx={4} />
              </g>
              {activations
                ? <FeatureMap buf={activations.conv2} ch={f} h={net.c2} w={net.c2} x={g.x} y={g.y} size={MAP2} norm={n2[f]} dim={!!hover && !(hover.layer === "conv2" && hover.ch === f)} />
                : <rect x={g.x} y={g.y} width={MAP2} height={MAP2} fill="var(--surface)" stroke="#c9c2b8" />}
              {(() => { const b = trailBox("conv2", f); return b && (
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="var(--accent,#2b62a8)" strokeWidth={2} pointerEvents="none" />
              ); })()}
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
              {activations
                ? <FeatureMap buf={activations.pool2} ch={f} h={net.p2} w={net.p2} x={g.x} y={g.y} size={MAPP2} norm={np2[f]} dim={!!hover && !(hover.layer === "pool2" && hover.ch === f)} />
                : <rect x={g.x} y={g.y} width={MAPP2} height={MAPP2} fill="var(--surface)" stroke="#c9c2b8" />}
              {activations && hoverGrid("pool2", f, g)}
            </g>
          );
        })}
      </g>

      {/* Dense neurons — the shared neuron (.fig-neuron): 25 units, rx 9,
          the node-border grey at 2 px on screen. */}
      <g>
        {denseX.map((cx, i) => (
          <rect key={`d-${i}`} x={cx - DENSE_NODE / 2} y={Y_DENSE - DENSE_NODE / 2}
            width={DENSE_NODE} height={DENSE_NODE} rx={DENSE_RX} ry={DENSE_RX}
            fill={unitShade(activations ? activations.dense[i]! / nd : 0)} className="fig-neuron" />
        ))}
      </g>

      {/* Output tiles. */}
      <g>
        {outX.map((cx, i) => {
          const v = activations ? activations.output[i]! : 0;
          const label = net.labels[i] ?? "";
          const win = i === predicted && v > 0;
          const S = 40, long = label.length > 2;
          const glyph = win ? "var(--text-on-accent)" : v > 0.55 ? "var(--surface)" : "var(--text-strong)";
          return (
            <g key={`o-${i}`}>
              <rect x={cx - S / 2} y={Y_OUT - S / 2} width={S} height={S} rx={10} ry={10}
                fill={win ? "var(--accent,#2b62a8)" : unitShade(v)} className={win ? undefined : "fig-tile"}
                stroke={win ? "var(--accent,#2b62a8)" : undefined} strokeWidth={win ? 3.5 : undefined} />
              <text x={cx} y={Y_OUT} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono, monospace)" fontSize={long ? 11 : 20} fontWeight={700} fill={glyph}>{label}</text>
            </g>
          );
        })}
      </g>

      {/* Drawn last but for the conv-2 pop-up, so it sits on top of every
          layer. Visual convolution panel (click a conv-1 kernel). Image patch x kernel
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
        let pmax = 1e-6; for (const p of prod) pmax = Math.max(pmax, Math.abs(p));
        // A card floating to the right of the input grid: sand, bordered and
        // shadowed so it reads as a pop-up over the figure, joined to the
        // scan window by a leader line. Row 1: the image patch × the kernel.
        // Row 2: their products → the sum → the ReLU. Both neurons are shown
        // because the ReLU is invisible if you only ever see its output.
        const PAD = 22;
        const cell = 36;
        const gridW = cell * 3;
        const px0 = gx0 + INPUT_BLOCK + 58;   // content's left edge
        const py0 = gy0 - 8;                  // title baseline area
        const y1 = py0 + 30;                  // row 1: patch × kernel
        const patchX = px0;
        const kernX = px0 + gridW + 56;
        const y2 = y1 + gridW + 64;           // row 2: products → sum → ReLU
        const outCY = y2 + gridW / 2;
        const sumX = patchX + gridW + 50;
        const reluX = sumX + DENSE_NODE + 64;
        const right = Math.max(kernX + gridW, reluX + DENSE_NODE);
        const cardX = px0 - PAD, cardY = py0 - PAD + 4;
        const cardW = right - px0 + 2 * PAD;
        const cardH = y2 + gridW + 30 - cardY;
        // Leader: from the scan window's right edge to the card's left edge.
        const lx = gx0 + (scan.c + 3) * cellS, ly = gy0 + (scan.r + 1.5) * cellS;
        const ty = Math.max(cardY + 24, Math.min(cardY + cardH - 24, ly));
        const draw3 = (vals: number[], x: number, y: number, kind: "gray" | "weight") => (
          Array.from({ length: 9 }, (_, i) => {
            const r = Math.floor(i / 3), c = i % 3;
            const fill = kind === "weight" ? weightFill(vals[i]!, k1scale) : inputShade(vals[i]!);
            return <rect key={i} x={x + c * cell} y={y + r * cell} width={cell} height={cell} fill={fill} stroke="var(--border)" strokeWidth={0.75} />;
          })
        );
        const frame = (x: number, y: number) => (
          <rect x={x} y={y} width={gridW} height={gridW} fill="none" stroke="#888" strokeWidth={1.25} rx={2} />
        );
        return (
          <g className="mnist-conv-panel" pointerEvents="none">
            <defs>
              <filter id="cnn-card-shadow" x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="var(--ink-900)" floodOpacity="0.16" />
              </filter>
            </defs>
            <line x1={lx} y1={ly} x2={cardX} y2={ty} className="cnn-card__leader" />
            <rect x={cardX} y={cardY} width={cardW} height={cardH} rx={14} className="cnn-card" filter="url(#cnn-card-shadow)" />
            <text className="fig-label cnn-card__title" x={px0} y={py0 + 10}>kernel {f}</text>

            {/* row 1: image patch × kernel */}
            {draw3(patch, patchX, y1, "gray")}
            {frame(patchX, y1)}
            <text className="cnn-card__op" x={patchX + gridW + 28} y={y1 + gridW / 2} textAnchor="middle" dominantBaseline="central">×</text>
            {draw3(net.k1.slice(f * 9, f * 9 + 9) as unknown as number[], kernX, y1, "weight")}
            {frame(kernX, y1)}
            <text className="fig-label" x={patchX} y={y1 + gridW + 20}>image patch</text>
            <text className="fig-label" x={kernX} y={y1 + gridW + 20}>kernel</text>

            {/* row 2: products → sum → ReLU */}
            <text className="fig-note" x={patchX} y={y2 - 12}>Multiply, cell by cell:</text>
            {Array.from({ length: 9 }, (_, i) => {
              const r = Math.floor(i / 3), c = i % 3;
              // A product is computed and signed: vermillion adds to the sum,
              // cerulean takes away.
              return (
                <rect key={i} x={patchX + c * cell} y={y2 + r * cell} width={cell} height={cell} fill={value(prod[i]! / pmax)} stroke="var(--border)" strokeWidth={0.75} />
              );
            })}
            {frame(patchX, y2)}
            <text className="cnn-card__op" x={patchX + gridW + 25} y={outCY - 6} textAnchor="middle" dominantBaseline="central">→</text>
            <text className="fig-label-sub" x={patchX + gridW + 25} y={outCY + 16} textAnchor="middle">add</text>
            {/* the raw sum can be negative, so it takes the signed scale; the
                ReLU after it cannot, and is one cell of a feature map, so grey */}
            <text className="fig-label" x={sumX + DENSE_NODE / 2} y={outCY - DENSE_NODE / 2 - 9} textAnchor="middle">sum</text>
            <rect x={sumX} y={outCY - DENSE_NODE / 2} width={DENSE_NODE} height={DENSE_NODE} rx={DENSE_RX} ry={DENSE_RX}
              fill={value(sum / (pmax * 3 + 1e-6))} className="fig-neuron" />
            <text className="fig-num" x={sumX + DENSE_NODE / 2} y={outCY + DENSE_NODE / 2 + 18} textAnchor="middle">{sum.toFixed(2)}</text>
            <text className="cnn-card__op" x={sumX + DENSE_NODE + 32} y={outCY - 6} textAnchor="middle" dominantBaseline="central">→</text>
            <text className="fig-label-sub" x={sumX + DENSE_NODE + 32} y={outCY + 16} textAnchor="middle">ReLU</text>
            <text className="fig-label" x={reluX + DENSE_NODE / 2} y={outCY - DENSE_NODE / 2 - 9} textAnchor="middle">output</text>
            <rect x={reluX} y={outCY - DENSE_NODE / 2} width={DENSE_NODE} height={DENSE_NODE} rx={DENSE_RX} ry={DENSE_RX}
              fill={mapShade(relu / (pmax * 3 + 1e-6))} className="fig-neuron" />
            <text className="fig-num" x={reluX + DENSE_NODE / 2} y={outCY + DENSE_NODE / 2 + 18} textAnchor="middle">{relu.toFixed(2)}</text>
          </g>
        );
      })()}

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
            <rect x={0} y={0} width={VW} height={VH} style={{ fill: "var(--ink-900)" }} fillOpacity={0.42} />
            {/* panel */}
            <defs>
              <filter id="cnn-c2-shadow" x="-10%" y="-20%" width="120%" height="150%">
                <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="var(--ink-900)" floodOpacity="0.2" />
              </filter>
            </defs>
            <rect x={startX - 30} y={py - 54} width={total + 60} height={sw + 84} rx={14}
              className="cnn-card" filter="url(#cnn-c2-shadow)" />
            <text className="fig-label cnn-card__title" x={VW / 2} y={py - 28} textAnchor="middle">
              conv 2 · filter {f}
            </text>
            <text className="fig-note" x={VW / 2} y={py - 10} textAnchor="middle">
              A 3×3 kernel for each of the 8 pool-1 channels.
            </text>
            {Array.from({ length: net.f1 }, (_, ch) => {
              const bx = startX + ch * (sw + gap);
              return (
                <g key={ch}>
                  {Array.from({ length: 9 }, (_, i) => {
                    const w = net.k2[(f * net.f1 + ch) * 9 + i]!, r = Math.floor(i / 3), c = i % 3;
                    return <rect key={i} x={bx + c * cs} y={py + r * cs} width={cs} height={cs} fill={weightFill(w, scale)} stroke="var(--surface)" strokeWidth={0.6} />;
                  })}
                  <rect x={bx} y={py} width={sw} height={sw} fill="none" stroke="#888" strokeWidth={1.25} rx={4} />
                  <text className="fig-label" x={bx + sw / 2} y={py + sw + 17} textAnchor="middle">ch {ch}</text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}
