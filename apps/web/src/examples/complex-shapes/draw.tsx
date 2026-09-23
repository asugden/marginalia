// Shared pieces for the two panels: the path a fitted model draws, the
// parameter slider, and the small glyphs on the pinned bar.

import { minSize, paramsOf, type Fitted, type Kind } from "./fit.js";

/**
 * The fitted curve as an SVG path, drawn exactly rather than sampled: steps
 * as flats joined by straight risers, bends as straight runs between corners.
 * `px` and `py` map data to the figure.
 */
export function fitPath(f: Fitted, x0: number, x1: number, px: (x: number) => number, py: (y: number) => number): string {
  const d: string[] = [];
  if (f.kind === "steps") {
    const edges = [x0, ...f.knots.filter((k) => k > x0 && k < x1), x1];
    // Knots outside the range still count toward which step is which.
    let i = f.knots.filter((k) => k <= x0).length;
    for (let e = 0; e < edges.length - 1; e++) {
      const y = py(f.coef[i]!).toFixed(2);
      d.push(`${e ? "L" : "M"} ${px(edges[e]!).toFixed(2)} ${y}`, `L ${px(edges[e + 1]!).toFixed(2)} ${y}`);
      i++;
    }
    return d.join(" ");
  }
  const xs = [x0, ...f.knots.filter((k) => k > x0 && k < x1), x1];
  return xs
    .map((x, i) => {
      let y = f.coef[0]! + f.coef[1]! * x;
      f.knots.forEach((k, j) => (y += f.coef[j + 2]! * Math.max(0, x - k)));
      return `${i ? "L" : "M"} ${px(x).toFixed(2)} ${py(y).toFixed(2)}`;
    })
    .join(" ");
}

/** The model size nearest a parameter count, so switching between steps and
 *  bends keeps the budget where the reader left it. */
export function sizeFor(kind: Kind, params: number, maxSize: number): number {
  const s = kind === "steps" ? Math.round((params + 1) / 2) : Math.round((params - 4) / 3);
  return Math.max(minSize(kind), Math.min(maxSize, s));
}

/** Label · slider · value, stepping through the sizes a model can have and
 *  showing each as its parameter count. */
export function ParamSlider({
  kind,
  size,
  maxSize,
  onSize,
}: {
  kind: Kind;
  size: number;
  maxSize: number;
  onSize: (s: number) => void;
}) {
  return (
    <label className="cs-slider">
      <span>Parameters</span>
      <input
        type="range"
        min={minSize(kind)}
        max={maxSize}
        step={1}
        value={size}
        onChange={(e) => onSize(parseInt(e.target.value, 10))}
      />
      <span className="cs-slider__val">{paramsOf(kind, size)}</span>
    </label>
  );
}

/** Button glyphs for the pinned bar: a staircase and a bent line. */
export function KindGlyph({ kind }: { kind: Kind }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" className="cs-glyph">
      {kind === "steps" ? <path d="M1 10 H5 V6 H10 V2 H15" /> : <path d="M1 10 L6 7 L10 2 L15 5" />}
    </svg>
  );
}
