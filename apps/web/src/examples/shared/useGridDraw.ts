// Shared drawing behaviour for the "draw on the input grid" surface used by
// both example networks. Given a 20x20 (or NxN) grid region inside an SVG, it
// handles pointer capture, a soft antialiased brush, segment interpolation for
// fast drags, and clearing — emitting the grid vector on every change.
//
// The consumer supplies the SVG ref and the grid block bounds (in the SVG's own
// viewBox units) and renders a transparent capture <rect> wired to the returned
// handlers.

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface GridDrawOptions {
  grid: number;          // cells per side (e.g. 20)
  svgRef: React.RefObject<SVGSVGElement | null>;
  gx0: number; gy0: number; block: number; // grid bounds in viewBox units
  onInput: (v: Float32Array) => void;
  clearSignal: number;
}

export interface GridDrawHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}

export function useGridDraw(opts: GridDrawOptions): GridDrawHandlers {
  const { grid, svgRef, gx0, gy0, block, onInput, clearSignal } = opts;
  const ink = useRef<Float32Array>(new Float32Array(grid * grid));
  const drawing = useRef(false);
  const lastCell = useRef<{ cx: number; cy: number } | null>(null);
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  // Clear on clearSignal change and emit the empty vector.
  const prevClear = useRef(clearSignal);
  if (clearSignal !== prevClear.current) {
    prevClear.current = clearSignal;
    ink.current = new Float32Array(grid * grid);
    onInputRef.current(ink.current.slice());
  }

  const toCell = useCallback((e: ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const fx = (pt.x - gx0) / block, fy = (pt.y - gy0) / block;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { cx: fx * grid, cy: fy * grid };
  }, [svgRef, gx0, gy0, block, grid]);

  const paint = useCallback((cx: number, cy: number) => {
    const R = 1.6, buf = ink.current;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(grid - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(grid - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const v = Math.exp(-(d * d) / (2 * 0.75 * 0.75));
      const idx = y * grid + x;
      if (v > buf[idx]!) buf[idx] = Math.min(1, v);
    }
    onInputRef.current(buf.slice());
  }, [grid]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const cell = toCell(e);
    if (!cell) return;
    e.preventDefault();
    drawing.current = true;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ok */ }
    lastCell.current = cell;
    paint(cell.cx, cell.cy);
  }, [toCell, paint]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!drawing.current) return;
    const cell = toCell(e);
    if (!cell) return;
    e.preventDefault();
    const prev = lastCell.current ?? cell;
    const steps = Math.max(1, Math.ceil(Math.hypot(cell.cx - prev.cx, cell.cy - prev.cy) * 2));
    for (let i = 1; i <= steps; i++)
      paint(prev.cx + (cell.cx - prev.cx) * (i / steps), prev.cy + (cell.cy - prev.cy) * (i / steps));
    lastCell.current = cell;
  }, [toCell, paint]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    drawing.current = false;
    lastCell.current = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ok */ }
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
