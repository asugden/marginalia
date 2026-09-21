// The softmax function, written out in the three steps the page visualizes.
//
// Deliberately not a one-liner. Every intermediate the visualization needs —
// the shifted logits, the exponentials, their sum — is returned, because the
// whole point of the page is that softmax is not a black box but three small
// arithmetic moves in sequence.

export interface SoftmaxSteps {
  /** What went in. */
  logits: number[];
  /** Logits after dividing by temperature. Identical to `logits` when T = 1. */
  scaled: number[];
  /** The largest scaled logit — subtracted before exponentiating. */
  max: number;
  /** scaled[i] - max. All <= 0, so exp() can never overflow. */
  shifted: number[];
  /** exp(shifted[i]). All in (0, 1], and the largest is exactly 1. */
  exps: number[];
  /** Sum of exps — the normalizing constant. */
  sum: number;
  /** exps[i] / sum. Non-negative, sums to 1. */
  probs: number[];
}

/** Softmax with temperature, keeping every intermediate.
 *
 *  The max-subtraction is not a mathematical requirement — softmax is
 *  invariant to adding a constant to every logit — but it is a numerical one.
 *  exp(1000) is Infinity in floating point, and Infinity/Infinity is NaN, so
 *  every real implementation subtracts the max first. The page shows this
 *  step rather than hiding it, because "the maths says X but the machine
 *  needs Y" is itself worth teaching. */
export function softmax(logits: number[], temperature = 1): SoftmaxSteps {
  // Guard the degenerate case: T = 0 is the limit where softmax becomes argmax
  // (all probability on the winner). Callers clamp above this, but the maths
  // has to be defined for the slider's bottom end.
  const t = Math.max(temperature, 1e-6);
  const scaled = logits.map((z) => z / t);
  const max = scaled.length ? Math.max(...scaled) : 0;
  const shifted = scaled.map((z) => z - max);
  const exps = shifted.map((z) => Math.exp(z));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => (sum === 0 ? 0 : e / sum));
  return { logits, scaled, max, shifted, exps, sum, probs };
}
