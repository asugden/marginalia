// Class colours for the tree examples, drawn from the design system's semantic
// hue tokens. Deliberately *not* blue or red: those two carry a meaning already
// established elsewhere on the site — blue negative, red positive in the neural
// network examples — and the tree diagram spends them on its "no" and "yes"
// edges. A class fill and an edge must never be confusable, so the classes take
// the remaining hues.
//
// The first three are shared with the distribution game so a student moving
// between the two pages keeps the same associations; the fourth is only needed
// by the four-animal taxonomy.
// Each is its design-system hue mixed 62% into white. The saturated -600
// values read as alarm signals when they fill a bar this size; at this weight
// the mix is still unambiguous but sits behind the text rather than shouting
// over it.
export const CLASS_PALETTE = ["#7eae94", "#b3adf4", "#d1ac6a", "#f4a399"] as const;

/** Neutral ramp for "how good is this split", used by the gain chart. */
export const GAIN_BAR = "#7c5cc4";
/** The winning bar. Purple rather than red, so red stays reserved for "yes". */
export const GAIN_BAR_WIN = "#5b3fa8";
export const GAIN_BAR_NOISE = "#9aa0a6";

/** The two branch directions, and the trunk above them that carries both.
 *  These are the whole reason the class palette avoids blue and red.
 *
 *  Softened well below full saturation: an edge is structure, not data, and at
 *  the widths the row-count encoding produces a fully saturated line dominates
 *  everything else in the diagram. The trunk is the blend of the two, which is
 *  what "both answers, before they part" should look like. */
export const EDGE_NO = "#8aa9cf";
export const EDGE_YES = "#e68f9c";
export const EDGE_BOTH = "#b89cb6";

/** A single-hue lightness ramp for a normalised magnitude in [0, 1]: light for
 *  a small value, dark for a large one. Used by the boosting page's dot strips,
 *  where the quantity is a weight and only its magnitude is being compared. */
export function magnitudeRamp(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  // Mix the accent-ish purple down toward white; the darkest end stays short of
  // black so the dots keep their hue rather than going flat.
  const lo = [244, 242, 253];
  const hi = [69, 63, 124];
  const ch = lo.map((c, i) => Math.round(c + (hi[i]! - c) * u));
  return `rgb(${ch[0]} ${ch[1]} ${ch[2]})`;
}
