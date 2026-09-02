// Datasets for the decision-tree examples.
//
// Each one exists to make exactly one thing visible, and they are ordered so
// that a lesson can walk from "a tree is nested questions" to "greedy growing
// is not optimal" without ever changing more than one variable at a time.
//
//   animalsTiny   4 rows, 3 binary features, one class each. A hand-drawn
//                 taxonomy. Every feature scores the *same* gain at the root,
//                 which is the point: with pure leaves the data does not prefer
//                 any ordering, so a tree drawn this way teaches shape without
//                 teaching choice.
//   animalsDiet   24 rows, 8 binary features, 3 classes. A question the tree
//                 cannot look up (diet from body plan), so leaves are impure,
//                 gains differ, and the winning feature genuinely changes from
//                 one branch to the other.
//   dogsComfort   16 rows. Comfort is thick-coat XNOR cold-outside, so both
//                 real features score exactly zero at the root while a weak
//                 decoy scores above zero. Greedy takes the decoy and never
//                 recovers; the exhaustive depth-2 tree is perfect.
//   dogsWeight    24 rows, numeric. Weight from ear length — thresholds,
//                 revisiting a feature, and the regression criterion.
//
// Binary features are first-class here, not a simplification: indicator
// matrices are how a great deal of real tabular data arrives. What binary
// features cannot show is the threshold search, which is why exactly one
// dataset is numeric.

import type { Dataset, Feature, Row } from "./cart.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function binary(key: string, name: string, ask: string, noise = false): Feature {
  return { key, name, kind: "binary", ask, noise };
}

function numeric(key: string, name: string, unit?: string): Feature {
  return { key, name, kind: "numeric", unit };
}

function rows(
  spec: Array<[label: string, values: number[], y: number]>,
): Row[] {
  return spec.map(([label, x, y]) => ({ id: label, label, x, y }));
}

// ── 1. The hand-drawn taxonomy ──────────────────────────────────────────────
//
// The classic four-leaf tree. Three binary features, four animals, one animal
// per leaf — so every leaf is pure no matter which feature you put first.
//
// That is precisely why it cannot teach how a tree is *built*: all three
// features tie at the root, and the tie is exact, not approximate. Any of the
// six orderings classifies all four animals perfectly. A lesson should show the
// tie rather than quietly pick a winner.

export const animalsTiny: Dataset = {
  key: "animals-tiny",
  title: "Four animals",
  blurb:
    "Three yes/no features, four animals, one animal per leaf. A tree drawn by hand.",
  features: [
    binary("feathers", "feathers", "Has feathers?"),
    binary("fins", "fins", "Has fins or flippers?"),
    binary("flies", "flight", "Can fly?"),
  ],
  classes: ["duck", "penguin", "dolphin", "bear"],
  rows: rows([
    //         feathers, fins, flies
    ["duck", [1, 0, 1], 0],
    ["penguin", [1, 1, 0], 1],
    ["dolphin", [0, 1, 0], 2],
    ["bear", [0, 0, 0], 3],
  ]),
};

// ── 2. A question the tree cannot look up ───────────────────────────────────
//
// Same flavour of features, but the label is diet rather than identity. Now
// several animals share a feature pattern and disagree on the answer, so leaves
// are impure, gains separate, and the best feature on the left branch is not
// the best feature on the right.
//
// "Is a genius" is planted noise. It is spread across the three diets in
// roughly the population proportions, so it scores near zero at every node —
// the algorithm rejects it without being told to, which is the honest version
// of "feature selection".

