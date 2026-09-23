// Plotting bits shared by the classification views: data<->pixel scales, the
// decision-region rasteriser, and number formatting.
//
// Regions are a prediction, so they take the class hue as a flat wash at low
// opacity (docs/style.md §11, "Category"). The canvas cannot read CSS
// variables, so the hues are resolved from the live tokens once per paint.

import { classRgb } from "../palette.js";
import { DOMAIN } from "./data.js";

/** Alpha used when filling decision regions, out of 255. Light enough that the
 *  points stay legible on top. */
const REGION_ALPHA = 40;

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

/** Evenly spaced sample positions across the domain, for drawing curves. */
export function domainSamples(n: number): number[] {
  const [lo, hi] = DOMAIN;
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

function palette(): Array<[number, number, number]> {
  return [0, 1, 2].map((i) => classRgb(i));
}

/** Rasterise decision regions to a data URL, so the result can live inside the
 *  SVG as an <image> and scale with it. Rendered coarse and upscaled by the
 *  browser: the boundaries come out softly antialiased, which is honest — the
 *  exact pixel where a boundary falls is not the point. */
export function regionDataUrl(res: number, predict: (x: number[]) => number): string {
  const c = document.createElement("canvas");
  c.width = res;
  c.height = res;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const rgbs = palette();
  const [lo, hi] = DOMAIN;
  const span = hi - lo;
  const img = ctx.createImageData(res, res);
  for (let py = 0; py < res; py++) {
    // Pixel centres; y is flipped because canvas rows run downwards.
    const dy = hi - ((py + 0.5) / res) * span;
    for (let px = 0; px < res; px++) {
      const dx = lo + ((px + 0.5) / res) * span;
      const rgb = rgbs[predict([dx, dy])] ?? [128, 128, 128];
      const o = (py * res + px) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = REGION_ALPHA;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** 1D decision regions as vertical bands, in a one-pixel-tall canvas that the
 *  browser stretches to the strip's height. */
export function bandDataUrl(res: number, predict: (x: number[]) => number): string {
  const c = document.createElement("canvas");
  c.width = res;
  c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const rgbs = palette();
  const [lo, hi] = DOMAIN;
  const span = hi - lo;
  const img = ctx.createImageData(res, 1);
  for (let px = 0; px < res; px++) {
    const dx = lo + ((px + 0.5) / res) * span;
    const rgb = rgbs[predict([dx])] ?? [128, 128, 128];
    const o = px * 4;
    img.data[o] = rgb[0];
    img.data[o + 1] = rgb[1];
    img.data[o + 2] = rgb[2];
    img.data[o + 3] = REGION_ALPHA;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** The height of a full strip, in prior-scaled density. Fixed rather than
 *  taken from the data, so a curve of a given width is the same height on
 *  every sample. It clears the tallest true curve any of the shapes produces
 *  (about 0.5, a tight lump in the three-class checkerboard). */
export const STRIP_PEAK = 0.52;

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** Stable pseudo-random jitter in 0..1 for index i, so a dot strip or rug does
 *  not reshuffle on every render. */
export function jitter(i: number): number {
  return (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1;
}
