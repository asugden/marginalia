// Offline trainer for the CNN digit-recognition example.
//
// Pure Node (>=18) — no numpy, no torch, no npm deps. Downloads + gunzips MNIST
// itself, then trains a small convolutional network by hand (forward +
// backprop written out), and emits cnn-weights.json.
//
// Architecture (deliberately tiny so every part is showable in the browser):
//   input   20x20x1        the drawing grid
//   conv1   8 filters 3x3, valid, ReLU   -> 18x18x8
//   pool1   2x2 max, stride 2            ->  9x9x8
//   conv2   8 filters 3x3, valid, ReLU   ->  7x7x8
//   pool2   2x2 max, stride 2            ->  3x3x8   (flatten = 72)
//   dense   72 -> 24, ReLU
//   output  24 -> 11 (0-9 + blank), softmax
//
// The data half (download, downsample 28->20, MNIST-style normalize, jitter,
// blank class) is identical to the MLP trainer, so a stroke drawn anywhere at
// any size matches the training distribution. normalize20() here MUST stay
// equivalent to normalize() in ../cnn-net.ts.
//
// Run:  node apps/web/src/examples/mnist-cnn/train/train.mjs
// Deterministic: a fixed PRNG seed reproduces the same weights.

import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".mnist-cache");
const OUT = join(HERE, "..", "cnn-weights.json");

// ── Config ────────────────────────────────────────────────────────────────
const SRC = 28;   // MNIST native
const DIM = 20;   // our canvas
const K = 3;      // kernel size
const F1 = 8;     // conv1 filters
const F2 = 8;     // conv2 filters
const C1 = DIM - K + 1;        // 18
const P1 = Math.floor(C1 / 2); // 9
const C2 = P1 - K + 1;         // 7
const P2 = Math.floor(C2 / 2); // 3
const FLAT = P2 * P2 * F2;     // 72
const DENSE = 24;
const OUT_N = 11; // 0-9 + blank

const EPOCHS = 16;
const BATCH = 32;
const LR0 = 0.02;
const L2 = 1e-5;
const MOMENTUM = 0.9;
const BOX = 16;          // normalization target box
const AUGMENT = 1;       // extra jittered copy per digit
const BLANK_FRACTION = 0.08;
// Subsample the training set for speed (hand-written conv backprop in JS is
// slow; 20k images * (1+AUGMENT) is plenty for a teaching demo at ~98%).
const TRAIN_LIMIT = 20000;

const MIRRORS = [
  "https://storage.googleapis.com/cvdf-datasets/mnist",
  "https://ossci-datasets.s3.amazonaws.com/mnist",
];
const FILES = {
  trainImages: "train-images-idx3-ubyte.gz",
  trainLabels: "train-labels-idx1-ubyte.gz",
  testImages: "t10k-images-idx3-ubyte.gz",
  testLabels: "t10k-labels-idx1-ubyte.gz",
};

// ── Deterministic PRNG ──────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1234);
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Download + gunzip ────────────────────────────────────────────────────────
async function exists(p) { try { await stat(p); return true; } catch { return false; } }
async function ensureFile(name) {
  const gzPath = join(CACHE, name);
  const rawPath = gzPath.replace(/\.gz$/, "");
  if (await exists(rawPath)) return rawPath;
  await mkdir(CACHE, { recursive: true });
  let lastErr;
  for (const base of MIRRORS) {
    const urlStr = `${base}/${name}`;
    try {
      process.stdout.write(`  fetching ${urlStr} … `);
      const res = await fetch(urlStr);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ds = new DecompressionStream("gzip");
      await pipeline(Readable.fromWeb(res.body.pipeThrough(ds)), createWriteStream(rawPath));
      console.log("ok");
      return rawPath;
    } catch (err) { console.log(`failed (${err.message})`); lastErr = err; }
  }
  throw new Error(`Could not download ${name}: ${lastErr?.message}`);
}

// ── IDX parsing ──────────────────────────────────────────────────────────────
async function readImages(path) {
  const buf = await readFile(path);
  if (buf.readUInt32BE(0) !== 0x00000803) throw new Error(`bad image magic in ${path}`);
  const count = buf.readUInt32BE(4), rows = buf.readUInt32BE(8), cols = buf.readUInt32BE(12);
  if (rows !== SRC || cols !== SRC) throw new Error(`expected ${SRC}x${SRC}`);
  return { count, px: buf.subarray(16) };
}
async function readLabels(path) {
  const buf = await readFile(path);
  if (buf.readUInt32BE(0) !== 0x00000801) throw new Error(`bad label magic in ${path}`);
  return buf.subarray(8);
}

