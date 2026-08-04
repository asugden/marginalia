// Offline trainer for the digit-recognition example.
//
// Produces the weights the browser ships and runs a forward pass over. Pure
// Node (>=18) — no numpy, no torch, no npm deps. `fetch` + `DecompressionStream`
// are built in, so it downloads and gunzips MNIST itself.
//
// Topology: 400 -> 25 -> 25 -> 11.
//   - 400 inputs   = a 20x20 grayscale image (MNIST's 28x28 area-averaged down
//                    to 20x20, which is what the drawing canvas produces).
//   - 25, 25       = two hidden layers, ReLU. Small on purpose: few enough
//                    nodes and (thresholded) edges to draw honestly.
//   - 11 outputs   = digits 0-9 PLUS a "blank" class (index 10) so an empty or
//                    scribbled canvas has somewhere to go instead of forcing a
//                    confident wrong digit. Softmax.
//
// Output: weights.json next to the example's runtime code, shaped for the
// hand-written forward pass in ../net.ts. ~55 KB, committed to the repo so the
// page stays fully static (no server inference).
//
// Run:  node apps/web/src/examples/mnist-mlp/train/train.mjs
// Deterministic: a fixed PRNG seed means re-running reproduces the same weights.

import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".mnist-cache");
const OUT = join(HERE, "..", "weights.json");

// ── Config ────────────────────────────────────────────────────────────────
const SRC = 28; // MNIST native
const DIM = 20; // our canvas
const IN = DIM * DIM; // 400
const H1 = 25;
const H2 = 25;
const OUT_N = 11; // 0-9 + blank
const EPOCHS = 30;
const BATCH = 64;
const LR0 = 0.05;
const L2 = 1e-5;
const MOMENTUM = 0.9;
// Deskew/normalization target: crop each digit to its ink bounding box, scale
// the longer side to BOX cells, and recentre by centre-of-mass in the DIMxDIM
// field. Applied IDENTICALLY here and at inference time (see normalize20() in
// ../net.ts) so a stroke drawn anywhere at any size matches the training
// distribution. This is the single biggest accuracy win for hand-drawn input:
// without it a straight line drawn off-centre or oversized looks nothing like
// MNIST's centred, size-normalised "1"s.
const BOX = 16;
// Augmentation: small random shifts/scales so the net is robust to how people
// actually draw (the normalization removes most variation; this covers the
// residue). Each training digit is seen once clean + AUGMENT times jittered.
const AUGMENT = 1;
// Fraction of the training set we synthesize as "blank" (class 10): a mix of
// all-empty frames and light random noise/strokes, so the net learns to say
// "nothing here" rather than hallucinate a digit on an empty canvas.
const BLANK_FRACTION = 0.08;

// MNIST mirrors. The classic Yann LeCun host is often down; these two CDNs
// carry byte-identical copies.
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

// ── Deterministic PRNG (mulberry32) ─────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(12345);
// Standard normal via Box-Muller, driven by the seeded PRNG.
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Download + gunzip ────────────────────────────────────────────────────────
async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

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
      // Gunzip the stream straight to the raw file.
      const ds = new DecompressionStream("gzip");
      const decompressed = res.body.pipeThrough(ds);
      await pipeline(Readable.fromWeb(decompressed), createWriteStream(rawPath));
      console.log("ok");
      return rawPath;
    } catch (err) {
      console.log(`failed (${err.message})`);
      lastErr = err;
    }
  }
  throw new Error(`Could not download ${name}: ${lastErr?.message}`);
}

// ── IDX parsing ──────────────────────────────────────────────────────────────
async function readImages(path) {
  const buf = await readFile(path);
  const magic = buf.readUInt32BE(0);
  if (magic !== 0x00000803) throw new Error(`bad image magic in ${path}`);
  const count = buf.readUInt32BE(4);
  const rows = buf.readUInt32BE(8);
  const cols = buf.readUInt32BE(12);
  if (rows !== SRC || cols !== SRC) throw new Error(`expected ${SRC}x${SRC}`);
  const px = buf.subarray(16);
  return { count, rows, cols, px };
}
async function readLabels(path) {
  const buf = await readFile(path);
  const magic = buf.readUInt32BE(0);
  if (magic !== 0x00000801) throw new Error(`bad label magic in ${path}`);
  const count = buf.readUInt32BE(4);
  return buf.subarray(8);
}

