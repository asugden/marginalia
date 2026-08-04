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

import { useCallback, useMemo, useRef } from "react";
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

// Positive weight -> red, negative -> blue. Both OPACITY and LINE WIDTH scale
// with |weight| relative to the layer max, so a strong connection reads as a
// bolder, more saturated line and a weak one as a faint hairline — magnitude is
// encoded twice (colour intensity + thickness), which reads more clearly than
// colour alone. A gentle gamma lifts mid-strength edges into visibility; width
// uses a softer gamma so the thickness cue stays subtle rather than shouting.
function edgeStroke(w: number, abs: number, max: number): { color: string; opacity: number; width: number } {
  const r = abs / max;
  const tOpacity = Math.pow(r, 0.6);
  const tWidth = Math.pow(r, 0.8);
  return {
    color: w >= 0 ? "#d1344b" : "#2f6fd0",
    opacity: 0.1 + 0.8 * tOpacity,
    width: 0.5 + 2.6 * tWidth,
  };
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

      {/* Edges first, so nodes sit on top. Draw deepest layer first. */}
      <g strokeLinecap="round">{renderEdges(drawn1, geo.max1, "e1")}</g>
      <g strokeLinecap="round">{renderEdges(drawn2, geo.max2, "e2")}</g>
      <g strokeLinecap="round">{renderEdges(drawn3, geo.max3, "e3")}</g>

      {/* Input grid — this is also the drawing surface. Cells shade from the
          RAW drawing, so your marks stay fixed exactly where you drew them.
          (The network runs on a normalized — cropped/scaled/recentred — copy
          internally, but showing that here would make the image jump and
          expand under the pen on every stroke, which is disorienting.) A
          transparent hit-rect on top captures the pointer. */}
      <g>
        {geo.input.map((c, i) => {
          const v = activations ? activations.raw[i]! : 0;
          return (
            <rect
              key={`in-${i}`}
              x={c.cx - c.s / 2} y={c.cy - c.s / 2}
              width={c.s} height={c.s}
              fill={shade(v)}
              stroke="#e7e2da" strokeWidth={0.5}
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

      {/* Hidden 1. */}
      <g>
        {geo.h1.map((p, i) => (
          <circle
            key={`h1-${i}`} cx={p.cx} cy={p.cy} r={9}
            fill={shade(activations ? activations.h1[i]! / n1.m : 0)}
            stroke="#c9c2b8" strokeWidth={1}
          />
        ))}
      </g>
      {/* Hidden 2. */}
      <g>
        {geo.h2.map((p, i) => (
          <circle
            key={`h2-${i}`} cx={p.cx} cy={p.cy} r={9}
            fill={shade(activations ? activations.h2[i]! / n2.m : 0)}
            stroke="#c9c2b8" strokeWidth={1}
          />
        ))}
      </g>
      {/* Output — bigger rounded-square tiles with the digit set INSIDE in the
          theme monospace face, so they read as labelled keys. The winner is
          filled with the accent and ringed; the digit flips to a light glyph so
          it stays legible on the dark fill. Others shade white->black by their
          probability, with the glyph auto-contrasting. */}
      <g>
        {geo.out.map((p, i) => {
          const v = activations ? activations.output[i]! : 0;
          const label = net.labels[i] ?? "";
          const win = i === predicted && v > 0;
          const S = 40; // tile size
          const long = label.length > 2;
          // Glyph colour: light on the accent-filled winner or a dark
          // background; dark otherwise.
          const glyph = win ? "#fff" : v > 0.55 ? "#fff" : "var(--text-strong, #1c1917)";
          return (
            <g key={`out-${i}`}>
              <rect
                x={p.cx - S / 2} y={p.cy - S / 2}
                width={S} height={S} rx={10} ry={10}
                fill={win ? "var(--accent, #2b62a8)" : shade(v)}
                stroke={win ? "var(--accent, #2b62a8)" : "#c9c2b8"}
                strokeWidth={win ? 3 : 1.25}
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
    </svg>
  );
}