// ── Preprocess (identical to the MLP trainer) ────────────────────────────────
function downsample(px, offset) {
  const out = new Float32Array(DIM * DIM);
  const scale = SRC / DIM;
  for (let oy = 0; oy < DIM; oy++) for (let ox = 0; ox < DIM; ox++) {
    const x0 = ox * scale, x1 = (ox + 1) * scale, y0 = oy * scale, y1 = (oy + 1) * scale;
    let acc = 0, wsum = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const wy = Math.min(y1, y + 1) - Math.max(y0, y); if (wy <= 0) continue;
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const wx = Math.min(x1, x + 1) - Math.max(x0, x); if (wx <= 0) continue;
        const w = wx * wy; acc += w * px[offset + y * SRC + x]; wsum += w;
      }
    }
    out[oy * DIM + ox] = wsum > 0 ? acc / wsum / 255 : 0;
  }
  return out;
}
function normalize20(img) {
  const D = DIM, TH = 0.08;
  let minX = D, minY = D, maxX = -1, maxY = -1;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) if (img[y * D + x] > TH) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return img.slice();
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const scale = BOX / Math.max(bw, bh);
  const sw = Math.max(1, Math.round(bw * scale)), sh = Math.max(1, Math.round(bh * scale));
  const box = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const fx = minX + (i / sw) * bw, fy = minY + (j / sh) * bh;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(D - 1, x0 + 1), y1 = Math.min(D - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = img[y0 * D + x0], b = img[y0 * D + x1], c = img[y1 * D + x0], d = img[y1 * D + x1];
    box[j * sw + i] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
  let m = 0, mx = 0, my = 0;
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const v = box[j * sw + i]; m += v; mx += v * i; my += v * j; }
  const comX = m > 0 ? mx / m : sw / 2, comY = m > 0 ? my / m : sh / 2;
  const offX = Math.round(D / 2 - comX), offY = Math.round(D / 2 - comY);
  const out = new Float32Array(D * D);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const x = i + offX, y = j + offY;
    if (x >= 0 && x < D && y >= 0 && y < D) out[y * D + x] = box[j * sw + i];
  }
  return out;
}
function jitter(img) {
  const D = DIM, s = 0.85 + rand() * 0.3, dx = (rand() - 0.5) * 3, dy = (rand() - 0.5) * 3;
  const cx = D / 2, cy = D / 2, out = new Float32Array(D * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const fx = (x - cx - dx) / s + cx, fy = (y - cy - dy) / s + cy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 >= D - 1 || y0 >= D - 1) continue;
    const tx = fx - x0, ty = fy - y0;
    const a = img[y0 * D + x0], b = img[y0 * D + x0 + 1], c = img[(y0 + 1) * D + x0], d = img[(y0 + 1) * D + x0 + 1];
    out[y * D + x] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
  return out;
}
function makeBlank() {
  const x = new Float32Array(DIM * DIM), kind = rand();
  if (kind < 0.55) return x;
  if (kind < 0.85) { const n = 3 + Math.floor(rand() * 20); for (let k = 0; k < n; k++) x[Math.floor(rand() * DIM * DIM)] = 0.3 + rand() * 0.7; }
  else { let px = Math.floor(rand() * DIM), py = Math.floor(rand() * DIM); const len = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < len; k++) { if (px >= 0 && px < DIM && py >= 0 && py < DIM) x[py * DIM + px] = 0.6 + rand() * 0.4; px += Math.floor(rand() * 3) - 1; py += Math.floor(rand() * 3) - 1; } }
  return x;
}