// Area-average downscale one 28x28 image (Uint8, 0..255) to a 20x20 Float32
// vector normalised to 0..1. This is deliberately the SAME operation the
// canvas performs on the user's drawing, so train-time and run-time inputs
// match. MNIST ink is white-on-black (255 = ink); the canvas is also ink=1.
function downsample(px, offset) {
  const out = new Float32Array(IN);
  const scale = SRC / DIM; // 1.4
  for (let oy = 0; oy < DIM; oy++) {
    for (let ox = 0; ox < DIM; ox++) {
      const x0 = ox * scale, x1 = (ox + 1) * scale;
      const y0 = oy * scale, y1 = (oy + 1) * scale;
      let acc = 0, wsum = 0;
      const sy = Math.floor(y0), ey = Math.ceil(y1);
      const sx = Math.floor(x0), ex = Math.ceil(x1);
      for (let y = sy; y < ey; y++) {
        const wy = Math.min(y1, y + 1) - Math.max(y0, y);
        if (wy <= 0) continue;
        for (let x = sx; x < ex; x++) {
          const wx = Math.min(x1, x + 1) - Math.max(x0, x);
          if (wx <= 0) continue;
          const w = wx * wy;
          acc += w * px[offset + y * SRC + x];
          wsum += w;
        }
      }
      out[oy * DIM + ox] = wsum > 0 ? acc / wsum / 255 : 0;
    }
  }
  return out;
}

// Normalize a DIMxDIM grayscale image (0..1) the way MNIST is normalized, so a
// stroke drawn anywhere at any size lands in the same distribution the net saw
// while training:
//   1. find the ink bounding box (cells above a small threshold),
//   2. bilinearly scale that box so its longer side is BOX cells,
//   3. paste it centred by centre-of-mass in the DIMxDIM output.
// Empty images pass through unchanged (all zeros).
//
// IMPORTANT: this must stay byte-for-byte equivalent to normalize20() in
// ../net.ts — training and inference both call it. If you change one, change
// the other.
function normalize20(img) {
  const D = DIM;
  const TH = 0.08;
  let minX = D, minY = D, maxX = -1, maxY = -1;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      if (img[y * D + x] > TH) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img.slice(); // empty
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const scale = BOX / Math.max(bw, bh);
  const sw = Math.max(1, Math.round(bw * scale));
  const sh = Math.max(1, Math.round(bh * scale));

  // Bilinear resample the cropped box into an sw x sh buffer.
  const box = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const fx = minX + (i / sw) * bw;
      const fy = minY + (j / sh) * bh;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(D - 1, x0 + 1), y1 = Math.min(D - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const a = img[y0 * D + x0], b = img[y0 * D + x1];
      const c = img[y1 * D + x0], d = img[y1 * D + x1];
      box[j * sw + i] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    }
  }

  // Centre of mass of the resampled box.
  let m = 0, mx = 0, my = 0;
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const v = box[j * sw + i];
      m += v; mx += v * i; my += v * j;
    }
  }
  const comX = m > 0 ? mx / m : sw / 2;
  const comY = m > 0 ? my / m : sh / 2;
  // Offset so the centre of mass sits at the field centre.
  const offX = Math.round(D / 2 - comX);
  const offY = Math.round(D / 2 - comY);

  const out = new Float32Array(D * D);
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const x = i + offX, y = j + offY;
      if (x >= 0 && x < D && y >= 0 && y < D) out[y * D + x] = box[j * sw + i];
    }
  }
  return out;
}

// Small affine jitter (shift + scale) of a DIMxDIM image, for augmentation.
function jitter(img) {
  const D = DIM;
  const s = 0.85 + rand() * 0.3;        // scale 0.85..1.15
  const dx = (rand() - 0.5) * 3;        // +/- 1.5 cells
  const dy = (rand() - 0.5) * 3;
  const cx = D / 2, cy = D / 2;
  const out = new Float32Array(D * D);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      // inverse map output cell -> source coordinate
      const fx = (x - cx - dx) / s + cx;
      const fy = (y - cy - dy) / s + cy;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 >= D - 1 || y0 >= D - 1) continue;
      const tx = fx - x0, ty = fy - y0;
      const a = img[y0 * D + x0], b = img[y0 * D + x0 + 1];
      const c = img[(y0 + 1) * D + x0], d = img[(y0 + 1) * D + x0 + 1];
      out[y * D + x] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    }
  }
  return out;
}

// ── Model ─────────────────────────────────────────────────────────────────
// He-init for ReLU layers, small-normal for the softmax layer.
function initMatrix(rows, cols, kind) {
  const std = kind === "he" ? Math.sqrt(2 / cols) : 0.01;
  const m = new Float32Array(rows * cols);
  for (let i = 0; i < m.length; i++) m[i] = randn() * std;
  return m;
}
const model = {
  W1: initMatrix(H1, IN, "he"), b1: new Float32Array(H1),
  W2: initMatrix(H2, H1, "he"), b2: new Float32Array(H2),
  W3: initMatrix(OUT_N, H2, "small"), b3: new Float32Array(OUT_N),
};

