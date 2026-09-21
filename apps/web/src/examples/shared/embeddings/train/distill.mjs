// Offline distiller for the word-embedding examples.
//
// Turns a large published embedding table (300 dimensions, a million words)
// into something a teaching page can honestly ship: a few thousand common
// words at 32 dimensions, quantized to one byte per number. The result is
// ~100 KB instead of ~4 GB, and it is still a *real* table — the vectors came
// from a model trained on billions of words of text, and cosine similarity
// between them still means what it is supposed to mean.
//
// Pure Node (>=18) — no numpy, no torch, no npm deps. `fetch` and
// `DecompressionStream` are built in, so this downloads and unpacks the source
// vectors itself.
//
// WHAT IS AND IS NOT HONEST HERE
//
// The 32 dimensions are a *projection* of a 300-dimensional model, not a model
// natively trained at 32 dimensions. The teaching pages say so out loud. We do
// it this way because a 32-d model trained from scratch on a corpus small
// enough to be practical produces mushy neighbours, and students would be
// learning from an artifact of our budget rather than from how embeddings
// actually behave. Projecting a real model keeps the semantics and shrinks the
// file; it costs some accuracy, which `--report` measures and prints so the
// number is never a guess.
//
// The projection is PCA (retain the highest-variance directions) with one
// refinement: the top principal component of a word-embedding table is
// dominated by word *frequency* rather than meaning — a well-documented
// property of these tables — so we optionally drop the first few components.
// Vectors are re-normalized to unit length after projection, because every
// downstream use here is cosine similarity.
//
// Run:
//   node distill.mjs                  # word2vec-style table (GloVe source)
//   node distill.mjs --source fasttext  # subword-trained source
//   node distill.mjs --report         # print neighbour-quality diagnostics
//
// Deterministic: no randomness anywhere in the pipeline, so a re-run byte-for-
// byte reproduces its output.

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".vectors-cache");

// ── Sources ───────────────────────────────────────────────────────────────
// Two published tables. GloVe is the word2vec-style source (one vector per
// word, no subword information). The fastText table was trained *with*
// character n-grams, which is the distinction the fastText example teaches.
const SOURCES = {
  glove: {
    url: "https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip",
    archive: "glove.6B.zip",
    member: "glove.6B.300d.txt",
    // GloVe files have no header line; every line is "word v1 v2 ... v300".
    hasHeader: false,
    srcDim: 300,
    credit: {
      name: "GloVe 6B (300d)",
      by: "Stanford NLP",
      trainedOn: "6 billion tokens of Wikipedia + Gigaword",
      license: "PDDL v1.0",
      url: "https://nlp.stanford.edu/projects/glove/",
    },
  },
  fasttext: {
    url: "https://dl.fbaipublicfiles.com/fasttext/vectors-english/wiki-news-300d-1M-subword.vec.zip",
    archive: "wiki-news-300d-1M-subword.vec.zip",
    member: "wiki-news-300d-1M-subword.vec",
    // fastText .vec files open with "<count> <dim>".
    hasHeader: true,
    srcDim: 300,
    credit: {
      name: "fastText wiki-news 300d (subword)",
      by: "Facebook AI Research",
      trainedOn: "16 billion tokens of Wikipedia + news, with character n-grams",
      license: "CC BY-SA 3.0",
      url: "https://fasttext.cc/docs/en/english-vectors.html",
    },
  },
};

// ── Config ────────────────────────────────────────────────────────────────
// Tunable for experiments via env vars; the committed defaults are what the
// shipped tables were built with. `envInt` treats an empty or unparseable
// value as absent, so `OUT_DIM= node distill.mjs` uses the default rather than
// silently becoming NaN.
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

const OUT_DIM = envInt("OUT_DIM", 32);
const DROP_COMPONENTS = envInt("DROP_COMPONENTS", 2);
const VOCAB = envInt("VOCAB", 2048); // most-frequent words, after filtering
const POWER_ITERS = 120; // per component; plenty for convergence at this size

// Words we refuse to ship regardless of frequency: punctuation-only tokens,
// fragments, and anything non-alphabetic. Source files are frequency-ordered,
// so taking the first VOCAB survivors takes the most common words.
function isTeachableWord(w) {
  if (w.length < 2 || w.length > 14) return false;
  if (!/^[a-z]+$/.test(w)) return false;
  return true;
}

