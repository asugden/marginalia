// The network box: a network drawn as neurons, and under it the weights
// between each pair of layers laid out as the matrix they are.
//
// Colour. The matrices are drawn in the learned scale (sage above zero, plum
// below) only when they hold real trained weights: the digit recognizer's.
// Any other shape the reader drags has no trained weights, so its matrices
// are a flat neutral grey, the same grey as the layer bars: there is a count
// to show, but no values. ResNet-50 is drawn the same way.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Net } from "../mnist-mlp/net.js";
import { learned } from "../shared/palette.js";
import type { Conv } from "./budget.js";

/** A count with no values: the greyscale scale's no-sign case, one strength. */
export const COUNT_FILL = "color-mix(in srgb, var(--ml-input-ink) 30%, var(--surface))";

const W = 1000;

/** Read a colour token as RGB, for painting on a canvas. */
function tokenRgb(token: string): [number, number, number] {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
  probe.remove();
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [128, 128, 128];
}

/** A weight matrix painted one pixel per weight (rows = the layer it
 *  reaches, columns = the layer it leaves), in the learned scale against its
 *  own largest weight. */
function matrixUrl(M: Float32Array, rows: number, cols: number): string {
  const pos = tokenRgb("--ml-learned-pos");
  const neg = tokenRgb("--ml-learned-neg");
  const zero = tokenRgb("--surface");
  const sorted = Array.from(M, Math.abs).sort((a, b) => a - b);
  const bound = sorted[Math.floor(sorted.length * 0.98)] || 1;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cols, rows);
  for (let i = 0; i < rows * cols; i++) {
    const t = Math.max(-1, Math.min(1, M[i]! / bound)) * 0.92;
    const pole = t >= 0 ? pos : neg;
    const a = Math.abs(t);
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = zero[ch]! + (pole[ch]! - zero[ch]!) * a;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** How many neurons stand for a layer: more for a wider layer, loosely
 *  (the square root), so a 400-wide input reads wider than a 25-wide hidden
 *  layer without drawing all 400. */
function shownCount(w: number): number {
  return Math.min(w, Math.max(2, Math.min(16, Math.round(1.4 * Math.sqrt(w)))));
}

/** Which neurons are drawn: evenly spaced, and when some are left out, a gap
 *  (null) before the last one. */
function shownIndices(w: number): Array<number | null> {
  const k = shownCount(w);
  if (k === w) return Array.from({ length: w }, (_, i) => i);
  const head = Array.from({ length: k - 1 }, (_, i) => Math.round((i * (w - 2)) / Math.max(1, k - 2)));
  return [...head, null, w - 1];
}

/** The network, top to bottom as in the deep neural network example. Down
 *  the left, one bar per layer, dragged by its end to set the layer's width.
 *  In the middle, the layers as rows of neurons. On the right, beside each gap,
 *  that gap's weights as a grid: a column for each neuron above, a row for
 *  each neuron below, all grids at one scale so the area is the count. */
export function NetworkFigure({
  widths,
  net,
  names,
  min,
  max,
  onChange,
}: {
  widths: number[];
  /** The trained network, when `widths` is its shape. */
  net: Net | null;
  names: string[];
  min: number;
  max: number;
  onChange: (i: number, v: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<number | null>(null);
  const mats = net ? [net.W1, net.W2, net.W3] : null;

  // ── Columns across the figure ──
  const barX = 0;
  const barMax = 170;
  const netL = 250;
  const netR = 610;
  const netC = (netL + netR) / 2;
  const matX = 650;
  const matW = W - matX;

  // ── The grids' one scale ──
  const gaps = widths.slice(0, -1).map((from, i) => ({ from, to: widths[i + 1]! }));
  const maxFrom = Math.max(...gaps.map((g) => g.from));
  const maxTo = Math.max(...gaps.map((g) => g.to));
  const c = Math.min(2.4, matW / maxFrom, 170 / maxTo);

  // ── Rows down the figure: each gap is tall enough for its grid ──
  const N = 14;
  const pitch = 22;
  const top = 28;
  const ys: number[] = [top];
  gaps.forEach((g) => ys.push(ys[ys.length - 1]! + Math.max(96, g.to * c + 56)));
  const H = ys[ys.length - 1]! + 30;

  const rows = widths.map((w, i) => {
    const idx = shownIndices(w);
    const span = (idx.length - 1) * pitch;
    return idx.map((n, j) => ({ idx: n, x: netC - span / 2 + j * pitch, y: ys[i]! }));
  });

  const urls = useMemo(
    () => (mats ? gaps.map((g, i) => matrixUrl(mats[i]!, g.to, g.from)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [net, widths.join(",")],
  );

  // Bars: a fixed square-root scale, so the scale never moves under the pointer.
  const barLen = (w: number) => Math.max(3, Math.sqrt(w / max) * barMax);
  const widthAt = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return min;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = 0;
      const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      const f = Math.max(0, Math.min(1, (p.x - barX) / barMax));
      return Math.round(f * f * max);
    },
    [min, max],
  );
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current === null) return;
      e.preventDefault();
      onChange(dragging.current, widthAt(e.clientX));
    };
    const up = () => {
      dragging.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onChange, widthAt]);

  return (
    <svg ref={svgRef} className="pb-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="The network, a bar per layer to set its width, and each gap's weights as a grid">
      {/* Wires: one line per weight between the neurons drawn. */}
      {rows.slice(0, -1).map((upper, i) =>
        upper.flatMap((a) =>
          a.idx === null
            ? []
            : rows[i + 1]!.filter((b) => b.idx !== null).map((b) => {
                const v = mats ? mats[i]![b.idx! * widths[i]! + a.idx!]! : 0;
                return (
                  <line key={`${i}-${a.idx}-${b.idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={mats ? learned(v / 0.3) : "var(--fig-node-border)"}
                    strokeOpacity={mats ? 0.85 : 0.3} strokeWidth={1} />
                );
              }),
        ),
      )}
      {rows.map((row, i) => (
        <g key={i}>
          {row.map((n, j) =>
            n.idx === null ? (
              <text key={j} className="fig-tick" x={n.x} y={n.y + 3} textAnchor="middle">⋯</text>
            ) : (
              <rect key={j} className="fig-neuron" x={n.x - N / 2} y={n.y - N / 2} width={N} height={N}
                rx={N / 3} fill="var(--surface)" />
            ),
          )}
        </g>
      ))}

      {/* The bars: the reader's control, so the accent (style.md §4). */}
      {widths.map((w, i) => (
        <g key={`bar${i}`}>
          <text className="fig-label" x={barX} y={ys[i]! - 12}>{names[i]}</text>
          <rect x={barX} y={ys[i]! - 5} width={barMax} height={10} rx={5} fill="var(--surface-sunken)" />
          <rect
            className="pb-netbar"
            x={barX}
            y={ys[i]! - 5}
            width={barLen(w)}
            height={10}
            rx={5}
            role="slider"
            tabIndex={0}
            aria-label={`${names[i]} width`}
            aria-valuenow={w}
            aria-valuemin={min}
            aria-valuemax={max}
            onPointerDown={(e) => {
              e.preventDefault();
              dragging.current = i;
              onChange(i, widthAt(e.clientX));
            }}
            onKeyDown={(e) => {
              const d = e.shiftKey ? 16 : 1;
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                onChange(i, w + d);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                onChange(i, w - d);
              }
            }}
          />
          <rect className="pb-netbar__grip" x={barX + barLen(w) - 2} y={ys[i]! - 8} width={4} height={16} rx={2} />
          <text className="fig-num pb-fig-strong" x={barMax + 12} y={ys[i]! + 4}>{w}</text>
        </g>
      ))}

      {/* Beside each gap, its grid. */}
      {gaps.map((g, i) => {
        const w = Math.max(1, g.from * c);
        const h = Math.max(1, g.to * c);
        const y = (ys[i]! + ys[i + 1]!) / 2 - h / 2 + 4;
        return (
          <g key={`m${i}`}>
            <text className="fig-num pb-fig-strong" x={matX} y={y - 8}>
              {g.from} × {g.to} = {(g.from * g.to).toLocaleString()}
            </text>
            {urls ? (
              <image href={urls[i]} x={matX} y={y} width={w} height={h} preserveAspectRatio="none"
                style={{ imageRendering: "pixelated" }} />
            ) : (
              <rect x={matX} y={y} width={w} height={h} fill={COUNT_FILL} />
            )}
            <rect x={matX} y={y} width={w} height={h} fill="none" stroke="var(--border)" />
            <text className="fig-label-sub" x={matX} y={y + h + 13}>
              {g.from} across, {g.to} down · + {g.to} biases
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Convolutional networks, in the same layout ──────────────────────────

export interface ConvLayer {
  name: string;
  sub: string;
  /** Maps (an image's worth of numbers each) or plain neurons. */
  maps?: { n: number; size: number };
  neurons?: number;
}

export interface ConvGap {
  /** One block's convolutions, left to right (a fully connected layer is a
   *  1 × 1 "kernel" from every input to every output). */
  convs: Conv[];
  times: number;
  total: number;
  /** Real trained weights, one array per conv, laid out
   *  [map out][map in][row][col]. */
  weights?: Float32Array[];
  note: string;
}

/** Paint one conv's weights as a grid: a column block per map it reads, a
 *  row block per map it writes, each block a k × k kernel. */
function kernelGridUrl(Wt: Float32Array, cv: Conv): string {
  const pos = tokenRgb("--ml-learned-pos");
  const neg = tokenRgb("--ml-learned-neg");
  const zero = tokenRgb("--surface");
  const cols = cv.from * cv.k;
  const rows = cv.to * cv.k;
  const sorted = Array.from(Wt, Math.abs).sort((p, q) => p - q);
  const bound = sorted[Math.floor(sorted.length * 0.98)] || 1;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const to = Math.floor(r / cv.k), ky = r % cv.k;
      const from = Math.floor(col / cv.k), kx = col % cv.k;
      const v = Wt[((to * cv.from + from) * cv.k + ky) * cv.k + kx]!;
      const t = Math.max(-1, Math.min(1, v / bound)) * 0.92;
      const pole = t >= 0 ? pos : neg;
      const i = (r * cols + col) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = zero[ch]! + (pole[ch]! - zero[ch]!) * Math.abs(t);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** A convolutional network top to bottom, the fully connected figure's
 *  layout: names down the left, the layers in the middle (maps as tiles,
 *  a stack when there are too many to lay out; neurons as neurons), and
 *  beside each gap its weights as a grid at one scale for the whole figure.
 *  In a convolution's grid every cell is a whole kernel. */
export function ConvFigure({ layers, gaps }: { layers: ConvLayer[]; gaps: ConvGap[] }) {
  const netC = 430;
  const matX = 650;
  const matW = W - matX;
  const inner = 8;
  const cellsW = (g: ConvGap) => g.convs.reduce((a, cv) => a + cv.from * cv.k, 0);
  const cellsH = (g: ConvGap) => Math.max(...g.convs.map((cv) => cv.to * cv.k));
  const c = Math.min(
    4,
    ...gaps.map((g) => (matW - inner * (g.convs.length - 1)) / cellsW(g)),
    170 / Math.max(...gaps.map(cellsH)),
  );

  const side = (size: number) => Math.round(10 + Math.sqrt(size) * 3.6);
  const half = (l: ConvLayer) => (l.maps ? side(l.maps.size) / 2 + (l.maps.n > 8 ? 8 : 0) : 7);
  const top = 12 + half(layers[0]!);
  const ys: number[] = [top];
  gaps.forEach((g, i) => {
    const need = Math.max(96, cellsH(g) * c + 60, half(layers[i]!) + half(layers[i + 1]!) + 44);
    ys.push(ys[i]! + need);
  });
  const H = Math.round(ys[ys.length - 1]! + half(layers[layers.length - 1]!) + 14);

  const urls = useMemo(
    () => gaps.map((g) => (g.weights ? g.convs.map((cv, i) => kernelGridUrl(g.weights![i]!, cv)) : null)),
    [gaps],
  );

  const N = 14;
  const pitch = 22;
  const neuronRow = (n: number, y: number) => {
    const idx = shownIndices(n);
    const span = (idx.length - 1) * pitch;
    return idx.map((v, j) => ({ idx: v, x: netC - span / 2 + j * pitch, y }));
  };

  return (
    <svg className="pb-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="The convolutional network, and each gap's kernels as a grid">
      {/* Wires between neuron rows, as in the fully connected figure. */}
      {layers.slice(0, -1).map((l, i) => {
        const next = layers[i + 1]!;
        if (!l.neurons || !next.neurons) return null;
        const A = neuronRow(l.neurons, ys[i]!).filter((n) => n.idx !== null);
        const B = neuronRow(next.neurons, ys[i + 1]!).filter((n) => n.idx !== null);
        const Wt = gaps[i]!.weights?.[0];
        return A.flatMap((a) =>
          B.map((b) => {
            const v = Wt ? Wt[b.idx! * l.neurons! + a.idx!]! : 0;
            return (
              <line key={`${i}-${a.idx}-${b.idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={Wt ? learned(v / 0.5) : "var(--fig-node-border)"}
                strokeOpacity={Wt ? 0.85 : 0.3} strokeWidth={1} />
            );
          }),
        );
      })}

      {layers.map((l, i) => {
        const y = ys[i]!;
        return (
          <g key={l.name}>
            <text className="fig-label" x={0} y={y - 2}>{l.name}</text>
            <text className="fig-label-sub" x={0} y={y + 11}>{l.sub}</text>
            {l.maps && l.maps.n <= 8 && (() => {
              const s = side(l.maps.size);
              const span = l.maps.n * s + (l.maps.n - 1) * 6;
              return Array.from({ length: l.maps.n }, (_, j) => (
                <rect key={j} className="fig-tile" x={netC - span / 2 + j * (s + 6)} y={y - s / 2}
                  width={s} height={s} rx={3} fill="var(--surface)" />
              ));
            })()}
            {l.maps && l.maps.n > 8 && (() => {
              const s = side(l.maps.size);
              return Array.from({ length: 5 }, (_, d) => {
                const o = (4 - d) * 4;
                return (
                  <rect key={d} className="fig-tile" x={netC - s / 2 + o} y={y - s / 2 - o} width={s} height={s}
                    rx={3} fill={d % 2 ? "var(--sand-100)" : "var(--surface)"} />
                );
              });
            })()}
            {l.maps && l.maps.n > 8 && (
              <text className="fig-num" x={netC + side(l.maps.size) / 2 + 26} y={y + 4}>
                × {l.maps.n.toLocaleString()}
              </text>
            )}
            {l.neurons &&
              neuronRow(l.neurons, y).map((n, j) =>
                n.idx === null ? (
                  <text key={j} className="fig-tick" x={n.x} y={n.y + 3} textAnchor="middle">⋯</text>
                ) : (
                  <rect key={j} className="fig-neuron" x={n.x - N / 2} y={n.y - N / 2} width={N} height={N}
                    rx={N / 3} fill="var(--surface)" />
                ),
              )}
          </g>
        );
      })}

      {gaps.map((g, i) => {
        const h = Math.max(1, cellsH(g) * c);
        const y = (ys[i]! + ys[i + 1]!) / 2 - h / 2 + 6;
        let x = matX;
        return (
          <g key={`g${i}`}>
            <text className="fig-num pb-fig-strong" x={matX} y={y - 8}>
              {g.total.toLocaleString()}
            </text>
            {g.convs.map((cv, j) => {
              const w = Math.max(1, cv.from * cv.k * c);
              const hh = Math.max(1, cv.to * cv.k * c);
              const at = x;
              x += w + inner;
              const url = urls[i]?.[j];
              const step = cv.k * c;
              return (
                <g key={j}>
                  {url ? (
                    <image href={url} x={at} y={y} width={w} height={hh} preserveAspectRatio="none"
                      style={{ imageRendering: "pixelated" }} />
                  ) : (
                    <rect x={at} y={y} width={w} height={hh} fill={COUNT_FILL} />
                  )}
                  {/* Kernel boundaries, while a kernel is big enough to see. */}
                  {cv.k > 1 && step >= 6 &&
                    Array.from({ length: cv.from - 1 }, (_, q) => (
                      <line key={`v${q}`} x1={at + (q + 1) * step} x2={at + (q + 1) * step} y1={y} y2={y + hh}
                        stroke="var(--surface)" strokeWidth={1} />
                    ))}
                  {cv.k > 1 && step >= 6 &&
                    Array.from({ length: cv.to - 1 }, (_, q) => (
                      <line key={`h${q}`} y1={y + (q + 1) * step} y2={y + (q + 1) * step} x1={at} x2={at + w}
                        stroke="var(--surface)" strokeWidth={1} />
                    ))}
                  <rect x={at} y={y} width={w} height={hh} fill="none" stroke="var(--border)" />
                </g>
              );
            })}
            <text className="fig-label-sub" x={matX} y={y + h + 13}>{g.note}</text>
          </g>
        );
      })}
    </svg>
  );
}