// ── Model params ────────────────────────────────────────────────────────────
// conv1: [F1][K*K], conv2: [F2][F1][K*K]; dense W: [DENSE][FLAT]; out W: [OUT_N][DENSE].
function heInit(n, fanIn) { const a = new Float32Array(n), std = Math.sqrt(2 / fanIn); for (let i = 0; i < n; i++) a[i] = randn() * std; return a; }
const P = {
  k1: heInit(F1 * K * K, K * K),          b1: new Float32Array(F1),
  k2: heInit(F2 * F1 * K * K, F1 * K * K), b2: new Float32Array(F2),
  wd: heInit(DENSE * FLAT, FLAT),          bd: new Float32Array(DENSE),
  wo: (() => { const a = new Float32Array(OUT_N * DENSE); for (let i = 0; i < a.length; i++) a[i] = randn() * 0.01; return a; })(), bo: new Float32Array(OUT_N),
};

// ── Forward (with cache for backprop) ────────────────────────────────────────
function forward(x, c) {
  // conv1: c.z1[f][C1*C1], c.a1 = relu(z1)
  for (let f = 0; f < F1; f++) {
    const kbase = f * K * K;
    for (let oy = 0; oy < C1; oy++) for (let ox = 0; ox < C1; ox++) {
      let s = P.b1[f];
      for (let ky = 0; ky < K; ky++) for (let kx = 0; kx < K; kx++)
        s += P.k1[kbase + ky * K + kx] * x[(oy + ky) * DIM + (ox + kx)];
      const idx = f * C1 * C1 + oy * C1 + ox;
      c.z1[idx] = s; c.a1[idx] = s > 0 ? s : 0;
    }
  }
  // pool1: c.p1[f][P1*P1], c.arg1 = flat index into a1 of the max (for backprop)
  for (let f = 0; f < F1; f++) {
    for (let oy = 0; oy < P1; oy++) for (let ox = 0; ox < P1; ox++) {
      let best = -Infinity, bi = -1;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const iy = oy * 2 + dy, ix = ox * 2 + dx;
        const idx = f * C1 * C1 + iy * C1 + ix;
        if (c.a1[idx] > best) { best = c.a1[idx]; bi = idx; }
      }
      const pidx = f * P1 * P1 + oy * P1 + ox;
      c.p1[pidx] = best; c.arg1[pidx] = bi;
    }
  }
  // conv2 over the 8-channel pooled map
  for (let f = 0; f < F2; f++) {
    for (let oy = 0; oy < C2; oy++) for (let ox = 0; ox < C2; ox++) {
      let s = P.b2[f];
      for (let cch = 0; cch < F1; cch++) {
        const kbase = (f * F1 + cch) * K * K;
        for (let ky = 0; ky < K; ky++) for (let kx = 0; kx < K; kx++)
          s += P.k2[kbase + ky * K + kx] * c.p1[cch * P1 * P1 + (oy + ky) * P1 + (ox + kx)];
      }
      const idx = f * C2 * C2 + oy * C2 + ox;
      c.z2[idx] = s; c.a2[idx] = s > 0 ? s : 0;
    }
  }
  // pool2 -> flat
  for (let f = 0; f < F2; f++) {
    for (let oy = 0; oy < P2; oy++) for (let ox = 0; ox < P2; ox++) {
      let best = -Infinity, bi = -1;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const iy = oy * 2 + dy, ix = ox * 2 + dx;
        const idx = f * C2 * C2 + iy * C2 + ix;
        if (c.a2[idx] > best) { best = c.a2[idx]; bi = idx; }
      }
      const pidx = f * P2 * P2 + oy * P2 + ox;
      c.flat[pidx] = best; c.arg2[pidx] = bi;
    }
  }
  // dense
  for (let i = 0; i < DENSE; i++) {
    let s = P.bd[i]; const base = i * FLAT;
    for (let j = 0; j < FLAT; j++) s += P.wd[base + j] * c.flat[j];
    c.zd[i] = s; c.ad[i] = s > 0 ? s : 0;
  }
  // output + softmax
  let max = -Infinity;
  for (let i = 0; i < OUT_N; i++) { let s = P.bo[i]; const base = i * DENSE; for (let j = 0; j < DENSE; j++) s += P.wo[base + j] * c.ad[j]; c.out[i] = s; if (s > max) max = s; }
  let sum = 0;
  for (let i = 0; i < OUT_N; i++) { c.out[i] = Math.exp(c.out[i] - max); sum += c.out[i]; }
  for (let i = 0; i < OUT_N; i++) c.out[i] /= sum;
}

