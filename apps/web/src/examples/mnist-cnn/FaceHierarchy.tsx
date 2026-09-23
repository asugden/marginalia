// "What deeper layers learn": a panel below the CNN example's footer.
//
// Our digit network is too small for its second layer to be interpretable, so
// this sets it beside a well-known larger one (Lee, Grosse, Ranganath & Ng,
// ICML 2009) that shows the hierarchy at scale: edges → face parts → faces.
//
// The figure is laid out like the network diagram above it: layer names down
// the left in the same voice, input at the top. Two columns share those rows,
// "this network" (drawn from the live weights, same kernel swatches as above)
// and "a face network" (cropped subsets of the paper's figures). Reading a row
// across answers the two questions students ask: are the kernels still 3×3
// (no: 10×10 and 14×14), and what sits between the pictures (pooling layers,
// shaded as bands). See the README for the images' provenance.

import { useMemo } from "react";
import type { CNNNet } from "./cnn-net.js";
import { learned } from "../shared/palette.js";

const BASE = "/examples/cnn-digit-recognizer";
const PAPER_URL = "https://dl.acm.org/doi/10.1145/1553374.1553453";

// Drawn 1:1 (docs/style.md §12), so type sizes are pixel sizes.
const VW = 760;
const LABEL_X = 10;
const A_X = 130;          // "this network" column
const A_W = 190;
const B_X = 350;          // "a face network" column

const KSW = 30;           // kernel swatch, ~ the diagram's on-screen size
const KGAP = 8;
const IMG_BORDER = "#c9c2b8";   // the diagram's feature-map border

type Row =
  | { kind: "input" | "fc"; label: string[]; h: number; a: string; b: string }
  | { kind: "pool"; label: string[]; h: number; a: string | null; b: string }
  | {
      kind: "conv"; label: string[]; h: number;
      a: { kernels: Float32Array | null; scale: number; size: string; sees: string } | { none: string };
      b: { src: string; w: number; h: number; pixelated?: boolean; size: string; sees: string; alt: string };
    };

function Swatches({ k, scale, x, y }: { k: Float32Array | null; scale: number; x: number; y: number }) {
  // 8 kernels as 2 rows of 4, each drawn exactly like the diagram's swatches.
  return (
    <g>
      {Array.from({ length: 8 }, (_, f) => {
        const kx = x + (f % 4) * (KSW + KGAP), ky = y + Math.floor(f / 4) * (KSW + KGAP), cs = KSW / 3;
        return (
          <g key={f}>
            {k && Array.from({ length: 9 }, (_, i) => (
              <rect key={i} x={kx + (i % 3) * cs} y={ky + Math.floor(i / 3) * cs} width={cs} height={cs}
                fill={learned(k[f * 9 + i]! / scale)} stroke="var(--surface)" strokeWidth={0.5} />
            ))}
            <rect x={kx} y={ky} width={KSW} height={KSW} fill="none" stroke="#888" strokeWidth={1.1} rx={3} />
          </g>
        );
      })}
    </g>
  );
}