// A small hand-picked set that must survive the frequency cut, because the
// lessons reference these words directly. Added only if present in the source.
const MUST_KEEP = [
  // similarity / neighbourhood demos
  "king", "queen", "man", "woman", "prince", "princess", "boy", "girl",
  "cat", "dog", "puppy", "kitten", "horse", "cow", "bird", "fish",
  "paris", "france", "london", "england", "rome", "italy", "tokyo", "japan",
  "berlin", "germany", "madrid", "spain", "moscow", "russia",
  "walk", "walked", "run", "ran", "swim", "swam", "eat", "ate",
  "big", "bigger", "biggest", "small", "smaller", "smallest",
  "good", "better", "best", "bad", "worse", "worst",
  "hot", "cold", "warm", "cool", "happy", "sad", "angry",
  // the polysemy demo — one vector, two senses
  "bank", "river", "money", "loan", "shore", "credit", "deposit", "stream",
  "bat", "ball", "cave", "bass", "guitar", "trout",
  // everyday anchors
  "coffee", "tea", "bread", "cheese", "apple", "orange", "banana",
  "doctor", "nurse", "teacher", "student", "school", "hospital",
  "car", "truck", "bicycle", "train", "plane", "boat",
  "monday", "tuesday", "winter", "summer", "spring", "autumn",
  "red", "blue", "green", "yellow", "black", "white",
  // Words the teaching pages name directly, which sit below the frequency cut.
  "trolley", "tram", "tunnel", "subway", "pierogi", "soggy", "greasy",
  "rusted", "stubborn", "crowded", "narrow", "incline", "hillside",
  "cafe", "bakery", "kitten", "puppy", "wooden", "rattled",
];

// ── Fetch + unpack ────────────────────────────────────────────────────────

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function download(url, dest) {
  if (await exists(dest)) {
    const { size } = await stat(dest);
    console.log(`  cached: ${dest} (${(size / 1e6).toFixed(0)} MB)`);
    return;
  }
  console.log(`  downloading ${url}`);
  console.log("  (this is large and one-time; it is cached and gitignored)");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get("content-length") || 0);
  let seen = 0;
  let lastPct = -1;
  const src = Readable.fromWeb(res.body);
  src.on("data", (c) => {
    seen += c.length;
    if (!total) return;
    const pct = Math.floor((seen / total) * 100);
    if (pct !== lastPct && pct % 5 === 0) {
      lastPct = pct;
      process.stdout.write(`\r  ${pct}%  (${(seen / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)} MB)`);
    }
  });
  await pipeline(src, createWriteStream(dest));
  process.stdout.write("\n");
}

// Extract one member from a zip. Node has DecompressionStream for gzip but not
// a zip reader; rather than vendor one, shell out to `unzip`, which ships with
// macOS and every Linux distro this would plausibly run on.
async function unzipMember(archive, member, destDir) {
  const out = join(destDir, member);
  if (await exists(out)) {
    console.log(`  cached: ${out}`);
    return out;
  }
  console.log(`  extracting ${member}`);
  await new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-o", "-j", archive, member, "-d", destDir], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`unzip exited ${code}`)),
    );
  });
  if (!(await exists(out))) throw new Error(`expected ${out} after unzip`);
  return out;
}

// ── Read the source table ─────────────────────────────────────────────────
//
// These files are hundreds of megabytes of text. We read them as a stream and
// stop as soon as we have enough words, rather than parsing a million lines we
// will throw away.
// These files are larger than Node's maximum string length, so they are read
// as a stream of lines rather than loaded whole.
async function readVectors(path, cfg) {
  const words = [];
  const vecs = [];
  const wanted = new Set(MUST_KEEP);
  const keptMust = new Set();
  const haveWord = new Set();
  let lineNo = 0;

  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNo++;
    if (lineNo === 1 && cfg.hasHeader) continue;
    if (!line) continue;

    const sp = line.indexOf(" ");
    if (sp <= 0) continue;
    const word = line.slice(0, sp);

    const must = wanted.has(word) && !keptMust.has(word);
    // Frequency-ordered file: once we have our vocabulary, the only reason to
    // keep reading is to pick up must-keep words that are rarer than the cut.
    if (!must) {
      if (words.length >= VOCAB) {
        if (keptMust.size === wanted.size) break;
        continue;
      }
      if (!isTeachableWord(word)) continue;
    } else {
      keptMust.add(word);
      if (!isTeachableWord(word)) continue;
      // A must-keep word frequent enough to already be in the vocabulary
      // must not be added a second time.
      if (haveWord.has(word)) continue;
    }

    const v = new Float64Array(cfg.srcDim);
    let i = 0;
    let p = sp + 1;
    while (i < cfg.srcDim && p < line.length) {
      let q = line.indexOf(" ", p);
      if (q === -1) q = line.length;
      v[i++] = +line.slice(p, q);
      p = q + 1;
    }
    if (i !== cfg.srcDim) continue;
    words.push(word);
    haveWord.add(word);
    vecs.push(v);
  }
  rl.close();
  return { words, vecs };
}