export const animalsDiet: Dataset = {
  key: "animals-diet",
  title: "What does it eat?",
  blurb:
    "Predict diet from body plan. No feature gives the answer away, so the tree has to earn every split.",
  features: [
    binary("feathers", "feathers", "Has feathers?"),
    binary("fins", "fins", "Has fins or flippers?"),
    binary("flies", "flight", "Can fly?"),
    binary("fur", "fur", "Has fur?"),
    binary("hooves", "hooves", "Has hooves?"),
    binary("eggs", "eggs", "Lays eggs?"),
    binary("water", "water", "Lives in water?"),
    binary("genius", "genius", "Is a genius?", true),
  ],
  classes: ["carnivore", "herbivore", "omnivore"],
  rows: rows([
    //             fth fin fly fur hoo egg wat gen
    ["duck", [1, 0, 1, 0, 0, 1, 1, 0], 2],
    ["penguin", [1, 1, 0, 0, 0, 1, 1, 0], 0],
    ["ostrich", [1, 0, 0, 0, 0, 1, 0, 0], 1],
    ["eagle", [1, 0, 1, 0, 0, 1, 0, 0], 0],
    ["parrot", [1, 0, 1, 0, 0, 1, 0, 1], 1],
    ["owl", [1, 0, 1, 0, 0, 1, 0, 1], 0],
    ["salmon", [0, 1, 0, 0, 0, 1, 1, 0], 0],
    ["shark", [0, 1, 0, 0, 0, 0, 1, 0], 0],
    ["tuna", [0, 1, 0, 0, 0, 1, 1, 0], 0],
    ["goldfish", [0, 1, 0, 0, 0, 1, 1, 0], 2],
    ["bear", [0, 0, 0, 1, 0, 0, 0, 0], 2],
    ["dolphin", [0, 1, 0, 0, 0, 0, 1, 1], 0],
    ["bat", [0, 0, 1, 1, 0, 0, 0, 0], 2],
    ["dog", [0, 0, 0, 1, 0, 0, 0, 1], 2],
    ["whale", [0, 1, 0, 0, 0, 0, 1, 1], 0],
    ["cow", [0, 0, 0, 1, 1, 0, 0, 0], 1],
    ["rabbit", [0, 0, 0, 1, 0, 0, 0, 0], 1],
    ["deer", [0, 0, 0, 1, 1, 0, 0, 0], 1],
    ["sheep", [0, 0, 0, 1, 1, 0, 0, 1], 1],
    ["pig", [0, 0, 0, 1, 1, 0, 0, 1], 2],
    ["snake", [0, 0, 0, 0, 0, 1, 0, 0], 0],
    ["turtle", [0, 0, 0, 0, 0, 1, 0, 0], 2],
    ["lizard", [0, 0, 0, 0, 0, 1, 0, 1], 0],
    ["frog", [0, 0, 0, 0, 0, 1, 1, 0], 0],
  ]),
};

// ── 2b. The same animals, plus one continuous column ────────────────────────
//
// Identical rows and labels to animalsDiet, with a single numeric feature
// added. Changing exactly one thing keeps the comparison honest: any new
// behaviour in the tree is down to the feature being continuous, and nothing
// else.
//
// Two things become possible that the all-binary version could not show. The
// search now has to pick a *threshold* as well as a feature — a second search,
// nested inside the first. And the feature is no longer used up when it is
// split on, so the tree can come back to it further down with a tighter cut.

const SPEEDS: Record<string, number> = {
  duck: 80, penguin: 10, ostrich: 70, eagle: 110, parrot: 40, owl: 60,
  salmon: 30, shark: 50, tuna: 75, goldfish: 8, bear: 50, dolphin: 60,
  bat: 40, dog: 45, whale: 30, cow: 40, rabbit: 55, deer: 75, sheep: 35,
  pig: 17, snake: 10, turtle: 2, lizard: 25, frog: 8,
};

export const animalsDietSpeed: Dataset = {
  ...animalsDiet,
  key: "animals-diet-speed",
  title: "What does it eat? (with speed)",
  blurb:
    "The same animals and the same question, with one continuous column added: how fast it moves.",
  features: [...animalsDiet.features, numeric("speed", "top speed", "km/h")],
  rows: animalsDiet.rows.map((r) => ({
    ...r,
    x: [...r.x, SPEEDS[r.label] ?? 0],
  })),
};

// ── 3. Where greedy growing goes wrong ──────────────────────────────────────
//
// A dog is comfortable when its coat matches the weather: thick coat on a cold
// day, thin coat on a warm one. Mismatched, it is not. That makes comfort the
// XNOR of two features — and XNOR is invisible to a one-split-at-a-time search.
// Split on coat alone and each side is exactly half comfortable; the same for
// cold. Both score zero.
//
// The sweater is the trap. It carries a little real signal (owners do reach for
// it), so it scores above zero and greedy takes it. From there neither real
// feature ever recovers a positive score, and the tree stops at 75%. The
// exhaustive depth-2 tree — coat first, then cold — is perfect.
//
// This is the honest limit of the algorithm, and it needs no continuous
// features to show.

