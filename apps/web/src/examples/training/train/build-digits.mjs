// Builds the small digit set the training example learns from, live, in the
// browser.
//
// The page trains a real autoencoder from random initialization while the
// student watches, so it ships DATA, not weights — the whole point is that the
// weights start as noise and become something.
//
// Size drives every choice here. A 14x14 digit is 196 numbers; 256 of them at
// one byte each is ~50 KB, which is the same neighbourhood as the other
// examples' weight files. That is enough to train a legible autoencoder in a
// few seconds of browser time without shipping a dataset.
//
// Reads the MNIST cache the digit-recognizer trainer already downloads.
//
// Run:  node apps/web/src/examples/training/train/build-digits.mjs
// Deterministic: images are taken in file order, no sampling.

import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "..", "..", "mnist-mlp", "train", ".mnist-cache");
const OUT = join(HERE, "..", "digits.json");

const SRC = 28; // MNIST native
const DIM = 14; // what we ship: 14x14 = 196 inputs
const PER_DIGIT = 24; // images per class
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function readIdxImages(buf) {
  const count = buf.readUInt32BE(4);
  const rows = buf.readUInt32BE(8);
  const cols = buf.readUInt32BE(12);
  return { count, rows, cols, data: buf.subarray(16) };
}
function readIdxLabels(buf) {
  const count = buf.readUInt32BE(4);
  return { count, data: buf.subarray(8) };
}

/** Area-average 28x28 down to 14x14: each output pixel is the mean of a 2x2
 *  block. Simple, and it keeps strokes connected at this scale. */
function downsample(src, offset) {
  const out = new Float32Array(DIM * DIM);
  const k = SRC / DIM; // 2
  for (let y = 0; y < DIM; y++) {
    for (let x = 0; x < DIM; x++) {
      let sum = 0;
      for (let dy = 0; dy < k; dy++) {
        for (let dx = 0; dx < k; dx++) {
          sum += src[offset + (y * k + dy) * SRC + (x * k + dx)];
        }
      }
      out[y * DIM + x] = sum / (k * k) / 255;
    }
  }
  return out;
}

async function main() {
  console.log("\nbuilding the training set");
  const imgBuf = await readFile(join(CACHE, "train-images-idx3-ubyte"));
  const lblBuf = await readFile(join(CACHE, "train-labels-idx1-ubyte"));
  const imgs = readIdxImages(imgBuf);
  const lbls = readIdxLabels(lblBuf);
  console.log(`  source: ${imgs.count} images at ${imgs.rows}x${imgs.cols}`);

  const wanted = new Map(DIGITS.map((d) => [d, []]));
  const px = imgs.rows * imgs.cols;
  for (let i = 0; i < imgs.count; i++) {
    const label = lbls.data[i];
    const bucket = wanted.get(label);
    if (!bucket || bucket.length >= PER_DIGIT) continue;
    bucket.push(downsample(imgs.data, i * px));
    if ([...wanted.values()].every((b) => b.length >= PER_DIGIT)) break;
  }

  // Interleave by class so any prefix of the set is class-balanced — the page
  // lets the student train on a subset, and an unbalanced prefix would teach
  // the wrong lesson about what the model saw.
  const images = [];
  const labels = [];
  for (let n = 0; n < PER_DIGIT; n++) {
    for (const d of DIGITS) {
      const b = wanted.get(d);
      if (b && b[n]) {
        images.push(b[n]);
        labels.push(d);
      }
    }
  }
  console.log(`  kept ${images.length} images at ${DIM}x${DIM}`);

  // One byte per pixel: the images are 0..1 greyscale, so 0..255 loses nothing
  // that matters at this size.
  const flat = [];
  for (const img of images) {
    for (const v of img) flat.push(Math.round(Math.max(0, Math.min(1, v)) * 255));
  }

  const payload = {
    meta: {
      dim: DIM,
      count: images.length,
      quantization: "uint8, divide by 255",
      source: {
        name: "MNIST handwritten digits",
        by: "LeCun, Cortes, Burges",
        url: "http://yann.lecun.com/exdb/mnist/",
      },
      note: `${PER_DIGIT} images of each digit 0-9, area-averaged from 28x28 to ${DIM}x${DIM}, interleaved by class so any prefix stays balanced.`,
    },
    labels,
    images: flat,
  };
  await writeFile(OUT, JSON.stringify(payload));
  const { size } = await stat(OUT);
  console.log(`  wrote ${OUT} (${(size / 1024).toFixed(0)} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
