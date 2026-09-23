// Builds ../facts.json: the words the transformer page's fact layer knows
// about that appear in none of its sentences.
//
// The page's feed-forward panel shows the finding that a transformer's MLP
// layers hold facts: "Michael Jordan" goes in, and the MLP adds "basketball",
// a word nowhere in the input. For that to be visible, each fact must point
// at a word OUTSIDE the four sentences (pierogi -> polish), and those words
// need a place in the page's 16-dimensional embedding space.
//
// They get it by the same projection the sentence words got: the PCA fitted
// on the 27 vocabulary words (identical code to build-heads.mjs, and CHECKED
// against heads.json — the script refuses to write if the vocabulary does not
// come out the same). The outside words are only projected through it, never
// fitted, so heads.json and every attention number are untouched.
//
// A 16-d space fitted on 27 words keeps only part of an outside word, so the
// facts below were chosen as ones whose target still lands near the right
// neighbours (polish near poland and pierogi; soccer near stadium). The page
// therefore reads a fact out as "how much like polish", never as a list of
// nearest words, which the lossy projection would fill with noise.
//
// Pure Node (>=18), no deps. Needs the GloVe file the shared distiller caches:
//   node apps/web/src/examples/shared/embeddings/train/distill.mjs
//   node apps/web/src/examples/transformers/train/build-facts.mjs
//   cp apps/web/src/examples/transformers/facts.json \
//      apps/web/public/examples/transformers/facts.json

import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const GLOVE = join(HERE, "..", "..", "shared", "embeddings", "train", ".vectors-cache", "glove.6B.300d.txt");
const HEADS = join(HERE, "..", "heads.json");
const OUT = join(HERE, "..", "facts.json");
const E_DIM = 16;

/** Each fact: a word in the sentences, and what the model "knows" about it
 *  that no sentence says. */
const FACTS = [
  { from: "pierogi", to: "polish" },
  { from: "stadium", to: "soccer" },
  { from: "rusted", to: "iron" },
  { from: "trolley", to: "railway" },
  { from: "tunnel", to: "subway" },
  { from: "icy", to: "snow" },
  { from: "hillside", to: "mountain" },
  { from: "river", to: "fish" },
  { from: "bridge", to: "steel" },
];

// ── Load the words we need from GloVe ─────────────────────────────────────
async function loadWords(words) {
  const want = new Set(words);
  const found = new Map();
  const rl = createInterface({
    input: createReadStream(GLOVE, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const sp = line.indexOf(" ");
    if (sp <= 0) continue;
    const w = line.slice(0, sp);
    if (!want.has(w) || found.has(w)) continue;
    const v = new Float64Array(300);
    let i = 0;
    let p = sp + 1;
    while (i < 300 && p < line.length) {
      let q = line.indexOf(" ", p);
      if (q === -1) q = line.length;
      v[i++] = +line.slice(p, q);
      p = q + 1;
    }
    found.set(w, v);
    if (found.size === want.size) break;
  }
  rl.close();
  const missing = [...want].filter((w) => !found.has(w));
  if (missing.length) throw new Error(`not in GloVe: ${missing.join(", ")}`);
  return found;
}

// ── PCA down to E_DIM (identical to the attention trainer) ────────────────
function reduceTo(vectors, srcDim, outDim, dropFirst = 1) {
  const n = vectors.length;
  const mean = new Float64Array(srcDim);
  for (const v of vectors) for (let i = 0; i < srcDim; i++) mean[i] += v[i];
  for (let i = 0; i < srcDim; i++) mean[i] /= n;
  const X = vectors.map((v) => {
    const c = new Float64Array(srcDim);
    for (let i = 0; i < srcDim; i++) c[i] = v[i] - mean[i];
    return c;
  });
  const norm = (x) => {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    s = Math.sqrt(s);
    if (s > 0) for (let i = 0; i < x.length; i++) x[i] /= s;
    return s;
  };
  const comps = [];
  for (let k = 0; k < outDim + dropFirst; k++) {
    let v = new Float64Array(srcDim);
    for (let i = 0; i < srcDim; i++) v[i] = Math.sin((i + 1) * (k + 1) * 0.7331) + 0.1;
    norm(v);
    for (let it = 0; it < 150; it++) {
      const w = new Float64Array(srcDim);
      for (const x of X) {
        let d = 0;
        for (let i = 0; i < srcDim; i++) d += x[i] * v[i];
        if (d === 0) continue;
        for (let i = 0; i < srcDim; i++) w[i] += x[i] * d;
      }
      if (norm(w) === 0) break;
      v = w;
    }
    comps.push(v);
    for (const x of X) {
      let d = 0;
      for (let i = 0; i < srcDim; i++) d += x[i] * v[i];
      for (let i = 0; i < srcDim; i++) x[i] -= d * v[i];
    }
  }
  const kept = comps.slice(dropFirst);
  // Also hand back the fitted projection, so words OUTSIDE the vocabulary can
  // be put through exactly the same one without changing a single vocabulary
  // vector.
  reduceTo.fitted = { mean, kept };
  return vectors.map((v) => {
    const out = new Float64Array(outDim);
    for (let k = 0; k < outDim; k++) {
      let d = 0;
      for (let i = 0; i < srcDim; i++) d += (v[i] - mean[i]) * kept[k][i];
      out[k] = d;
    }
    norm(out);
    return out;
  });
}


async function main() {
  const heads = JSON.parse(await readFile(HEADS, "utf8"));
  const vocab = heads.vocab;
  const targets = [...new Set(FACTS.map((f) => f.to))];
  for (const f of FACTS) {
    if (!vocab.includes(f.from)) throw new Error(`${f.from} is not in the sentences`);
    if (vocab.includes(f.to)) throw new Error(`${f.to} is IN the sentences; a fact must point outside them`);
  }
  const all = await loadWords([...vocab, ...targets]);
  const emb = reduceTo(vocab.map((w) => all.get(w)), 300, E_DIM);
  let worst = 0;
  emb.forEach((v, i) => {
    for (let d = 0; d < E_DIM; d++) worst = Math.max(worst, Math.abs(v[d] - heads.embeddings[i * E_DIM + d]));
  });
  if (worst > 1e-3) throw new Error(`vocabulary differs from heads.json by ${worst}`);
  console.log(`  vocabulary matches heads.json (largest difference ${worst.toExponential(1)})`);

  const { mean, kept } = reduceTo.fitted;
  const project = (v) => {
    const o = new Float64Array(E_DIM);
    for (let k = 0; k < E_DIM; k++) {
      let d = 0;
      for (let i = 0; i < 300; i++) d += (v[i] - mean[i]) * kept[k][i];
      o[k] = d;
    }
    const s = Math.hypot(...o) || 1;
    return Array.from(o, (x) => +(x / s).toFixed(5));
  };
  const embeddings = Object.fromEntries(targets.map((w) => [w, project(all.get(w))]));
  await writeFile(
    OUT,
    JSON.stringify({
      meta: {
        eDim: E_DIM,
        note: "Fact targets for the transformer page's feed-forward layer: words outside the page's sentences, projected into the same 16-d space by the PCA fitted on the sentence vocabulary. heads.json is not changed.",
        source: heads.meta.source,
      },
      facts: FACTS,
      embeddings,
    }),
  );
  console.log(`  wrote ${OUT}: ${FACTS.length} facts, ${targets.length} outside words`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
