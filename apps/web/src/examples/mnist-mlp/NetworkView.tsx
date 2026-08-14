// The network visualization. One SVG, laid out top-to-bottom:
//
//   input   — the 20x20 grid. This IS both the input layer AND the drawing
//             surface: you draw your digit directly onto the top of the model,
//             and the same cells shade white->black as they feed the network.
//             (Drawing 400 circles would be unreadable, so the input stays a
//             grid.)
//   hidden1 — 25 circles
//   hidden2 — 25 circles
//   output  — 11 circles (0-9 + blank), labelled
//
// Nodes: circles filled white (0) -> black (1) by activation. Hidden layers
// use ReLU output normalized per-layer so there's always visible contrast.
//
// Edges: one line per weight, red for positive, blue for negative, opacity and
// width scaled by |weight|. There are 10k input->h1 weights alone, so we draw
// only weights whose |value| clears a magnitude threshold — a slider moves the
// threshold. This is faithful to the reference (which also hides weak weights)
// and is what keeps the SVG light enough to stay smooth: a few hundred lines,
// not tens of thousands.
//
// SVG (not canvas) on purpose: crisp at any zoom and exportable. We keep it
// fast by (a) thresholding edges and (b) memoizing the static geometry so a
// redraw only recolors nodes + swaps the visible edge set.
//
// Drawing: pointer events on the input-grid region paint into a 20x20 ink
// buffer with a soft brush (the pressed cell plus a lighter falloff to its
// neighbours, so the downsampled digit is antialiased grayscale rather than
// 1-bit). The buffer is emitted via onInput; the parent runs the forward pass
// and feeds the resulting activations back in.

import { useCallback, useMemo, useRef, useState } from "react";
import type { Net, Activations } from "./net.js";

export interface NetworkViewProps {
  net: Net;
  activations: Activations | null;
  /** Weights with |w| >= this are drawn. 0..1, mapped to each layer's own
   *  max |w| so the slider means "strongest X% of connections" uniformly. */
  edgeThreshold: number;
  /** Predicted class index (argmax) to highlight, or -1. */
  predicted: number;
  /** Called with the 20x20 = 400 ink vector (0..1) as the user draws on the
   *  input grid. */
  onInput: (input: Float32Array) => void;
  /** Bumping this clears the input grid. */
  clearSignal: number;
}

const W = 900; // viewBox width
const PAD = 24;
const GRID = 20; // input is 20x20

// Vertical band centers for each layer (input at top). The input->hidden1 gap
// stays generous (that fan-out from the drawing is the interesting part); the
// hidden1 -> hidden2 -> output gaps are tightened to ~60% of that so the lower
// layers read as a compact stack.
const Y_INPUT = 150; // the grid block is centered here
const Y_H1 = 380; // gap 230 from input
const Y_H2 = 488; // gap 108 (~60% of the old 180)
const Y_OUT = 596; // gap 108
const H = 672;

// Hidden-layer neurons are heavily-rounded squares. Row spacing is ~28.5px
// (684px across 24 gaps), so a 25px node leaves ~3.5px between neighbours; rx 9
// takes them most of the way to a circle while keeping a hint of the square.
const HNODE = 25;
const HNODE_RX = 9;

interface Geo {
  input: { cx: number; cy: number; s: number }[]; // square cells
  gridSize: number;
  // Input-grid block bounds in viewBox units, for pointer->cell mapping.
  gx0: number; gy0: number; gridBlock: number;
  h1: { cx: number; cy: number }[];
  h2: { cx: number; cy: number }[];
  out: { cx: number; cy: number }[];
  // Precomputed edges per layer: {a,b indices, w}. Sorted by |w| desc so the
  // threshold slice is a prefix and rendering strongest-last keeps them on top.
  e1: Edge[]; e2: Edge[]; e3: Edge[];
  max1: number; max2: number; max3: number;
}
interface Edge { ax: number; ay: number; bx: number; by: number; w: number; abs: number; }

function rowX(count: number, i: number, width: number, pad: number) {
  if (count === 1) return width / 2;
  const usable = width - 2 * pad;
  return pad + (usable * i) / (count - 1);
}