export const dogsComfort: Dataset = {
  key: "dogs-comfort",
  title: "Is the dog comfortable?",
  blurb:
    "Comfort depends on the coat matching the weather — a pairing no single split can see.",
  features: [
    binary("coat", "thick coat", "Has a thick coat?"),
    binary("cold", "cold out", "Is it cold outside?"),
    binary("sweater", "sweater", "Wearing a sweater?"),
    binary("fed", "just ate", "Just ate?", true),
  ],
  classes: ["uncomfortable", "comfortable"],
  rows: rows([
    //                 coat cold swtr fed
    // thick coat, cold day -> comfortable
    ["Biscuit", [1, 1, 1, 1], 1],
    ["Maple", [1, 1, 1, 0], 1],
    ["Juniper", [1, 1, 1, 1], 1],
    ["Rye", [1, 1, 0, 0], 1],
    // thin coat, warm day -> comfortable
    ["Pepper", [0, 0, 1, 0], 1],
    ["Olive", [0, 0, 1, 1], 1],
    ["Cricket", [0, 0, 1, 1], 1],
    ["Sable", [0, 0, 0, 1], 1],
    // thick coat, warm day -> too hot
    ["Bramble", [1, 0, 1, 1], 0],
    ["Thistle", [1, 0, 0, 0], 0],
    ["Ember", [1, 0, 0, 1], 0],
    ["Cinder", [1, 0, 0, 0], 0],
    // thin coat, cold day -> too cold
    ["Willow", [0, 1, 1, 0], 0],
    ["Fern", [0, 1, 0, 0], 0],
    ["Moss", [0, 1, 0, 0], 0],
    ["Clover", [0, 1, 0, 1], 0],
  ]),
};

// ── 4. Numeric features: where to cut, and coming back ──────────────────────
//
// Weight from ear length. The first genuinely continuous dataset, and the one
// that earns two ideas a binary feature cannot show:
//
//   where to cut  — the split search is now over (feature, threshold) pairs,
//                   and gain plotted against threshold is a curve with a peak.
//   coming back   — a numeric feature is never used up. The tree splits ear
//                   length near the middle, then splits it *again* inside both
//                   halves at tighter thresholds. That is how a tree carves a
//                   continuous variable into intervals, and it is the direct
//                   contrast with a binary feature, which is exhausted the
//                   moment it is used.
//
// Also the regression dataset: the criterion becomes variance and a leaf
// predicts the mean of the dogs that land in it.

export const dogsWeight: Dataset = {
  key: "dogs-weight",
  title: "How heavy is the dog?",
  blurb:
    "Predict weight from ear length. Continuous in, continuous out — the setup that makes residuals visible.",
  features: [
    numeric("ear", "ear length", "cm"),
    numeric("height", "height", "cm"),
    numeric("fluff", "fluffiness", "/10"),
    binary("floppy", "floppy ears", "Are the ears floppy?"),
  ],
  target: { name: "weight", unit: "kg" },
  rows: rows([
    //                  ear  height fluff floppy   weight
    ["Pip", [3.1, 23, 4, 0], 3.4],
    ["Bean", [3.4, 22, 6, 0], 4.1],
    ["Sprout", [3.9, 29, 3, 0], 4.8],
    ["Nutmeg", [4.2, 27, 7, 1], 5.6],
    ["Clover", [4.6, 34, 5, 1], 7.2],
    ["Pepper", [4.8, 30, 2, 0], 8.0],
    ["Olive", [5.2, 39, 6, 1], 10.5],
    ["Cricket", [5.6, 35, 4, 1], 11.8],
    ["Sable", [6.0, 44, 8, 1], 13.9],
    ["Juniper", [6.3, 40, 5, 0], 15.2],
    ["Maple", [6.7, 48, 7, 1], 16.8],
    ["Rye", [7.1, 44, 3, 0], 18.1],
    ["Biscuit", [7.5, 53, 9, 1], 21.4],
    ["Willow", [7.9, 49, 6, 1], 22.7],
    ["Fern", [8.3, 57, 4, 0], 24.0],
    ["Moss", [8.8, 54, 7, 1], 26.9],
    ["Bramble", [9.2, 62, 5, 1], 28.3],
    ["Thistle", [9.6, 58, 8, 1], 30.6],
    ["Ember", [10.1, 67, 6, 1], 33.2],
    ["Cinder", [10.6, 63, 4, 0], 34.5],
    ["Birch", [11.2, 72, 9, 1], 38.1],
    ["Alder", [11.8, 68, 7, 1], 39.7],
    ["Hazel", [12.4, 77, 5, 1], 42.4],
    ["Rowan", [13.1, 74, 8, 1], 45.0],
  ]),
};