function newCache() {
  return {
    z1: new Float32Array(F1 * C1 * C1), a1: new Float32Array(F1 * C1 * C1),
    p1: new Float32Array(F1 * P1 * P1), arg1: new Int32Array(F1 * P1 * P1),
    z2: new Float32Array(F2 * C2 * C2), a2: new Float32Array(F2 * C2 * C2),
    flat: new Float32Array(FLAT), arg2: new Int32Array(FLAT),
    zd: new Float32Array(DENSE), ad: new Float32Array(DENSE), out: new Float32Array(OUT_N),
  };
}

// ── Gradients + velocities ───────────────────────────────────────────────────
const G = {
  k1: new Float32Array(P.k1.length), b1: new Float32Array(F1),
  k2: new Float32Array(P.k2.length), b2: new Float32Array(F2),
  wd: new Float32Array(P.wd.length), bd: new Float32Array(DENSE),
  wo: new Float32Array(P.wo.length), bo: new Float32Array(OUT_N),
};
const V = {}; for (const k of Object.keys(G)) V[k] = new Float32Array(G[k].length);
function zeroGrad() { for (const k of Object.keys(G)) G[k].fill(0); }

const c = newCache();
// scratch deltas
const dFlat = new Float32Array(FLAT);
const dAd = new Float32Array(DENSE);
const dP1 = new Float32Array(F1 * P1 * P1);
const dA1 = new Float32Array(F1 * C1 * C1);
const dA2 = new Float32Array(F2 * C2 * C2);
const dOut = new Float32Array(OUT_N);

function backprop(x, label) {
  forward(x, c);
  const loss = -Math.log(Math.max(c.out[label], 1e-12));
  for (let i = 0; i < OUT_N; i++) dOut[i] = c.out[i] - (i === label ? 1 : 0);
  // output layer grads + dAd
  dAd.fill(0);
  for (let i = 0; i < OUT_N; i++) {
    const g = dOut[i]; G.bo[i] += g; const base = i * DENSE;
    for (let j = 0; j < DENSE; j++) { G.wo[base + j] += g * c.ad[j]; dAd[j] += g * P.wo[base + j]; }
  }
  for (let j = 0; j < DENSE; j++) if (c.zd[j] <= 0) dAd[j] = 0;
  // dense grads + dFlat
  dFlat.fill(0);
  for (let i = 0; i < DENSE; i++) {
    const g = dAd[i]; G.bd[i] += g; const base = i * FLAT;
    for (let j = 0; j < FLAT; j++) { G.wd[base + j] += g * c.flat[j]; dFlat[j] += g * P.wd[base + j]; }
  }
  // pool2 backward: route dFlat to the argmax positions in a2
  dA2.fill(0);
  for (let p = 0; p < FLAT; p++) dA2[c.arg2[p]] += dFlat[p];
  // relu2
  for (let i = 0; i < dA2.length; i++) if (c.z2[i] <= 0) dA2[i] = 0;
  // conv2 grads + dP1
  dP1.fill(0);
  for (let f = 0; f < F2; f++) {
    for (let oy = 0; oy < C2; oy++) for (let ox = 0; ox < C2; ox++) {
      const g = dA2[f * C2 * C2 + oy * C2 + ox]; if (g === 0) continue;
      G.b2[f] += g;
      for (let cch = 0; cch < F1; cch++) {
        const kbase = (f * F1 + cch) * K * K;
        for (let ky = 0; ky < K; ky++) for (let kx = 0; kx < K; kx++) {
          const pv = c.p1[cch * P1 * P1 + (oy + ky) * P1 + (ox + kx)];
          G.k2[kbase + ky * K + kx] += g * pv;
          dP1[cch * P1 * P1 + (oy + ky) * P1 + (ox + kx)] += g * P.k2[kbase + ky * K + kx];
        }
      }
    }
  }
  // pool1 backward: route dP1 to argmax positions in a1
  dA1.fill(0);
  for (let p = 0; p < dP1.length; p++) dA1[c.arg1[p]] += dP1[p];
  // relu1
  for (let i = 0; i < dA1.length; i++) if (c.z1[i] <= 0) dA1[i] = 0;
  // conv1 grads
  for (let f = 0; f < F1; f++) {
    const kbase = f * K * K;
    for (let oy = 0; oy < C1; oy++) for (let ox = 0; ox < C1; ox++) {
      const g = dA1[f * C1 * C1 + oy * C1 + ox]; if (g === 0) continue;
      G.b1[f] += g;
      for (let ky = 0; ky < K; ky++) for (let kx = 0; kx < K; kx++)
        G.k1[kbase + ky * K + kx] += g * x[(oy + ky) * DIM + (ox + kx)];
    }
  }
  return loss;
}

