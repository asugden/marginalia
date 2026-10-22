// The network panels 4–6 share: its parameters, its first example run
// forward and backward, and where each part is drawn.
//
// Drawn top to bottom like the gallery's other networks: inputs, hidden 1
// (neurons A–D), hidden 2 (E–H), the output y, and the error under it.
// Hidden neurons use ReLU; the output is plain, so it can reach a target of
// −1 as easily as 1.

import { DATA, SEED, SIZES, TARGETS } from "./content.js";
import { initParams, runNetwork, type Params } from "./scalar.js";

export const LETTERS = [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["y"]];
export const X0 = DATA[0]!;
export const T0 = TARGETS[0]!;

export const PARAMS: Params = initParams(SIZES, SEED);
export type Run = ReturnType<typeof runNetwork>;
export const run0 = (p: Params = PARAMS): Run => runNetwork(p, X0, T0);

export const NET_W = 640;
export const ROW_Y = [36, 140, 244, 348]; // inputs, hidden 1, hidden 2, output
export const ERR_Y = 440;
export const NET_H = 480;
export const NODE_W = 78;
export const NODE_H = 44;
export const TILE_W = 64;
export const TILE_H = 36;

/** Centres across the width for a row of n parts. */
function centres(n: number, spacing: number) {
  return Array.from({ length: n }, (_, i) => NET_W / 2 + 24 + (i - (n - 1) / 2) * spacing);
}
const XS = [centres(SIZES[0]!, 190), ...SIZES.slice(1).map((n) => centres(n, 150))];

/** The centre of part i in row r (0 = inputs, 1 = hidden 1, 2 = hidden 2,
 *  3 = output). */
export function pos(r: number, i: number) {
  return { x: XS[r]![i]!, y: ROW_Y[r]! };
}
export const ERR_X = XS[3]![0]!;

/** A neuron's name: layer l counts from hidden 1 = 0. */
export const nameOf = (l: number, j: number) => LETTERS[l]![j]!;
/** What feeds layer l's weights: the inputs, or the layer before. */
export const inName = (l: number, i: number) => (l === 0 ? `x${i + 1}` : nameOf(l - 1, i));

/** The strongest single path for the chain panel: a hidden-1 neuron and a
 *  hidden-2 neuron, both switched on for the first example, whose
 *  connecting weight moves the error most. */
export function strongestPath(r: Run): { j: number; k: number } {
  let best = { j: 0, k: 0, g: -1 };
  const y = r.layers[2]![0]!;
  r.layers[0]!.forEach((a, j) =>
    r.layers[1]!.forEach((e, k) => {
      if (a.n.val <= 0 || e.n.val <= 0) return;
      const g = Math.abs(a.o.val * y.w[k]!.val * r.y.grad);
      if (g > best.g) best = { j, k, g };
    }),
  );
  return { j: best.j, k: best.k };
}