// ── PCA by power iteration ────────────────────────────────────────────────
//
// We need the top (DROP_COMPONENTS + OUT_DIM) eigenvectors of the covariance
// of a few thousand 300-d vectors. That is small enough that the simplest
// correct method wins: find the leading direction by repeatedly multiplying a
// vector by the covariance, subtract it off (deflation), repeat.
//
// Multiplying by the covariance never forms the 300x300 matrix — for centred
// data X, cov @ v is just X^T (X v) / n, two passes over the data.

function meanVector(vecs, dim) {
  const m = new Float64Array(dim);
  for (const v of vecs) for (let i = 0; i < dim; i++) m[i] += v[i];
  for (let i = 0; i < dim; i++) m[i] /= vecs.length;
  return m;
}

function covMul(vecs, v, dim) {
  // out = (1/n) * sum_k  x_k * (x_k . v)
  const out = new Float64Array(dim);
  for (const x of vecs) {
    let d = 0;
    for (let i = 0; i < dim; i++) d += x[i] * v[i];
    if (d === 0) continue;
    for (let i = 0; i < dim; i++) out[i] += x[i] * d;
  }
  for (let i = 0; i < dim; i++) out[i] /= vecs.length;
  return out;
}

function normalizeInPlace(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return n;
}

// Deterministic seed direction for component k — no RNG, so runs reproduce.
function seedVector(dim, k) {
  const v = new Float64Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.sin((i + 1) * (k + 1) * 0.7331) + 0.1;
  normalizeInPlace(v);
  return v;
}

function topComponents(vecs, dim, count) {
  // Work on a centred copy; deflation mutates it.
  const mean = meanVector(vecs, dim);
  const X = vecs.map((v) => {
    const c = new Float64Array(dim);
    for (let i = 0; i < dim; i++) c[i] = v[i] - mean[i];
    return c;
  });

  const comps = [];
  const variances = [];
  for (let k = 0; k < count; k++) {
    let v = seedVector(dim, k);
    let eig = 0;
    for (let it = 0; it < POWER_ITERS; it++) {
      const w = covMul(X, v, dim);
      eig = normalizeInPlace(w);
      if (eig === 0) break;
      v = w;
    }
    comps.push(v);
    variances.push(eig);
    // Deflate: remove this direction from the data so the next iteration finds
    // the next-largest orthogonal one.
    for (const x of X) {
      let d = 0;
      for (let i = 0; i < dim; i++) d += x[i] * v[i];
      for (let i = 0; i < dim; i++) x[i] -= d * v[i];
    }
    process.stdout.write(`\r  component ${k + 1}/${count}`);
  }
  process.stdout.write("\n");
  return { comps, variances, mean };
}

// ── Quantization ──────────────────────────────────────────────────────────
//
// After projection every vector is unit length, so each of the 16 numbers sits
// in [-1, 1]. One signed byte per number at a fixed scale keeps the file small
// and the decode trivial (the browser divides by 127). The error this adds is
// measured by --report, not assumed.
function quantize(vec) {
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round(vec[i] * 127)));
  }
  return out;
}

function dequantize(q) {
  const v = new Float64Array(q.length);
  for (let i = 0; i < q.length; i++) v[i] = q[i] / 127;
  return v;
}