export function FaceHierarchy({ net }: { net: CNNNet | null }) {
  // The same two kernel summaries the diagram draws: conv-1 weights as-is, and
  // each conv-2 filter's channel-mean 3×3.
  const kernels = useMemo(() => {
    if (!net) return null;
    const maxAbs = (a: Float32Array) => a.reduce((m, w) => Math.max(m, Math.abs(w)), 1e-6);
    const k2 = new Float32Array(net.f2 * 9);
    for (let f = 0; f < net.f2; f++) for (let i = 0; i < 9; i++) {
      let s = 0; for (let ch = 0; ch < net.f1; ch++) s += net.k2[(f * net.f1 + ch) * 9 + i]!;
      k2[f * 9 + i] = s / net.f1;
    }
    return { k1: net.k1, s1: maxAbs(net.k1), k2, s2: maxAbs(k2) };
  }, [net]);

  // Receptive fields ("sees"): ours is exact (3, then 3 + 2·2 = 8 on a 20×20
  // grid). Theirs follows from the paper's sizes (10×10 filters, pool 3, 10×10,
  // pool 2, 14×14): 10, then 12 + 9·3 = 39, then 42 + 13·6 = 120 pixels.
  const rows: Row[] = [
    { kind: "input", label: ["input"], h: 34, a: "a 20×20 drawing", b: "a greyscale photo" },
    {
      kind: "conv", label: ["conv 1"], h: 132,
      a: { kernels: kernels?.k1 ?? null, scale: kernels?.s1 ?? 1, size: "8 kernels · 3×3", sees: "each sees 3×3 pixels" },
      b: {
        src: `${BASE}/lee2009-layer1-edges.png`, w: 399, h: 69, pixelated: true,
        size: "24 kernels · 10×10", sees: "each sees 10×10 pixels: an edge",
        alt: "24 small grey tiles, each a short light-dark edge at a different angle.",
      },
    },
    { kind: "pool", label: ["pool 1"], h: 40, a: "2×2 max", b: "3×3 max" },
    {
      kind: "conv", label: ["conv 2"], h: 212,
      a: { kernels: kernels?.k2 ?? null, scale: kernels?.s2 ?? 1, size: "8 kernels · 3×3×8", sees: "each sees 8×8 pixels" },
      b: {
        src: `${BASE}/lee2009-layer2-parts.png`, w: 398, h: 149,
        size: "40 kernels · 10×10×24 (24 shown)", sees: "each sees ≈40×40 pixels: a face part",
        alt: "Blurry grey tiles, each showing one face part: an eye, a nose, a mouth corner, an eyebrow.",
      },
    },
    { kind: "pool", label: ["pool 2"], h: 40, a: "2×2 max", b: "2×2 max" },
    {
      kind: "conv", label: ["conv 3"], h: 196,
      a: { none: "none: after pool 2, this network goes to its fully connected layer" },
      b: {
        src: `${BASE}/lee2009-layer3-faces.png`, w: 399, h: 133,
        size: "24 kernels · 14×14×40 (12 shown)", sees: "each sees ≈120×120 pixels: a whole face",
        alt: "Twelve blurry, ghostly faces, each a different face template.",
      },
    },
    { kind: "pool", label: ["pool 3"], h: 40, a: null, b: "2×2 max" },
    {
      kind: "fc", label: ["fully", "connected"], h: 44,
      a: "24 neurons, then the digit", b: "none: trained without labels",
    },
  ];

  const HEAD = 52;
  const tops: number[] = [];
  let y = HEAD;
  for (const r of rows) { tops.push(y); y += r.h; }
  const VH = y + 4;

  return (
    <svg className="cnn-fig" viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} role="img"
      aria-label="This page's network beside a larger face network, row by row. Both convolve and pool in turn. The face network's kernels are 10×10 and 14×14 rather than 3×3, and its three convolution layers learn edges, then face parts, then whole faces.">

      {/* Pooling rows: the layers between the pictures, shaded as bands. */}
      {rows.map((r, i) => r.kind === "pool" && (
        <rect key={`band-${i}`} x={0} y={tops[i]! + 4} width={VW} height={r.h - 8} rx={6}
          fill="var(--surface-sunken)" />
      ))}

      {/* Column heads. */}
      <text className="fig-label" x={A_X} y={16}>this network</text>
      <text className="fig-label-sub" x={A_X} y={32}>the one above</text>
      <text className="fig-label" x={B_X} y={16}>a face network</text>
      <text className="fig-label-sub" x={B_X} y={32}>Lee et al., 2009</text>
      <line x1={0} x2={VW} y1={HEAD - 8} y2={HEAD - 8} stroke="var(--border)" />

      {rows.map((r, i) => {
        const top = tops[i]!;
        const mid = top + r.h / 2;
        const convTop = top + 10;
        return (
          <g key={r.label.join(" ")}>
            {/* Layer name, the diagram's voice. Conv rows name the row at the
                kernels, as the diagram does. */}
            <text className="fig-label fig-label--lg" x={LABEL_X}
              y={r.kind === "conv" ? convTop + 12 : r.label.length > 1 ? mid - 9 : mid}
              dominantBaseline="middle">
              {r.label[0]}
              {r.label[1] && <tspan x={LABEL_X} dy={18}>{r.label[1]}</tspan>}
            </text>

            {r.kind !== "conv" ? (
              <>
                {r.a && <text className={r.kind === "pool" ? "fig-num" : "fig-note"} x={A_X} y={mid} dominantBaseline="middle">{r.a}</text>}
                <text className={r.kind === "pool" ? "fig-num" : "fig-note"} x={B_X} y={mid} dominantBaseline="middle">{r.b}</text>
              </>
            ) : (
              <>
                {"none" in r.a ? (
                  <foreignObject x={A_X} y={convTop} width={A_W} height={60}>
                    <p className="fig-note cnn-faces__wrap">{r.a.none}</p>
                  </foreignObject>
                ) : (
                  <>
                    <Swatches k={r.a.kernels} scale={r.a.scale} x={A_X} y={convTop} />
                    <text className="fig-num" x={A_X} y={convTop + 2 * KSW + KGAP + 20}>{r.a.size}</text>
                    <text className="fig-note" x={A_X} y={convTop + 2 * KSW + KGAP + 36}>{r.a.sees}</text>
                  </>
                )}
                <image href={r.b.src} x={B_X} y={convTop} width={r.b.w} height={r.b.h}
                  preserveAspectRatio="none"
                  style={r.b.pixelated ? { imageRendering: "pixelated" } : undefined}>
                  <title>{r.b.alt}</title>
                </image>
                <rect x={B_X} y={convTop} width={r.b.w} height={r.b.h} fill="none" stroke={IMG_BORDER} />
                <text className="fig-num" x={B_X} y={convTop + r.b.h + 20}>{r.b.size}</text>
                <text className="fig-note" x={B_X} y={convTop + r.b.h + 36}>{r.b.sees}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function FaceHierarchyCitation() {
  return (
    <>
      Face-network images: cropped from Figures 2 and 3 of Honglak Lee, Roger
      Grosse, Rajesh Ranganath, and Andrew Y. Ng,{" "}
      <a href={PAPER_URL} target="_blank" rel="noreferrer">
        “Convolutional Deep Belief Networks for Scalable Unsupervised Learning
        of Hierarchical Representations”
      </a>
      , <i>ICML</i> 2009, reproduced for teaching and commentary. Their conv-1
      kernels were learned from natural images, and conv 2 and conv 3 were
      then learned from faces. Their network is a convolutional deep belief
      network trained without labels. It is not a digit classifier like ours,
      but it uses the same convolution and pooling.
    </>
  );
}
