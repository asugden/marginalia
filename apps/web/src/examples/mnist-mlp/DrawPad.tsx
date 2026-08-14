// The drawing surface. A 20x20 grid is far too coarse to draw on directly, so
// we draw at high resolution onto a hidden canvas with a soft, antialiased
// brush, then area-average that down to the 20x20 grayscale vector the network
// expects — the same downsample the offline trainer applies to MNIST, so what
// the user draws and what the net was trained on live in the same space.
//
// Ink is 1 (drawn) on a 0 (empty) field, matching MNIST's white-on-black.
// Emits the 400-length Float32Array on every change so inference is live.

import { useCallback, useEffect, useRef } from "react";

const DIM = 20; // network input grid
const HI = 280; // high-res drawing buffer (also the on-screen size, 1:1)
const CELL = HI / DIM; // 14px per grid cell

export interface DrawPadProps {
  /** Called with the 20x20 = 400 grayscale vector (0..1) whenever the drawing
   *  changes. */
  onChange: (input: Float32Array) => void;
  /** Bumping this number clears the pad. */
  clearSignal: number;
  size?: number; // on-screen px (square); defaults to 280
}

export function DrawPad({ onChange, clearSignal, size = HI }: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Hold `onChange` in a ref so `emit`/`clear` keep a stable identity across
  // renders. Without this, every prediction re-renders the parent, hands us a
  // new `onChange`, which would churn `emit` -> `clear` -> the clear effect and
  // wipe the canvas on every stroke. The ref lets us always call the latest
  // callback without depending on it.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Downsample the HI x HI canvas to DIM x DIM by box-averaging alpha, and
  // hand the result up.
  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, HI, HI).data;
    const out = new Float32Array(DIM * DIM);
    const step = HI / DIM;
    for (let gy = 0; gy < DIM; gy++) {
      for (let gx = 0; gx < DIM; gx++) {
        let acc = 0;
        const x0 = Math.floor(gx * step), x1 = Math.floor((gx + 1) * step);
        const y0 = Math.floor(gy * step), y1 = Math.floor((gy + 1) * step);
        let n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            acc += img[(y * HI + x) * 4 + 3]!; // alpha channel = ink
            n++;
          }
        }
        out[gy * DIM + gx] = n > 0 ? acc / n / 255 : 0;
      }
    }
    onChangeRef.current(out);
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, HI, HI);
    emit();
  }, [emit]);

  // Configure the brush once.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // A soft brush a little over one grid cell wide gives MNIST-like stroke
    // thickness once downsampled, and the shadow blur supplies the
    // antialiased edge falloff that makes the 20x20 result grayscale rather
    // than 1-bit.
    ctx.lineWidth = CELL * 1.6;
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = CELL * 0.8;
  }, []);

  useEffect(() => { clear(); }, [clearSignal, clear]);

  // Map a pointer event to buffer coordinates (buffer is HI x HI; on-screen is
  // `size` — scale accordingly).
  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * HI,
      y: ((e.clientY - rect.top) / rect.height) * HI,
    };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    last.current = p;
    // A dot so a single tap registers.
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.fill();
    emit();
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    emit();
  };

  const end = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch {}
    emit();
  };

  return (
    <canvas
      ref={canvasRef}
      width={HI}
      height={HI}
      className="mnist-drawpad"
      style={{ width: size, height: size, touchAction: "none" }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      aria-label="Draw a digit here"
    />
  );
}
