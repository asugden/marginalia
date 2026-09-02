// Shared plotting bits for the two views: the class palette, data<->pixel
// scales, and the region rasteriser.

import { DOMAIN } from "./nb.js";

/** Class colours. Blue and red match the weight colours used by the other
 *  examples on this site; the third is a teal that stays distinguishable from
 *  both for the most common forms of colour blindness. Regions reuse the same
 *  hue at low alpha so a shaded area and its points read as one thing. */
export const CLASS_COLORS = ["#2f6fd0", "#d1344b", "#1f9d76"] as const;
export const CLASS_RGB: Array<[number, number, number]> = [
  [47, 111, 208],
  [209, 52, 75],
  [31, 157, 118],
];

/** Alpha used when filling decision regions, out of 255. Light enough that the
 *  scatter stays legible on top. */
const REGION_ALPHA = 46;

export interface Scale {
  /** Data value -> pixel. */
  x: (v: number) => number;
  y: (v: number) => number;
  /** Pixel -> data value. */
  invX: (px: number) => number;
  invY: (py: number) => number;
}

export function makeScale(left: number, top: number, size: number): Scale {
  const [lo, hi] = DOMAIN;
  const span = hi - lo;
  return {
    x: (v) => left + ((v - lo) / span) * size,
    y: (v) => top + size - ((v - lo) / span) * size,
    invX: (px) => lo + ((px - left) / size) * span,
    invY: (py) => lo + ((top + size - py) / size) * span,
  };
}

export function clampToDomain(v: number): number {
  return Math.max(DOMAIN[0]!, Math.min(DOMAIN[1]!, v));
}

/** Paint decision regions into a canvas by evaluating the classifier on every
 *  pixel of a coarse grid. The canvas is rendered at a fraction of its display
 *  size and scaled up by the browser: the boundaries end up softly antialiased,
 *  which is honest — the exact pixel where a boundary falls is not the point. */
export function paintRegions(
  canvas: HTMLCanvasElement,
  res: number,
  predict: (x: number[]) => number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const [lo, hi] = DOMAIN;
  const span = hi - lo;
  const img = ctx.createImageData(res, res);
  const data = img.data;
  for (let py = 0; py < res; py++) {
    // Pixel centres, and y is flipped because canvas rows run downwards.
    const dy = hi - ((py + 0.5) / res) * span;
    for (let px = 0; px < res; px++) {
      const dx = lo + ((px + 0.5) / res) * span;
      const rgb = CLASS_RGB[predict([dx, dy])] ?? [128, 128, 128];
      const o = (py * res + px) * 4;
      data[o] = rgb[0]!;
      data[o + 1] = rgb[1]!;
      data[o + 2] = rgb[2]!;
      data[o + 3] = REGION_ALPHA;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Paint 1D decision regions as vertical bands into a wide, one-pixel-tall
 *  canvas that the browser stretches to the strip's height. */
export function paintBands(
  canvas: HTMLCanvasElement,
  res: number,
  predict: (x: number[]) => number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const [lo, hi] = DOMAIN;
  const span = hi - lo;
  const img = ctx.createImageData(res, 1);
  for (let px = 0; px < res; px++) {
    const dx = lo + ((px + 0.5) / res) * span;
    const rgb = CLASS_RGB[predict([dx])] ?? [128, 128, 128];
    const o = px * 4;
    img.data[o] = rgb[0]!;
    img.data[o + 1] = rgb[1]!;
    img.data[o + 2] = rgb[2]!;
    img.data[o + 3] = REGION_ALPHA;
  }
  ctx.putImageData(img, 0, 0);
}

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** Rasterise decision regions to a data URL, so the result can live inside the
 *  SVG as an <image> and scale with it. Keeping everything in one SVG avoids
 *  having to keep a separately-positioned canvas in sync with a responsive
 *  viewBox. */
export function regionDataUrl(res: number, predict: (x: number[]) => number): string {
  const c = document.createElement("canvas");
  c.width = res;
  c.height = res;
  paintRegions(c, res, predict);
  return c.toDataURL();
}

export function bandDataUrl(res: number, predict: (x: number[]) => number): string {
  const c = document.createElement("canvas");
  c.width = res;
  c.height = 1;
  paintBands(c, res, predict);
  return c.toDataURL();
}