// Build the static geometry + edge lists once per net.
function buildGeo(net: Net): Geo {
  const gridBlock = 240; // px for the 20x20 grid
  const s = gridBlock / GRID;
  const gx0 = W / 2 - gridBlock / 2;
  const gy0 = Y_INPUT - gridBlock / 2;
  const input = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      input.push({ cx: gx0 + c * s + s / 2, cy: gy0 + r * s + s / 2, s });

  // Left inset leaves a gutter for the layer captions so they never collide
  // with the first node / output tile.
  const nodeRow = (count: number, y: number) =>
    Array.from({ length: count }, (_, i) => ({ cx: rowX(count, i, W, PAD + 84), cy: y }));
  const h1 = nodeRow(net.H1, Y_H1);
  const h2 = nodeRow(net.H2, Y_H2);
  const out = nodeRow(net.OUT, Y_OUT);

  // For input->h1 edges we anchor the input end at the grid cell's center. With
  // 400x25 = 10k edges we keep all of them (sorted); the threshold trims what's
  // drawn. Anchoring 400 points is fine — it's the DOM node count we cap.
  const mkEdges = (
    Wm: Float32Array, rows: number, cols: number,
    A: { cx: number; cy: number }[], B: { cx: number; cy: number }[],
  ): { edges: Edge[]; max: number } => {
    const edges: Edge[] = [];
    let max = 1e-6;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const w = Wm[i * cols + j]!;
        const abs = Math.abs(w);
        if (abs > max) max = abs;
        edges.push({ ax: A[j]!.cx, ay: A[j]!.cy, bx: B[i]!.cx, by: B[i]!.cy, w, abs });
      }
    }
    edges.sort((p, q) => q.abs - p.abs);
    return { edges, max };
  };

  const inputCenters = input.map((c) => ({ cx: c.cx, cy: c.cy }));
  const r1 = mkEdges(net.W1, net.H1, net.IN, inputCenters, h1);
  const r2 = mkEdges(net.W2, net.H2, net.H1, h1, h2);
  const r3 = mkEdges(net.W3, net.OUT, net.H2, h2, out);

  return {
    input, gridSize: s, gx0, gy0, gridBlock, h1, h2, out,
    e1: r1.edges, e2: r2.edges, e3: r3.edges,
    max1: r1.max, max2: r2.max, max3: r3.max,
  };
}

// White (0) -> black (1). Activation is 0..1-ish; clamp.
function shade(v: number): string {
  const t = Math.max(0, Math.min(1, v));
  const g = Math.round(255 * (1 - t));
  return `rgb(${g},${g},${g})`;
}

// Positive weight -> red, negative -> blue. LINE WIDTH scales LINEARLY with
// |weight| relative to the layer max, so thickness reads as a direct stand-in
// for weight magnitude — a strong connection is visibly fatter than a weak one.
// It's clamped to [WIDTH_MIN, WIDTH_CAP] so the thinnest stay visible and the
// fattest don't dominate; the slope is tuned so the average width across the
// drawn (thresholded) edges stays about where it was. Opacity keeps its gentle
// gamma so faint edges remain legible.
const WIDTH_MIN = 0.5;
const WIDTH_CAP = 5.5;
function edgeStroke(w: number, abs: number, max: number): { color: string; opacity: number; width: number } {
  const r = abs / max; // 0..1
  const tOpacity = Math.pow(r, 0.6);
  return {
    color: w >= 0 ? "#d1344b" : "#2f6fd0",
    opacity: 0.1 + 0.8 * tOpacity,
    width: Math.min(WIDTH_CAP, WIDTH_MIN + 4.0 * r),
  };
}

