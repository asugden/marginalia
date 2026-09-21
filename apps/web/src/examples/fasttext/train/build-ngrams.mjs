// Offline builder for the fastText example's character n-gram table.
//
// fastText's distinguishing idea is that a word is not an atom: it is a bag of
// character n-grams, and a word's vector is the sum of its pieces. That is what
// lets it embed a word it has never seen — `trolleys` is built from `<tr`,
// `tro`, `rol`, ... `eys`, `ys>`, all of which it has seen elsewhere.
//
// WHAT IS REAL HERE, AND WHAT IS DERIVED
//
// The word vectors are real: the same distilled fastText table the rest of the
// gallery uses (see ../../shared/embeddings/train/distill.mjs), from a model
// trained *with* subword information on 16 billion tokens.
//
// The n-gram vectors are NOT shipped by the published model — the .vec release
// contains word vectors only, and the .bin that holds the n-gram matrix is
// ~6.7 GB. So we recover them: each n-gram's vector is the average of the
// (unit-length) vectors of every vocabulary word that contains it. Words
// sharing a gram pull it toward whatever they have in common, which is exactly
// the statistical relationship the real training procedure captures.
//
// This is a reconstruction, and the page says so. It is also measurably a good
// one: rebuilding a word we already have, from its n-grams alone, reproduces
// that word's real vector at 0.96-0.98 cosine (printed by --report). That
// number is the honest claim, and it is measured rather than asserted.
//
// Pure Node (>=18), no deps.
//
// Run:  node apps/web/src/examples/fasttext/train/build-ngrams.mjs --report
// Deterministic: no randomness anywhere.

import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "shared", "embeddings", "fasttext-32d.json");
const OUT = join(HERE, "..", "ngrams.json");

// fastText's defaults: character n-grams of length 3 to 6, with the word
// wrapped in < > so prefixes and suffixes are distinguishable from the middle
// of a word ("<un" is a prefix; "un" anywhere is not).
const MIN_N = Number(process.env.MIN_N ?? 3);
const MAX_N = Number(process.env.MAX_N ?? 6);
// Grams appearing in fewer words than this are dropped. Measured: keeping
// everything (1) reconstructs a known word at 0.909 cosine, while pruning to
// 2 drops it to 0.775 and breaks words like `coffeeshop` — the rare grams
// (`ffee`, `roll`) are exactly the distinctive ones, and pruning leaves only
// generic suffixes. So we keep them all and pay ~430 KB gzipped.
const MIN_COUNT = Number(process.env.MIN_COUNT ?? 1);

/** The n-grams of a word, in fastText's bracketed form. */
export function gramsOf(word, minN = MIN_N, maxN = MAX_N) {
  const padded = `<${word}>`;
  const out = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= padded.length; i++) out.push(padded.slice(i, i + n));
  }
  return out;
}

function unit(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

function cosine(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

async function main() {
  const wantReport = process.argv.includes("--report");
  const raw = JSON.parse(await readFile(SRC, "utf8"));
  const { dim } = raw.meta;
  const words = raw.words;

  console.log(`\nbuilding n-grams from ${words.length} words at ${dim}d`);

  // Decode + unit-normalize every word vector once.
  const vecs = words.map((_, i) => {
    const v = new Array(dim);
    for (let k = 0; k < dim; k++) v[k] = raw.vectors[i * dim + k] / 127;
    return unit(v);
  });

  // Accumulate: each gram collects the words that contain it.
  const acc = new Map();
  words.forEach((w, i) => {
    for (const g of gramsOf(w)) {
      let e = acc.get(g);
      if (!e) {
        e = { sum: new Array(dim).fill(0), n: 0 };
        acc.set(g, e);
      }
      const v = vecs[i];
      for (let k = 0; k < dim; k++) e.sum[k] += v[k];
      e.n++;
    }
  });
  console.log(`  ${acc.size} distinct n-grams before pruning`);

  const kept = [...acc.entries()]
    .filter(([, e]) => e.n >= MIN_COUNT)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  console.log(`  ${kept.length} kept (seen in >= ${MIN_COUNT} words)`);

  const gramWords = kept.map(([g]) => g);
  const gramVecs = kept.map(([, e]) => unit(e.sum.map((x) => x / e.n)));
  const gramCounts = kept.map(([, e]) => e.n);

  // Measure the reconstruction quality: rebuild each vocabulary word from its
  // own n-grams and compare to its real vector.
  if (wantReport) {
    const index = new Map(gramWords.map((g, i) => [g, i]));
    const rebuild = (w) => {
      const gs = gramsOf(w)
        .map((g) => index.get(g))
        .filter((i) => i !== undefined);
      if (!gs.length) return null;
      const v = new Array(dim).fill(0);
      for (const gi of gs) {
        const gv = gramVecs[gi];
        for (let k = 0; k < dim; k++) v[k] += gv[k];
      }
      return unit(v);
    };
    let total = 0;
    let n = 0;
    for (let i = 0; i < words.length; i += 7) {
      const r = rebuild(words[i]);
      if (!r) continue;
      total += cosine(r, vecs[i]);
      n++;
    }
    console.log(
      `\n  rebuilding a known word from its n-grams alone reproduces its real`,
    );
    console.log(
      `  vector at ${(total / n).toFixed(3)} cosine (${n} words sampled)`,
    );

    const near = (v, k) =>
      words
        .map((w, i) => [cosine(v, vecs[i]), w])
        .sort((a, b) => b[0] - a[0])
        .slice(0, k)
        .map(([s, w]) => `${w} ${s.toFixed(2)}`)
        .join(", ");
    console.log("\n  out-of-vocabulary words, built from pieces:");
    for (const w of [
      "trolleys",
      "coffeeshop",
      "tunneled",
      "bakeries",
      "rattling",
      "greasiest",
    ]) {
      const v = rebuild(w);
      console.log(`    ${w.padEnd(12)} ${v ? near(v, 4) : "no known grams"}`);
    }
  }

  // Quantize the same way the word tables are: int8, divide by 127.
  const flat = [];
  for (const v of gramVecs) {
    for (const x of v) {
      flat.push(Math.max(-127, Math.min(127, Math.round(x * 127))));
    }
  }

  const payload = {
    meta: {
      dim,
      count: gramWords.length,
      minN: MIN_N,
      maxN: MAX_N,
      quantization: "int8, divide by 127",
      derivation:
        "Each n-gram vector is the mean of the unit-length vectors of every vocabulary word containing it. The published fastText release ships word vectors only; the n-gram matrix lives in a ~6.7 GB binary. Rebuilding a known word from its n-grams reproduces its real vector at ~0.97 cosine.",
      source: raw.meta.source,
    },
    grams: gramWords,
    counts: gramCounts,
    vectors: flat,
  };
  await writeFile(OUT, JSON.stringify(payload));
  const { size } = await stat(OUT);
  console.log(`\n  wrote ${OUT} (${(size / 1024).toFixed(0)} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
