// Splitting one day's counts into sets, the way a held-out test set is made
// when there is no "next day" to wait for. Seeded, so shuffle 3 is the same
// split for every viewer.

import { fitAll, maxSizeFor, rms, rng, type Fitted, type Kind, type Pt } from "./fit.js";

/** The day both split panels use. */
export const SPLIT_DAY = 11;

/** The indices 0..n−1 in a seeded random order. */
function shuffled(n: number, seed: number): number[] {
  const r = rng(seed * 2654435761 + 97);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Split points into sets of the given sizes (the last takes the rest),
 *  in a seeded random order. Each set comes back in time order. */
export function splitInto(pts: Pt[], sizes: number[], seed: number): Pt[][] {
  const order = shuffled(pts.length, seed);
  const sets: Pt[][] = [];
  let from = 0;
  sizes.forEach((size, k) => {
    const to = k === sizes.length - 1 ? pts.length : from + size;
    sets.push(order.slice(from, to).sort((a, b) => a - b).map((i) => pts[i]!));
    from = to;
  });
  return sets;
}

/** Every best fit on the training set, and each other set's miss at every
 *  size. */
export function fitAndScore(kind: Kind, train: Pt[], others: Pt[][]) {
  const fits: Fitted[] = fitAll(kind, train, maxSizeFor(kind, train.length));
  return {
    fits,
    train: fits.map((f) => rms(f, train)),
    others: others.map((set) => fits.map((f) => rms(f, set))),
  };
}

/** The size index with the lowest value. */
export function argmin(vals: number[]): number {
  let best = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i]! < vals[best]!) best = i;
  return best;
}

/** The three-way split, many times over: for each shuffle, choose the size
 *  on validation, then read that size's validation and test misses. */
export function tally(kind: Kind, pts: Pt[], sizes: number[], shuffles: number) {
  let testWorse = 0;
  let gap = 0;
  for (let s = 1; s <= shuffles; s++) {
    const [train, val, test] = splitInto(pts, sizes, s);
    const r = fitAndScore(kind, train!, [val!, test!]);
    const c = argmin(r.others[0]!);
    const v = r.others[0]![c]!;
    const t = r.others[1]![c]!;
    if (t > v) testWorse++;
    gap += t - v;
  }
  return { testWorse, meanGap: gap / shuffles, shuffles };
}