function forward(x, cache) {
  const { W1, b1, W2, b2, W3, b3 } = model;
  const z1 = cache.z1, a1 = cache.a1, z2 = cache.z2, a2 = cache.a2, y = cache.y;
  for (let i = 0; i < H1; i++) {
    let s = b1[i]; const base = i * IN;
    for (let j = 0; j < IN; j++) s += W1[base + j] * x[j];
    z1[i] = s; a1[i] = s > 0 ? s : 0;
  }
  for (let i = 0; i < H2; i++) {
    let s = b2[i]; const base = i * H1;
    for (let j = 0; j < H1; j++) s += W2[base + j] * a1[j];
    z2[i] = s; a2[i] = s > 0 ? s : 0;
  }
  let max = -Infinity;
  for (let i = 0; i < OUT_N; i++) {
    let s = b3[i]; const base = i * H2;
    for (let j = 0; j < H2; j++) s += W3[base + j] * a2[j];
    y[i] = s; if (s > max) max = s;
  }
  let sum = 0;
  for (let i = 0; i < OUT_N; i++) { y[i] = Math.exp(y[i] - max); sum += y[i]; }
  for (let i = 0; i < OUT_N; i++) y[i] /= sum;
}

// Gradient buffers + momentum velocities.
const grad = {
  W1: new Float32Array(H1 * IN), b1: new Float32Array(H1),
  W2: new Float32Array(H2 * H1), b2: new Float32Array(H2),
  W3: new Float32Array(OUT_N * H2), b3: new Float32Array(OUT_N),
};
const vel = {
  W1: new Float32Array(H1 * IN), b1: new Float32Array(H1),
  W2: new Float32Array(H2 * H1), b2: new Float32Array(H2),
  W3: new Float32Array(OUT_N * H2), b3: new Float32Array(OUT_N),
};
const cache = {
  z1: new Float32Array(H1), a1: new Float32Array(H1),
  z2: new Float32Array(H2), a2: new Float32Array(H2),
  y: new Float32Array(OUT_N),
};
const dz1 = new Float32Array(H1), dz2 = new Float32Array(H2), dy = new Float32Array(OUT_N);

function zeroGrad() {
  for (const k of Object.keys(grad)) grad[k].fill(0);
}

// Accumulate gradients for one example (label is 0..10). Returns the loss.
function backprop(x, label) {
  forward(x, cache);
  const { a1, a2, y } = cache;
  const { W2, W3 } = model;
  const loss = -Math.log(Math.max(y[label], 1e-12));
  // dL/dz3 = softmax - onehot
  for (let i = 0; i < OUT_N; i++) dy[i] = y[i] - (i === label ? 1 : 0);
  // W3 / b3 grads, and dL/da2
  dz2.fill(0);
  for (let i = 0; i < OUT_N; i++) {
    const g = dy[i]; grad.b3[i] += g; const base = i * H2;
    for (let j = 0; j < H2; j++) { grad.W3[base + j] += g * a2[j]; dz2[j] += g * W3[base + j]; }
  }
  // through ReLU2
  for (let j = 0; j < H2; j++) if (cache.z2[j] <= 0) dz2[j] = 0;
  // W2 / b2 grads, and dL/da1
  dz1.fill(0);
  for (let i = 0; i < H2; i++) {
    const g = dz2[i]; grad.b2[i] += g; const base = i * H1;
    for (let j = 0; j < H1; j++) { grad.W2[base + j] += g * a1[j]; dz1[j] += g * W2[base + j]; }
  }
  // through ReLU1
  for (let j = 0; j < H1; j++) if (cache.z1[j] <= 0) dz1[j] = 0;
  // W1 / b1 grads
  for (let i = 0; i < H1; i++) {
    const g = dz1[i]; grad.b1[i] += g; const base = i * IN;
    for (let j = 0; j < IN; j++) grad.W1[base + j] += g * x[j];
  }
  return loss;
}

function step(lr, batchSize) {
  const inv = 1 / batchSize;
  for (const k of Object.keys(grad)) {
    const g = grad[k], v = vel[k], w = model[k];
    const isWeight = k[0] === "W";
    for (let i = 0; i < g.length; i++) {
      let gi = g[i] * inv;
      if (isWeight) gi += L2 * w[i]; // weight decay, biases excluded
      v[i] = MOMENTUM * v[i] - lr * gi;
      w[i] += v[i];
    }
  }
}