// ── Path tracing (hover an output tile to explain it) ───────────────────────
//
// A traced path is a small set of edges + the nodes/pixels they touch, used to
// tell one legible story about a single output. Two flavours:
//
//  • Hover the WINNING tile -> a "why it fired" path, all POSITIVE contribution:
//    the one hidden2 neuron contributing most positively to the win, the one
//    hidden1 neuron contributing most positively to that, and the two input
//    pixels contributing most positively to that. A clean 2 -> 1 -> 1 tree that
//    bottoms out at two pixels.
//
//  • Hover a WRONG tile -> a "what pushed against it" subgraph, NEGATIVE at the
//    output edge. It's deliberately a little wider (up to 2 hidden2, up to 4
//    hidden1, 2 pixels) because it is not intuitive that a negative
//    hidden2->output can be explained by upstream contributions of either sign;
//    showing a few routes makes that comprehensible. Pixels are chosen by
//    weight magnitude (one is typically inked, one blank — presence and absence
//    both matter).
//
// "Contribution" of an edge a->b is weight(a,b) * activation(a): how much source
// a actually pushed b on THIS input, not just how strong the wired weight is.
export interface PathEdge {
  ax: number; ay: number; bx: number; by: number;
  positive: boolean;
  /** The wired weight of this connection. */
  weight: number;
  /** The source neuron/pixel's activation on this input. */
  srcActivation: number;
  /** weight * source activation — how much it actually pushed on this input. */
  contribution: number;
  /** Human labels for the two endpoints, for the tooltip. */
  from: string;
  to: string;
}
export interface TracedPath {
  kind: "positive" | "negative";
  out: number; // the hovered output index
  edges: PathEdge[];
  h2: Set<number>;
  h1: Set<number>;
  px: Set<number>;
}

// W is [rows x cols], row i = destination neuron i, col j = source j. Returns
// the source index j maximizing sign*(W[i,j]*srcAct[j]); ignore is a set of
// already-used sources to skip. dir=+1 wants the most positive contribution,
// dir=-1 the most negative.
function bestSource(
  W: Float32Array, cols: number, dstRow: number,
  srcAct: Float32Array, dir: number, ignore?: Set<number>,
): number {
  let best = -1, bestVal = -Infinity;
  const base = dstRow * cols;
  for (let j = 0; j < cols; j++) {
    if (ignore?.has(j)) continue;
    const contrib = dir * (W[base + j]! * srcAct[j]!);
    if (contrib > bestVal) { bestVal = contrib; best = j; }
  }
  return best;
}

// Top-k source indices by dir*(W*srcAct), descending.
function topSources(
  W: Float32Array, cols: number, dstRow: number,
  srcAct: Float32Array, dir: number, k: number,
): number[] {
  const scored: { j: number; v: number }[] = [];
  const base = dstRow * cols;
  for (let j = 0; j < cols; j++) scored.push({ j, v: dir * (W[base + j]! * srcAct[j]!) });
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, k).map((s) => s.j);
}

// Label a pixel index as "pixel (col,row)" in the 20x20 grid.
function pxLabel(p: number): string {
  return `pixel (${p % GRID},${Math.floor(p / GRID)})`;
}