function step(lr, batchSize) {
  const inv = 1 / batchSize;
  for (const k of Object.keys(G)) {
    const g = G[k], v = V[k], w = P[k], isW = k[0] === "k" || k[0] === "w";
    for (let i = 0; i < g.length; i++) {
      let gi = g[i] * inv; if (isW) gi += L2 * w[i];
      v[i] = MOMENTUM * v[i] - lr * gi; w[i] += v[i];
    }
  }
}

function argmaxOut() { let a = 0, m = -Infinity; for (let i = 0; i < OUT_N; i++) if (c.out[i] > m) { m = c.out[i]; a = i; } return a; }

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("CNN digit trainer  (20x20 -> conv8 -> pool -> conv8 -> pool -> dense24 -> 11)\n");
  console.log("Downloading MNIST (cached in .mnist-cache/):");
  const paths = {};
  for (const [k, name] of Object.entries(FILES)) paths[k] = await ensureFile(name);

  console.log("\nParsing + downsampling + normalizing to 20x20 …");
  const trImg = await readImages(paths.trainImages), trLab = await readLabels(paths.trainLabels);
  const teImg = await readImages(paths.testImages), teLab = await readLabels(paths.testLabels);

  const nTrain = Math.min(TRAIN_LIMIT, trImg.count);
  const trX = [], trY = [];
  for (let i = 0; i < nTrain; i++) {
    const base = normalize20(downsample(trImg.px, i * SRC * SRC));
    trX.push(base); trY.push(trLab[i]);
    for (let a = 0; a < AUGMENT; a++) { trX.push(normalize20(jitter(base))); trY.push(trLab[i]); }
  }
  const nBlank = Math.round(nTrain * (1 + AUGMENT) * BLANK_FRACTION);
  for (let i = 0; i < nBlank; i++) { trX.push(normalize20(makeBlank())); trY.push(10); }
  const teX = [], teY = [];
  for (let i = 0; i < teImg.count; i++) { teX.push(normalize20(downsample(teImg.px, i * SRC * SRC))); teY.push(teLab[i]); }
  console.log(`  train: ${trX.length} (${nBlank} blanks, ${AUGMENT}x augment)   test: ${teX.length}`);

  const N = trX.length, order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;

  console.log("\nTraining:");
  for (let ep = 0; ep < EPOCHS; ep++) {
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const lr = LR0 * Math.pow(0.9, ep);
    let epLoss = 0, seen = 0;
    for (let b = 0; b < N; b += BATCH) {
      zeroGrad();
      const end = Math.min(b + BATCH, N);
      for (let k = b; k < end; k++) epLoss += backprop(trX[order[k]], trY[order[k]]);
      step(lr, end - b); seen += end - b;
    }
    let correct = 0;
    for (let i = 0; i < teX.length; i++) { forward(teX[i], c); if (argmaxOut() === teY[i]) correct++; }
    console.log(`  epoch ${String(ep + 1).padStart(2)}  lr=${lr.toFixed(4)}  loss=${(epLoss / seen).toFixed(4)}  test acc=${(100 * correct / teX.length).toFixed(2)}%`);
  }

  // ── Emit ──────────────────────────────────────────────────────────────────
  const r = (arr) => Array.from(arr, (v) => Number(v.toFixed(4)));
  const out = {
    meta: {
      note: "CNN digit recognizer for the classroom example. Generated by train.mjs — do not hand-edit.",
      dim: DIM, k: K, f1: F1, f2: F2, c1: C1, p1: P1, c2: C2, p2: P2, flat: FLAT, dense: DENSE, outN: OUT_N,
      labels: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "blank"],
    },
    k1: r(P.k1), b1: r(P.b1),
    k2: r(P.k2), b2: r(P.b2),
    wd: r(P.wd), bd: r(P.bd),
    wo: r(P.wo), bo: r(P.bo),
  };
  await writeFile(OUT, JSON.stringify(out));
  console.log(`\nWrote ${OUT}  (${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1)} KB)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