// ── Diagnostics ───────────────────────────────────────────────────────────
//
// The honest question about this whole pipeline is "how much did we break?".
// We answer it by comparing neighbour lists before and after: for a sample of
// words, what fraction of the source table's top-10 neighbours are still in
// the shipped table's top-10? Printed by --report so the number in the
// README is measured, never estimated.

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function neighbours(vecs, words, idx, k) {
  const q = vecs[idx];
  const scored = [];
  for (let i = 0; i < vecs.length; i++) {
    if (i === idx) continue;
    scored.push([cosine(q, vecs[i]), words[i]]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, k);
}

function report(words, srcVecs, outVecs) {
  console.log("\n── neighbour-quality report ──────────────────────────────");
  const K = 10;
  const sampleSize = Math.min(300, words.length);
  const stride = Math.floor(words.length / sampleSize) || 1;
  let overlapTotal = 0;
  let n = 0;
  for (let i = 0; i < words.length; i += stride) {
    const a = new Set(neighbours(srcVecs, words, i, K).map((x) => x[1]));
    const b = neighbours(outVecs, words, i, K).map((x) => x[1]);
    let hit = 0;
    for (const w of b) if (a.has(w)) hit++;
    overlapTotal += hit / K;
    n++;
  }
  console.log(
    `  top-${K} neighbour overlap vs 300d source: ${((overlapTotal / n) * 100).toFixed(1)}%  (${n} words sampled)`,
  );

  const show = ["king", "cat", "paris", "bank", "coffee", "running", "blue"];
  for (const w of show) {
    const i = words.indexOf(w);
    if (i < 0) continue;
    const src = neighbours(srcVecs, words, i, 5).map((x) => x[1]).join(", ");
    const out = neighbours(outVecs, words, i, 5)
      .map((x) => `${x[1]} ${x[0].toFixed(2)}`)
      .join(", ");
    console.log(`\n  ${w}`);
    console.log(`    300d: ${src}`);
    console.log(`     16d: ${out}`);
  }
  console.log("");
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const sourceKey = (() => {
    const i = argv.indexOf("--source");
    return i >= 0 ? argv[i + 1] : "glove";
  })();
  const wantReport = argv.includes("--report");
  const cfg = SOURCES[sourceKey];
  if (!cfg) throw new Error(`unknown source "${sourceKey}" (glove | fasttext)`);

  console.log(`\ndistilling: ${cfg.credit.name}`);
  await mkdir(CACHE, { recursive: true });

  const archivePath = join(CACHE, cfg.archive);
  await download(cfg.url, archivePath);
  const txtPath = await unzipMember(archivePath, cfg.member, CACHE);

  console.log("  reading vectors");
  const { words, vecs } = await readVectors(txtPath, cfg);
  console.log(`  kept ${words.length} words at ${cfg.srcDim}d`);

  console.log(`  finding top ${DROP_COMPONENTS + OUT_DIM} principal components`);
  const { comps, variances, mean } = topComponents(
    vecs,
    cfg.srcDim,
    DROP_COMPONENTS + OUT_DIM,
  );
  const totalVar = variances.reduce((a, b) => a + b, 0);
  console.log(
    `  leading component holds ${((variances[0] / totalVar) * 100).toFixed(0)}% of the variance we kept` +
      (DROP_COMPONENTS ? " — dropped (it tracks word frequency, not meaning)" : ""),
  );

  // Project: centre, dot with each kept component, re-normalize to unit length.
  const kept = comps.slice(DROP_COMPONENTS);
  const projected = vecs.map((v) => {
    const c = new Float64Array(cfg.srcDim);
    for (let i = 0; i < cfg.srcDim; i++) c[i] = v[i] - mean[i];
    const p = new Float64Array(OUT_DIM);
    for (let k = 0; k < OUT_DIM; k++) {
      let d = 0;
      const comp = kept[k];
      for (let i = 0; i < cfg.srcDim; i++) d += c[i] * comp[i];
      p[k] = d;
    }
    normalizeInPlace(p);
    return p;
  });

  const quantized = projected.map(quantize);
  // Report against what the browser will actually hold (post-quantization), so
  // the measured number includes every loss in the pipeline.
  const roundTripped = quantized.map(dequantize);
  if (wantReport) report(words, vecs, roundTripped);

  const outName = sourceKey === "fasttext" ? "fasttext-32d.json" : "word2vec-32d.json";
  const OUT = join(HERE, "..", outName);
  const payload = {
    meta: {
      dim: OUT_DIM,
      count: words.length,
      quantization: "int8, divide by 127",
      source: cfg.credit,
      distillation: `PCA ${cfg.srcDim}d -> ${OUT_DIM}d (top ${DROP_COMPONENTS} component${DROP_COMPONENTS === 1 ? "" : "s"} dropped), unit-normalized, int8-quantized`,
    },
    words,
    // Flat array, row-major: word i occupies [i*dim, (i+1)*dim).
    vectors: quantized.flat(),
  };
  await writeFile(OUT, JSON.stringify(payload));
  const { size } = await stat(OUT);
  console.log(`  wrote ${OUT} (${(size / 1024).toFixed(0)} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
