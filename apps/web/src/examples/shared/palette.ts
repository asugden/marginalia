// The colour language the example figures speak.
//
// Every number drawn in an example is one of three kinds, and each kind has
// its own scale. A student who learns the three once can read any figure in
// the gallery without a legend:
//
//   learned(t)    a parameter the model fitted — a weight matrix, a kernel.
//                 Signed: sage above zero, plum below.
//   value(t)      a number computed from this input — an activation, a
//                 projection, a score, an output. Signed: vermillion above
//                 zero, cerulean below.
//   magnitude(t)  the same computed quantity when it cannot go below zero —
//                 an attention weight, a probability. The positive arm of
//                 `value` on its own, paper to vermillion.
//   input(t)      the data as it arrived, and genuine edge cases. Greyscale,
//                 paper to ink.
//
// And one thing that is not a number: the class a point belongs to, in a
// classifier. That takes a fixed order of hues (CLASS_HUES, below).
//
// Two rules keep it working:
//
//   Sage and plum mean "learned" and nothing else, anywhere.
//   The brand accent never encodes a number. It is the UI's colour —
//   buttons, selection, focus, "look at this one" — and it changes from
//   deploy to deploy, which is exactly why no datum may depend on it.
//
// The values live in the design-system token layer (tokens/colors.css,
// --ml-*), so a figure and a stylesheet always agree. See docs/style.md.

/**
 * Mix a scale colour toward whatever counts as zero: `t` in 0..1 is how far
 * from zero. `zero` is the surface the mark sits on — the page's paper by
 * default, or a sunken well's own colour when a figure is inset — so a cell
 * at zero disappears into its background rather than hovering above it.
 */
function toward(token: string, t: number, strength: number, zero: string): string {
  const pct = Math.round(Math.max(0, Math.min(1, t)) * strength);
  return `color-mix(in srgb, var(${token}) ${pct}%, var(${zero}))`;
}

/**
 * A learned parameter, signed. `t` is the value divided by the bound the
 * figure is scaling against, so −1..1.
 */
export function learned(t: number, strength = 92, zero = "--ml-mark-zero"): string {
  const c = Math.max(-1, Math.min(1, t));
  return c >= 0
    ? toward("--ml-learned-pos", c, strength, zero)
    : toward("--ml-learned-neg", -c, strength, zero);
}

/** A computed value, signed. Same −1..1 convention. */
export function value(t: number, strength = 92, zero = "--ml-mark-zero"): string {
  const c = Math.max(-1, Math.min(1, t));
  return c >= 0
    ? toward("--ml-value-pos", c, strength, zero)
    : toward("--ml-value-neg", -c, strength, zero);
}

/**
 * A computed value that cannot be negative — an attention weight, a
 * probability, a softmax row. `t` runs 0..1.
 */
export function magnitude(t: number, strength = 100, zero = "--ml-mark-zero"): string {
  return toward("--ml-value-pos", t, strength, zero);
}

/**
 * The input as it arrived — pixels, raw features — and the occasional edge
 * case where a figure genuinely has no sign to show. `t` runs 0..1.
 */
export function input(t: number, strength = 100, zero = "--ml-mark-zero"): string {
  return toward("--ml-input-ink", t, strength, zero);
}

/**
 * The poles as bare token references, for marks that carry their magnitude
 * some other way — an edge whose width and opacity already say how big the
 * weight is, a legend swatch, a CSS rule.
 */
export const LEARNED_POS = "var(--ml-learned-pos)";
export const LEARNED_NEG = "var(--ml-learned-neg)";

/**
 * The class a point belongs to, in a classifier: a category, not a number,
 * so a fixed order of hues rather than a scale. Class 0 is always the first
 * hue, whatever else is on screen. In a classifier the class owns the hue and
 * the mark says what kind of thing it is (dot = data, soft fill = the true
 * distribution, solid line = a fit, flat wash = a prediction).
 */
export const CLASS_HUES = [
  "var(--ml-class-1)",
  "var(--ml-class-2)",
  "var(--ml-class-3)",
] as const;
export const CLASS_INKS = [
  "var(--ml-class-1-ink)",
  "var(--ml-class-2-ink)",
  "var(--ml-class-3-ink)",
] as const;

export function classHue(i: number): string {
  return CLASS_HUES[i] ?? "var(--ml-input-ink)";
}

/**
 * A class hue resolved to concrete RGB, for canvas painting (which cannot read
 * CSS variables). Reads the live token, so a figure and its raster agree.
 */
export function classRgb(i: number): [number, number, number] {
  const fallback: [number, number, number] = [120, 113, 106];
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = classHue(i);
  probe.style.display = "none";
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
  probe.remove();
  if (!m || m.length < 3) return fallback;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
export const VALUE_POS = "var(--ml-value-pos)";
export const VALUE_NEG = "var(--ml-value-neg)";