export const TREE_DATASETS: Dataset[] = [
  animalsTiny,
  animalsDiet,
  animalsDietSpeed,
  dogsComfort,
  dogsWeight,
];

/** A larger, noisier dog sample, generated from a seed.
 *
 *  The hand-written table above is the right size to read as a table, but a
 *  boosted ensemble needs more points than that: the residual plot only tells a
 *  story if there is scatter to shrink, and a train/test split only means
 *  something if there is noise to overfit. Weight grows roughly with the square
 *  of ear length, plus proportional noise. */
export function makeDogScatter(n: number, seed: number): Dataset {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const NAMES = [
    "Pip", "Bean", "Sprout", "Nutmeg", "Clover", "Pepper", "Olive", "Cricket",
    "Sable", "Juniper", "Maple", "Rye", "Biscuit", "Willow", "Fern", "Moss",
    "Bramble", "Thistle", "Ember", "Cinder", "Birch", "Alder", "Hazel", "Rowan",
    "Poppy", "Wren", "Finch", "Tansy", "Sorrel", "Yarrow",
  ];
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const ear = 3 + (11 / (n - 1)) * i + (rnd() - 0.5) * 0.3;
    const base = 0.32 * ear * ear;
    const weight = Math.max(1.5, base * (1 + (rnd() - 0.5) * 0.36));
    rows.push({
      id: `dog-${i}`,
      label: `${NAMES[i % NAMES.length]!}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""}`,
      x: [Math.round(ear * 10) / 10],
      y: Math.round(weight * 10) / 10,
    });
  }
  return {
    key: `dogs-scatter-${seed}`,
    title: "How heavy is the dog?",
    blurb: "Weight from ear length, with the scatter you would actually see.",
    features: [numeric("ear", "ear length", "cm")],
    target: { name: "weight", unit: "kg" },
    rows,
  };
}

/** A shelter-full of dogs, for the ensemble pages.
 *
 *  The hand-written animal table is the right size to *read*, and far too small
 *  to build a forest on: with 24 rows, a third of them held out of every
 *  bootstrap, the out-of-bag estimate is computed over a handful of rows and
 *  jumps around so violently that it teaches the opposite of the truth. A
 *  forest needs enough data for the vote to mean something.
 *
 *  Three size classes with genuinely overlapping measurements, so the ceiling
 *  sits somewhere short of perfect and there is real work for the ensemble to
 *  do. Two of the features are deliberate junk. */
export function makeDogSizes(n: number, seed: number): Dataset {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Three uniforms make a passable normal. The sum of three has standard
  // deviation 0.5, so doubling makes `sd` mean what it says.
  const jitter = (sd: number) => (rnd() + rnd() + rnd() - 1.5) * 2 * sd;

  // toy / medium / large: means for ear length and height, with spreads wide
  // enough that neighbouring classes genuinely overlap.
  const PROFILE = [
    { ear: 4.8, height: 36, bark: 6.4 },
    { ear: 6.8, height: 47, bark: 5.2 },
    { ear: 9.2, height: 58, bark: 4.2 },
  ];
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const cls = Math.floor(rnd() * 3);
    const p = PROFILE[cls]!;
    rows.push({
      id: `sd-${i}`,
      label: `#${i + 1}`,
      x: [
        Math.round((p.ear + jitter(1.5)) * 10) / 10,
        Math.round(p.height + jitter(9)),
        Math.round((p.bark + jitter(2.5)) * 10) / 10,
        Math.round(rnd() * 10 * 10) / 10, // fluffiness: no signal at all
        rnd() < 0.5 ? 1 : 0, // likes water: no signal at all
      ],
      y: cls,
    });
  }
  return {
    key: `dog-sizes-${seed}`,
    title: "What size is the dog?",
    blurb:
      "Toy, medium or large, from measurements that overlap. Two of the five columns are pure noise.",
    features: [
      numeric("ear", "ear length", "cm"),
      numeric("height", "height", "cm"),
      numeric("bark", "barks/hour"),
      { ...numeric("fluff", "fluffiness", "/10"), noise: true },
      binary("water", "likes water", "Likes water?", true),
    ],
    classes: ["toy", "medium", "large"],
    rows,
  };
}