// ── Blank-class synthesis ────────────────────────────────────────────────────
// Class 10 = "nothing recognisable". Two flavours: truly empty, and light
// speckle/short strokes that shouldn't read as a digit.
function makeBlank() {
  const x = new Float32Array(IN);
  const kind = rand();
  if (kind < 0.55) return x; // empty
  if (kind < 0.85) {
    // sparse speckle
    const n = 3 + Math.floor(rand() * 20);
    for (let k = 0; k < n; k++) x[Math.floor(rand() * IN)] = 0.3 + rand() * 0.7;
  } else {
    // a short random stroke
    let px = Math.floor(rand() * DIM), py = Math.floor(rand() * DIM);
    const len = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < len; k++) {
      if (px >= 0 && px < DIM && py >= 0 && py < DIM) x[py * DIM + px] = 0.6 + rand() * 0.4;
      px += Math.floor(rand() * 3) - 1; py += Math.floor(rand() * 3) - 1;
    }
  }
  return x;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("Digit-recognition trainer  (400 -> 25 -> 25 -> 11)\n");
  console.log("Downloading MNIST (cached in .mnist-cache/):");
  const paths = {};
  for (const [k, name] of Object.entries(FILES)) paths[k] = await ensureFile(name);

  console.log("\nParsing + downsampling + normalizing to 20x20 …");
  const trImg = await readImages(paths.trainImages);
  const trLab = await readLabels(paths.trainLabels);
  const teImg = await readImages(paths.testImages);
  const teLab = await readLabels(paths.testLabels);

  // Downsample -> normalize (crop/scale/recentre) every digit, so training sees
  // the same normalized distribution inference will produce. Then augment: each
  // digit contributes one clean copy plus AUGMENT jittered-then-renormalized
  // copies, for robustness to draw-time variation.
  const trX = [], trY = [];
  for (let i = 0; i < trImg.count; i++) {
    const base = normalize20(downsample(trImg.px, i * SRC * SRC));
    trX.push(base); trY.push(trLab[i]);
    for (let a = 0; a < AUGMENT; a++) {
      trX.push(normalize20(jitter(base))); trY.push(trLab[i]);
    }
  }
  const nBlank = Math.round((trImg.count * (1 + AUGMENT)) * BLANK_FRACTION);
  for (let i = 0; i < nBlank; i++) { trX.push(normalize20(makeBlank())); trY.push(10); }
  // Test set: normalized, no augmentation.
  const teX = [], teY = [];
  for (let i = 0; i < teImg.count; i++) {
    teX.push(normalize20(downsample(teImg.px, i * SRC * SRC))); teY.push(teLab[i]);
  }
  console.log(`  train: ${trX.length} (${nBlank} synthetic blanks, ${AUGMENT}x augment)   test: ${teX.length}`);

  const N = trX.length;
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;

  console.log("\nTraining:");
  for (let ep = 0; ep < EPOCHS; ep++) {
    // Fisher-Yates shuffle with the seeded PRNG.
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const lr = LR0 * Math.pow(0.85, ep); // gentle decay
    let epLoss = 0, seen = 0;
    for (let b = 0; b < N; b += BATCH) {
      zeroGrad();
      const end = Math.min(b + BATCH, N);
      for (let k = b; k < end; k++) { const idx = order[k]; epLoss += backprop(trX[idx], trY[idx]); }
      step(lr, end - b);
      seen += end - b;
    }
    // Eval on the test set.
    let correct = 0;
    for (let i = 0; i < teX.length; i++) {
      forward(teX[i], cache);
      let arg = 0, mx = -Infinity;
      for (let c = 0; c < OUT_N; c++) if (cache.y[c] > mx) { mx = cache.y[c]; arg = c; }
      if (arg === teY[i]) correct++;
    }
    const acc = (100 * correct / teX.length).toFixed(2);
    console.log(`  epoch ${String(ep + 1).padStart(2)}  lr=${lr.toFixed(4)}  loss=${(epLoss / seen).toFixed(4)}  test acc=${acc}%`);
  }

  // ── Emit ──────────────────────────────────────────────────────────────────
  // Round to 4 significant digits to keep the JSON small; that precision is far
  // finer than the viz or the argmax needs.
  const r = (arr) => Array.from(arr, (v) => Number(v.toFixed(4)));
  const out = {
    meta: {
      note: "Digit-recognition MLP for the classroom example. Generated by train.mjs — do not hand-edit.",
      arch: [IN, H1, H2, OUT_N],
      dim: DIM,
      labels: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "blank"],
      activation: "relu",
      output: "softmax",
    },
    W1: r(model.W1), b1: r(model.b1),
    W2: r(model.W2), b2: r(model.b2),
    W3: r(model.W3), b3: r(model.b3),
  };
  await writeFile(OUT, JSON.stringify(out));
  const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1);
  console.log(`\nWrote ${OUT}  (${kb} KB)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