function tracePath(
  net: Net, geo: Geo, a: Activations, out: number, isWin: boolean,
): TracedPath {
  const edges: TracedPath["edges"] = [];
  const h2 = new Set<number>(), h1 = new Set<number>(), px = new Set<number>();

  // Record one path edge with its geometry, weight, and contribution
  // (weight x source activation) for the tooltip.
  //   W:      the weight matrix [dstCount x srcCount]
  //   srcAct: source-layer activations
  //   A/B:    geometry rows for source / destination
  //   ai/bi:  source / destination indices
  //   from/to: human labels for the tooltip
  const edge = (
    W: Float32Array, srcCount: number, srcAct: Float32Array,
    A: { cx: number; cy: number }[], ai: number,
    B: { cx: number; cy: number }[], bi: number,
    from: string, to: string,
  ) => {
    const weight = W[bi * srcCount + ai]!;
    const srcActivation = srcAct[ai]!;
    const contribution = weight * srcActivation;
    edges.push({
      ax: A[ai]!.cx, ay: A[ai]!.cy, bx: B[bi]!.cx, by: B[bi]!.cy,
      positive: weight >= 0, weight, srcActivation, contribution, from, to,
    });
  };

  if (isWin) {
    // Positive 2 -> 1 -> 1 tree.
    const h2i = bestSource(net.W3, net.H2, out, a.h2, +1);
    edge(net.W3, net.H2, a.h2, geo.h2, h2i, geo.out, out, `hidden2[${h2i}]`, `“${net.labels[out]}”`);
    h2.add(h2i);
    const h1i = bestSource(net.W2, net.H1, h2i, a.h1, +1);
    edge(net.W2, net.H1, a.h1, geo.h1, h1i, geo.h2, h2i, `hidden1[${h1i}]`, `hidden2[${h2i}]`);
    h1.add(h1i);
    // Two input pixels with the most positive contribution into that h1 neuron.
    const pxs = topSources(net.W1, net.IN, h1i, a.input, +1, 2);
    for (const p of pxs) {
      edge(net.W1, net.IN, a.input, geo.input, p, geo.h1, h1i, pxLabel(p), `hidden1[${h1i}]`);
      px.add(p);
    }
    return { kind: "positive", out, edges, h2, h1, px };
  }

  // Negative subgraph. Up to 2 hidden2 neurons contributing most negatively to
  // the wrong tile; for each, up to 2 hidden1 neurons by |W2*a| (either sign, so
  // both reinforcing and cancelling routes can show); then 2 pixels overall by
  // |W1| magnitude into the collected hidden1 neurons.
  const h2s = topSources(net.W3, net.H2, out, a.h2, -1, 2);
  for (const h2i of h2s) {
    edge(net.W3, net.H2, a.h2, geo.h2, h2i, geo.out, out, `hidden2[${h2i}]`, `“${net.labels[out]}”`);
    h2.add(h2i);
    // Rank hidden1 by absolute contribution so a strong cancelling (positive)
    // route is visible next to the negative one.
    const scored: { j: number; v: number }[] = [];
    for (let j = 0; j < net.H1; j++) {
      const c = net.W2[h2i * net.H1 + j]! * a.h1[j]!;
      scored.push({ j, v: Math.abs(c) });
    }
    scored.sort((x, y) => y.v - x.v);
    for (const { j: h1i } of scored.slice(0, 2)) {
      edge(net.W2, net.H1, a.h1, geo.h1, h1i, geo.h2, h2i, `hidden1[${h1i}]`, `hidden2[${h2i}]`);
      h1.add(h1i);
    }
  }
  // Two pixels overall, by |W1 weight| into any collected hidden1 neuron.
  const pxScore = new Map<number, { v: number; h1i: number }>();
  for (const h1i of h1) {
    for (let p = 0; p < net.IN; p++) {
      const w = Math.abs(net.W1[h1i * net.IN + p]!);
      const prev = pxScore.get(p);
      if (!prev || w > prev.v) pxScore.set(p, { v: w, h1i });
    }
  }
  const topPx = [...pxScore.entries()].sort((a2, b2) => b2[1].v - a2[1].v).slice(0, 2);
  for (const [p, { h1i }] of topPx) {
    edge(net.W1, net.IN, a.input, geo.input, p, geo.h1, h1i, pxLabel(p), `hidden1[${h1i}]`);
    px.add(p);
  }
  return { kind: "negative", out, edges, h2, h1, px };
}

export function NetworkView({
  net, activations, edgeThreshold, predicted, onInput, clearSignal,
}: NetworkViewProps) {
  const geo = useMemo(() => buildGeo(net), [net]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ink = useRef<Float32Array>(new Float32Array(GRID * GRID));
  const drawing = useRef(false);
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  // Clear the ink buffer when the parent bumps clearSignal, and emit the empty
  // vector so activations reset.
  const prevClear = useRef(clearSignal);
  if (clearSignal !== prevClear.current) {
    prevClear.current = clearSignal;
    ink.current = new Float32Array(GRID * GRID);
    onInputRef.current(ink.current.slice());
  }

  // Map a pointer event to a fractional cell coordinate in the input grid,
  // using the SVG's own coordinate transform so it's correct at any on-screen
  // size or zoom. Returns null if the pointer is outside the grid block.
  const toCell = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const fx = (pt.x - geo.gx0) / geo.gridBlock; // 0..1 across grid
    const fy = (pt.y - geo.gy0) / geo.gridBlock;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { cx: fx * GRID, cy: fy * GRID };
  }, [geo.gx0, geo.gy0, geo.gridBlock]);

  // Soft brush: paint the covered cell to full ink and its neighbours with a
  // Gaussian-ish falloff, so the 20x20 image is grayscale at the edges (the
  // antialiasing MNIST-trained nets expect). Ink accumulates and clamps at 1.
  const paint = useCallback((cx: number, cy: number) => {
    const R = 1.6; // brush radius in cells
    const buf = ink.current;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(GRID - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(GRID - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const v = Math.exp(-(d * d) / (2 * 0.75 * 0.75)); // ~1 at center
        const idx = y * GRID + x;
        if (v > buf[idx]!) buf[idx] = Math.min(1, v);
      }
    }
    onInputRef.current(buf.slice());
  }, []);

  const lastCell = useRef<{ cx: number; cy: number } | null>(null);
  const onDown = useCallback((e: React.PointerEvent) => {
    const cell = toCell(e);
    if (!cell) return;
    e.preventDefault();
    drawing.current = true;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ok */ }
    lastCell.current = cell;
    paint(cell.cx, cell.cy);
  }, [toCell, paint]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drawing.current) return;
    const cell = toCell(e);
    if (!cell) return;
    e.preventDefault();
    // Interpolate along the segment since last point so fast drags stay solid.
    const prev = lastCell.current ?? cell;
    const steps = Math.max(1, Math.ceil(Math.hypot(cell.cx - prev.cx, cell.cy - prev.cy) * 2));
    for (let i = 1; i <= steps; i++) {
      paint(prev.cx + (cell.cx - prev.cx) * (i / steps), prev.cy + (cell.cy - prev.cy) * (i / steps));
    }
    lastCell.current = cell;
  }, [toCell, paint]);

  const onUp = useCallback((e: React.PointerEvent) => {
    drawing.current = false;
    lastCell.current = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ok */ }
  }, []);

  // Per-layer normalizers so hidden activations (unbounded ReLU) map into 0..1
  // for shading with visible contrast.
  const norm = (arr: Float32Array | undefined) => {
    if (!arr) return { m: 1 };
    let m = 1e-6;
    for (const v of arr) if (v > m) m = v;
    return { m };
  };
  const n1 = norm(activations?.h1);
  const n2 = norm(activations?.h2);

  // Hover-to-explain: which output tile is hovered (or null). Tracing a path
  // needs activations; hovering with an empty canvas does nothing.
  const [hoveredOut, setHoveredOut] = useState<number | null>(null);
  const path = useMemo<TracedPath | null>(() => {
    if (hoveredOut == null || !activations) return null;
    // Only trace when there's actually a drawing to explain.
    let any = false;
    for (const v of activations.raw) if (v > 0.02) { any = true; break; }
    if (!any) return null;
    return tracePath(net, geo, activations, hoveredOut, hoveredOut === predicted);
  }, [hoveredOut, activations, net, geo, predicted]);
  const pathActive = path != null;

  // Which path edge is hovered (index into path.edges), for the weight tooltip.
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  // Reset the edge tooltip whenever the traced path changes.
  const pathKey = path ? `${path.kind}:${path.out}` : null;
  const prevPathKey = useRef(pathKey);
  if (pathKey !== prevPathKey.current) {
    prevPathKey.current = pathKey;
    if (hoveredEdge !== null) setHoveredEdge(null);
  }

  // Which edges to draw: those with abs >= threshold * layerMax. Slider is
  // inverted so 0 = show none-but-strongest handful, 1 = show more. We clamp to
  // a hard cap on drawn lines for the dense first layer to protect smoothness.
  const cut1 = (1 - edgeThreshold) * geo.max1;
  const cut2 = (1 - edgeThreshold) * geo.max2;
  const cut3 = (1 - edgeThreshold) * geo.max3;
  const CAP1 = 700; // max input->h1 lines in the DOM

  const drawn1 = useMemo(() => {
    const out: Edge[] = [];
    for (const e of geo.e1) { if (e.abs < cut1) break; out.push(e); if (out.length >= CAP1) break; }
    return out;
  }, [geo.e1, cut1]);
  const drawn2 = useMemo(() => geo.e2.filter((e) => e.abs >= cut2), [geo.e2, cut2]);
  const drawn3 = useMemo(() => geo.e3.filter((e) => e.abs >= cut3), [geo.e3, cut3]);

  // Reverse so strongest (first in sorted order) paint last / on top.
  const renderEdges = (edges: Edge[], max: number, key: string) =>
    edges
      .slice()
      .reverse()
      .map((e, i) => {
        const s = edgeStroke(e.w, e.abs, max);
        return (
          <line
            key={`${key}-${i}`}
            x1={e.ax} y1={e.ay} x2={e.bx} y2={e.by}
            stroke={s.color} strokeOpacity={s.opacity} strokeWidth={s.width}
          />
        );
      });

  return (
    <svg
      ref={svgRef}
      className="mnist-net"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Neural network: draw a digit on the input grid at the top; two hidden layers and output digits follow below"
    >
      {/* Layer captions in the left gutter. Small mono, vertically centered on
          each row, sitting left of the node inset so they never overlap. */}
      <g className="mnist-net__labels" fontSize={12}>
        <text x={10} y={Y_INPUT} dominantBaseline="middle">input</text>
        <text x={10} y={Y_H1} dominantBaseline="middle">hidden 1</text>
        <text x={10} y={Y_H2} dominantBaseline="middle">hidden 2</text>
        <text x={10} y={Y_OUT} dominantBaseline="middle">output</text>
      </g>

      {/* Edges first, so nodes sit on top. Draw deepest layer first. When a
          hover path is active, dim the whole base network so the traced path
          reads clearly on top. */}
      <g strokeLinecap="round" opacity={pathActive ? 0.12 : 1}>
        {renderEdges(drawn1, geo.max1, "e1")}
        {renderEdges(drawn2, geo.max2, "e2")}
        {renderEdges(drawn3, geo.max3, "e3")}
      </g>

      {/* Highlight layer: the traced path, drawn thick with a soft glow. Red for
          a positive edge, blue for negative — same vocabulary as the weights.
          Each edge carries a wide invisible hit-line so hovering it is easy and
          shows a weight tooltip. */}
      {path && (
        <g strokeLinecap="round" className="mnist-net__path">
          {path.edges.map((e, i) => {
            const color = e.positive ? "#d1344b" : "#2f6fd0";
            const on = hoveredEdge === i;
            return (
              <g key={`pe-${i}`}>
                {/* glow underlay */}
                <line x1={e.ax} y1={e.ay} x2={e.bx} y2={e.by}
                  stroke={color} strokeOpacity={on ? 0.4 : 0.25} strokeWidth={on ? 9 : 7} />
                <line x1={e.ax} y1={e.ay} x2={e.bx} y2={e.by}
                  stroke={color} strokeOpacity={0.95} strokeWidth={on ? 3.4 : 2.4} />
                {/* wide invisible hover target */}
                <line x1={e.ax} y1={e.ay} x2={e.bx} y2={e.by}
                  stroke="transparent" strokeWidth={16}
                  style={{ cursor: "help" }}
                  onPointerEnter={() => setHoveredEdge(i)}
                  onPointerLeave={() => setHoveredEdge((cur) => (cur === i ? null : cur))}
                />
              </g>
            );
          })}
        </g>
      )}

      {/* Input grid — this is also the drawing surface. Cells shade from the
          RAW drawing, so your marks stay fixed exactly where you drew them.
          (The network runs on a normalized — cropped/scaled/recentred — copy
          internally, but showing that here would make the image jump and
          expand under the pen on every stroke, which is disorienting.) A
          transparent hit-rect on top captures the pointer. */}
      <g>
        {geo.input.map((c, i) => {
          const v = activations ? activations.raw[i]! : 0;
          const onPath = path?.px.has(i);
          return (
            <rect
              key={`in-${i}`}
              x={c.cx - c.s / 2} y={c.cy - c.s / 2}
              width={c.s} height={c.s}
              fill={shade(v)}
              stroke="#e7e2da" strokeWidth={0.5}
              // Keep path pixels at full strength; dim the rest while a path is
              // shown so the outlined pixels stand out.
              opacity={pathActive && !onPath ? 0.35 : 1}
            />
          );
        })}
        {/* Outline the traced pixels (drawn after all cells so the outline is
            never overpainted by a neighbour). */}
        {path && [...path.px].map((i) => {
          const c = geo.input[i]!;
          return (
            <rect
              key={`pxo-${i}`}
              x={c.cx - c.s / 2 - 1} y={c.cy - c.s / 2 - 1}
              width={c.s + 2} height={c.s + 2}
              fill="none" stroke="#111" strokeWidth={2}
            />
          );
        })}
        {/* Frame + drawing hint. */}
        <rect
          x={geo.gx0} y={geo.gy0} width={geo.gridBlock} height={geo.gridBlock}
          fill="none" stroke="#c9c2b8" strokeWidth={1.5}
        />
        {/* Transparent capture surface — sits above the cells so every pointer
            move over the grid paints. */}
        <rect
          className="mnist-net__draw"
          x={geo.gx0} y={geo.gy0} width={geo.gridBlock} height={geo.gridBlock}
          fill="transparent"
          style={{ cursor: "crosshair", touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
      </g>

      {/* Hidden 1. Heavily-rounded squares (mostly circular but still a touch
          rectangular), sized to leave ~3px between neighbours. Path nodes grow
          a little and get a dark accent ring; others dim. */}
      <g>
        {geo.h1.map((p, i) => {
          const onPath = path?.h1.has(i);
          const S = onPath ? HNODE + 4 : HNODE;
          return (
            <rect
              key={`h1-${i}`}
              x={p.cx - S / 2} y={p.cy - S / 2} width={S} height={S}
              rx={HNODE_RX} ry={HNODE_RX}
              fill={shade(activations ? activations.h1[i]! / n1.m : 0)}
              stroke={onPath ? "#111" : "#888888"} strokeWidth={onPath ? 3 : 2}
              opacity={pathActive && !onPath ? 0.3 : 1}
            />
          );
        })}
      </g>
      {/* Hidden 2. */}
      <g>
        {geo.h2.map((p, i) => {
          const onPath = path?.h2.has(i);
          const S = onPath ? HNODE + 4 : HNODE;
          return (
            <rect
              key={`h2-${i}`}
              x={p.cx - S / 2} y={p.cy - S / 2} width={S} height={S}
              rx={HNODE_RX} ry={HNODE_RX}
              fill={shade(activations ? activations.h2[i]! / n2.m : 0)}
              stroke={onPath ? "#111" : "#888888"} strokeWidth={onPath ? 3 : 2}
              opacity={pathActive && !onPath ? 0.3 : 1}
            />
          );
        })}
      </g>
      {/* Output — bigger rounded-square tiles with the digit set INSIDE in the
          theme monospace face, so they read as labelled keys. The winner is
          filled with the accent and ringed; the digit flips to a light glyph so
          it stays legible on the dark fill. Others shade white->black by their
          probability, with the glyph auto-contrasting.

          Hovering a tile traces an explanatory path (see tracePath): the
          winner explains why it fired; a wrong tile shows what pushed against
          it. Only meaningful once something is drawn. */}
      <g>
        {geo.out.map((p, i) => {
          const v = activations ? activations.output[i]! : 0;
          const label = net.labels[i] ?? "";
          const win = i === predicted && v > 0;
          const S = 40; // tile size
          const long = label.length > 2;
          const hovered = hoveredOut === i;
          // Glyph colour: light on the accent-filled winner or a dark
          // background; dark otherwise.
          const glyph = win ? "#fff" : v > 0.55 ? "#fff" : "var(--text-strong, #1c1917)";
          const dimTile = pathActive && !hovered;
          return (
            <g
              key={`out-${i}`}
              style={{ cursor: "pointer" }}
              opacity={dimTile ? 0.4 : 1}
              onPointerEnter={() => setHoveredOut(i)}
              onPointerLeave={() => setHoveredOut((cur) => (cur === i ? null : cur))}
            >
              <rect
                x={p.cx - S / 2} y={p.cy - S / 2}
                width={S} height={S} rx={10} ry={10}
                fill={win ? "var(--accent, #2b62a8)" : shade(v)}
                stroke={hovered ? "#111" : win ? "var(--accent, #2b62a8)" : "#c9c2b8"}
                strokeWidth={hovered ? 3.5 : win ? 3.5 : 2.25}
              />
              <text
                x={p.cx} y={p.cy}
                textAnchor="middle" dominantBaseline="central"
                fontFamily="var(--font-mono, monospace)"
                fontSize={long ? 11 : 20}
                fontWeight={700}
                fill={glyph}
              >
                {label}
              </text>
            </g>
          );
        })}
      </g>

      {/* One-line caption for the active path, so the trace is self-explaining. */}
      {path && (
        <text
          className="mnist-net__caption"
          x={W / 2} y={H - 6}
          textAnchor="middle"
          fontFamily="var(--font-mono, monospace)"
          fontSize={12}
        >
          {path.kind === "positive"
            ? `why “${net.labels[path.out]}” fired: the pixels & neurons pushing it up`
            : `“${net.labels[path.out]}” lost: neurons & pixels pushing against it`}
        </text>
      )}

      {/* Weight tooltip for the hovered path edge. Rendered last so it sits on
          top of everything. Positioned at the edge midpoint, nudged up, and
          clamped inside the viewBox. */}
      {path && hoveredEdge != null && path.edges[hoveredEdge] && (() => {
        const e = path.edges[hoveredEdge]!;
        const mx = (e.ax + e.bx) / 2;
        const my = (e.ay + e.by) / 2;
        // Show the contribution as an explicit formula (weight × activation)
        // so a large contribution next to a small weight reads as sensible —
        // it's the source neuron's activation doing the scaling.
        const lines = [
          `${e.from} → ${e.to}`,
          `weight       ${fmtSigned(e.weight)}`,
          `activation   ${fmtSigned(e.srcActivation)}`,
          `contribution ${fmtSigned(e.contribution)}  = w×a`,
        ];
        const charW = 7.2, padX = 10, padY = 8, lineH = 15;
        const boxW = Math.max(...lines.map((l) => l.length)) * charW + padX * 2;
        const boxH = lines.length * lineH + padY * 2 - 3;
        // Prefer above the midpoint; clamp horizontally into the viewBox.
        let bx = mx - boxW / 2;
        bx = Math.max(6, Math.min(W - boxW - 6, bx));
        let by = my - boxH - 14;
        if (by < 4) by = my + 14; // flip below if no room above
        const accent = e.positive ? "#d1344b" : "#2f6fd0";
        return (
          <g className="mnist-net__tip" pointerEvents="none">
            <rect x={bx} y={by} width={boxW} height={boxH} rx={7} ry={7}
              fill="#1c1917" stroke={accent} strokeWidth={1.5} opacity={0.97} />
            {lines.map((l, i) => (
              <text
                key={i}
                x={bx + padX} y={by + padY + 11 + i * lineH}
                fontFamily="var(--font-mono, monospace)" fontSize={11}
                fill={i === 0 ? "#fff" : "#e7e2da"}
                fontWeight={i === 0 ? 700 : 400}
              >
                {l}
              </text>
            ))}
          </g>
        );
      })()}
    </svg>
  );
}

// Format a number with an explicit + / - sign and 2 decimals, for tooltips.
function fmtSigned(v: number): string {
  const s = v >= 0 ? "+" : "−";
  return `${s}${Math.abs(v).toFixed(2)}`;
}
