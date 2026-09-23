// "Inside a block: the 1×1 kernel". The deep dive under the ResNet panel.
//
// The idea students need: a kernel always reaches through EVERY map below it.
// A 1×1 kernel is that idea with the 3×3 shrunk to one cell. It looks at one
// position, straight down through all the maps, and mixes them into one new
// map. Two figures build it up with the same layout, top to bottom:
//
//   1. three maps: a colour photo's red, green and blue. A 1×1×3 kernel is a
//      colour recipe (greyscale is 0.3·R + 0.6·G + 0.1·B, a real formula).
//   2. eight maps: this page's own conv-1 maps of the student's drawing, with
//      a 1×1×8 kernel whose weights the student clicks to change.
//
// Each map gets exactly one weight, drawn right under it as a sage/plum cell
// (learned kind, docs/style.md §11), with thin lines converging on the new
// map: the same picture as a fully connected neuron, once per position.
// Maps are greyscale (the feature-map exception); the colour photo is the one
// thing drawn in colour, because it IS a colour photo. The hovered position
// takes the accent.

import { type PointerEvent as ReactPointerEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "../../components/index.js";
import { LEARNED_NEG, LEARNED_POS, input, learned } from "../shared/palette.js";
import { forwardCNN, type CNNActivations, type CNNNet } from "./cnn-net.js";

const VW = 760;
const ACCENT = "var(--accent)";
const MAP_BORDER = "#c9c2b8";
const WSZ = 28;           // one weight cell

// ── A tiny synthetic photo: sky, grass, a red apple, a yellow flower ────────
const PH = 10;
type RGB = [number, number, number];
const PHOTO: RGB[] = (() => {
  const px: RGB[] = [];
  for (let r = 0; r < PH; r++) for (let c = 0; c < PH; c++) {
    let p: RGB = r < 6 ? [0.45, 0.7, 0.95] : [0.25, 0.6, 0.2];         // sky / grass
    if ((r - 4.2) ** 2 + (c - 3.5) ** 2 < 4.4) p = [0.9, 0.12, 0.1];    // apple
    if (r === 3 && (c === 3 || c === 4) && r < 4) p = [0.9, 0.12, 0.1];
    if (r === 1 && c === 4) p = [0.35, 0.25, 0.1];                      // stem
    if ((r === 7 || r === 8) && c === 7) p = [1, 0.85, 0.1];            // flower
    if (r === 8 && (c === 6 || c === 8)) p = [1, 0.85, 0.1];
    px.push(p);
  }
  return px;
})();
const CHANNELS = [0, 1, 2].map((k) => Float32Array.from(PHOTO.map((p) => p[k]!)));

const RECIPES: Record<string, { label: string; w: number[]; note: string }> = {
  grey: { label: "greyscale", w: [0.3, 0.6, 0.1], note: "Mostly green, some red, a little blue: how a photo is turned black and white." },
  rg: { label: "red − green", w: [1, -1, 0], note: "Lights up where red beats green: the apple, and a little of the flower." },
  by: { label: "blue − yellow", w: [-0.5, -0.5, 1], note: "Lights up where blue beats red and green together: the sky. Your eyes compute signals much like these two." },
};

// A default "7" for the eight-map figure until the student has drawn.
function cannedSeven(dim: number): Float32Array {
  const a = new Float32Array(dim * dim);
  const ink = (r: number, c: number) => { if (r >= 0 && r < dim && c >= 0 && c < dim) a[r * dim + c] = 1; };
  for (let c = 5; c <= 15; c++) { ink(4, c); ink(5, c); }
  for (let r = 5; r <= 16; r++) { const c = Math.round(15 - (r - 5) * 0.55); ink(r, c); ink(r, c - 1); }
  return a;
}

const fmt = (v: number) => (v >= 0 ? v.toFixed(2) : "−" + (-v).toFixed(2));
const fmtW = (w: number) => (w > 0 ? "+" : w < 0 ? "−" : "") + Math.abs(w).toFixed(w % 1 === 0 ? 0 : 1);

interface MixProps {
  maps: Float32Array[];       // each side×side
  side: number;
  names: string[];
  weights: number[];
  onWeight?: (i: number) => void;
  /** Divide displayed map values by each map's max (for unbounded activations). */
  perMapNorm: boolean;
  top?: ReactNode;      // drawn above the maps (the photo)
  topH?: number;
  headMaps: string;
  headKernel: string;
  headOut: string;
}

/** The shared figure: N maps → one weight each → one new map. */
function MixFigure({ maps, side, names, weights, onWeight, perMapNorm, top, topH = 0, headMaps, headKernel, headOut }: MixProps) {
  // Until the student points somewhere, box the brightest output cell.
  const [userPos, setPos] = useState<{ r: number; c: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const n = maps.length;
  const gap = n > 4 ? 12 : 40;
  const S = Math.min(130, Math.floor((VW - 20 - (n - 1) * gap) / n));
  const rowW = n * S + (n - 1) * gap;
  const x0 = (VW - rowW) / 2;
  const mapX = (i: number) => x0 + i * (S + gap);

  const yMapsHead = topH + 14;
  const yMaps = yMapsHead + 30;
  const yVal = yMaps + S + 16;
  const yKHead = yVal + 26;
  const yW = yKHead + 12;
  const yWVal = yW + WSZ + 15;
  const OUT = Math.min(150, Math.max(S, 120));
  const yOutHead = yWVal + 48;
  const yOut = yOutHead + 12;
  const outX = (VW - OUT) / 2;
  const VH = yOut + OUT + 12;

  const norms = maps.map((m) => (perMapNorm ? Math.max(1e-6, ...m) : 1));
  const out = useMemo(() => {
    const o = new Float32Array(side * side);
    for (let i = 0; i < o.length; i++) {
      let s = 0; for (let k = 0; k < n; k++) s += weights[k]! * maps[k]![i]!;
      o[i] = Math.max(0, s);
    }
    return o;
  }, [maps, weights, n, side]);
  const outNorm = perMapNorm ? Math.max(1e-6, ...out) : 1;
  let best = 0;
  for (let i = 1; i < out.length; i++) if (out[i]! > out[best]!) best = i;
  const pos = userPos ?? { r: Math.floor(best / side), c: best % side };

  const idx = pos.r * side + pos.c;
  const terms = maps.map((m, k) => m[idx]! * weights[k]!);
  const sum = terms.reduce((a, b) => a + b, 0);

  const pick = (e: ReactPointerEvent, gx: number, gy: number, g: number) => {
    const ctm = svgRef.current?.getScreenCTM(); if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const c = Math.floor((pt.x - gx) / g), r = Math.floor((pt.y - gy) / g);
    if (r >= 0 && r < side && c >= 0 && c < side) setPos({ r, c });
  };

  const grid = (m: Float32Array, x: number, y: number, size: number, norm: number) => {
    const g = size / side;
    return (
      <g style={{ cursor: "crosshair", touchAction: "none" }}
        onPointerDown={(e) => pick(e, x, y, g)} onPointerMove={(e) => pick(e, x, y, g)}>
        {Array.from(m, (v, i) => (
          <rect key={i} x={x + (i % side) * g} y={y + Math.floor(i / side) * g} width={g + 0.3} height={g + 0.3}
            fill={input(Math.min(1, v / norm))} />
        ))}
        <rect x={x} y={y} width={size} height={size} fill="none" stroke={MAP_BORDER} />
        <rect x={x + pos.c * g} y={y + pos.r * g} width={g} height={g} fill="none" stroke={ACCENT} strokeWidth={2} pointerEvents="none" />
      </g>
    );
  };

  return (
    <svg ref={svgRef} className="cnn-fig" viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} role="img"
      aria-label={`${n} maps, one weight for each, added up at every position into one new map.`}>
      {top}

      <text className="fig-label" x={10} y={yMapsHead}>{headMaps}</text>
      {maps.map((m, k) => (
        <g key={k}>
          <text className="fig-label-sub" x={mapX(k)} y={yMaps - 4}>{names[k]}</text>
          {grid(m, mapX(k), yMaps, S, norms[k]!)}
          <text className="fig-num" x={mapX(k) + S / 2} y={yVal} textAnchor="middle">{fmt(m[idx]!)}</text>
        </g>
      ))}

      <text className="fig-label" x={10} y={yKHead}>{headKernel}</text>
      {/* Fan-in: each weight's line to the new map, coloured by its sign. */}
      {weights.map((w, k) => w !== 0 && (
        <line key={`l-${k}`} x1={mapX(k) + S / 2} y1={yWVal + 6} x2={outX + (pos.c + 0.5) * (OUT / side)} y2={yOut + pos.r * (OUT / side)}
          stroke={w > 0 ? LEARNED_POS : LEARNED_NEG} strokeOpacity={0.55} strokeWidth={1 + 1.5 * Math.min(1, Math.abs(w))} />
      ))}
      {weights.map((w, k) => {
        const x = mapX(k) + S / 2 - WSZ / 2;
        return (
          <g key={`w-${k}`} style={onWeight ? { cursor: "pointer" } : undefined} onClick={onWeight ? () => onWeight(k) : undefined}>
            <rect x={x} y={yW} width={WSZ} height={WSZ} rx={3} fill={learned(w)} stroke="#888" strokeWidth={1.25} />
            <text className="fig-num" x={x + WSZ / 2} y={yWVal} textAnchor="middle">{fmtW(w)}</text>
          </g>
        );
      })}

      <text className="fig-label" x={10} y={yOutHead}>{headOut}</text>
      {grid(out, outX, yOut, OUT, outNorm)}
      <text className="fig-note" x={outX + OUT + 16} y={yOut + 54}>At the boxed position:</text>
      <text className="fig-num" x={outX + OUT + 16} y={yOut + 74}>sum = {fmt(sum)}</text>
      <text className="fig-num" x={outX + OUT + 16} y={yOut + 92}>ReLU → {fmt(Math.max(0, sum))}</text>
      <text className="fig-note" x={outX + OUT + 16} y={yOut + 116}>each value × its weight,</text>
      <text className="fig-note" x={outX + OUT + 16} y={yOut + 132}>added up</text>
    </svg>
  );
}

export function OneByOne({ net, activations }: { net: CNNNet | null; activations: CNNActivations | null }) {
  const [recipe, setRecipe] = useState("grey");
  const [w8, setW8] = useState([1, 0, 0, -1, 0, 1, 0, 0]);

  // The eight conv-1 maps: the student's drawing if there is one, else a 7.
  const acts = useMemo(() => {
    if (!net) return null;
    if (activations && activations.raw.some((v) => v > 0.02)) return activations;
    return forwardCNN(net, cannedSeven(net.dim));
  }, [net, activations]);
  const maps8 = useMemo(() => {
    if (!net || !acts) return null;
    const per = net.c1 * net.c1;
    return Array.from({ length: net.f1 }, (_, f) => acts.conv1.slice(f * per, (f + 1) * per));
  }, [net, acts]);

  const PS = 120, photoX = (VW - PS) / 2, pc = PS / PH;
  const photo = (
    <g>
      <text className="fig-label" x={10} y={14}>a colour photo</text>
      {PHOTO.map((p, i) => (
        <rect key={i} x={photoX + (i % PH) * pc} y={26 + Math.floor(i / PH) * pc} width={pc + 0.3} height={pc + 0.3}
          fill={`rgb(${p.map((v) => Math.round(v * 255)).join(",")})`} />
      ))}
      <rect x={photoX} y={26} width={PS} height={PS} fill="none" stroke={MAP_BORDER} />
    </g>
  );

  return (
    <>
      <h3 className="cnn-h3">Three maps: mixing colours</h3>
      <p className="cnn-sub">
        A colour photo is already three maps: how red, how green, and how blue
        each pixel is. A 1×1×3 kernel is a recipe with three amounts in it, one
        per map. At every pixel it multiplies each colour by its amount and
        adds them up. The result is one new map. Pick a recipe, and move over
        any map.
      </p>
      <div className="cnn-pool__controls">
        <span className="fig-label">recipe</span>
        <SegmentedControl options={Object.entries(RECIPES).map(([value, r]) => ({ value, label: r.label }))}
          value={recipe} onChange={setRecipe} />
      </div>
      <MixFigure maps={CHANNELS} side={PH} names={["red", "green", "blue"]} weights={RECIPES[recipe]!.w}
        perMapNorm={false} top={photo} topH={26 + PS + 14}
        headMaps="3 maps" headKernel="one 1×1×3 kernel" headOut="one new map" />
      <p className="cnn-caption">{RECIPES[recipe]!.note}</p>

      <h3 className="cnn-h3">More than three maps</h3>
      <p className="cnn-sub">
        Nothing changes with more maps except the length of the recipe. Here
        are the eight maps this page’s conv 1 makes from your drawing (a 7 until
        you draw one). A 1×1×8 kernel has eight weights, one under each map.{" "}
        <b>Click a weight</b> to switch it between positive, zero and negative,
        and watch the new map change. A plus says “I want this pattern here,”
        a minus says “not this one.”
      </p>
      {maps8 && (
        <MixFigure maps={maps8} side={net!.c1} names={maps8.map((_, k) => `map ${k}`)} weights={w8}
          onWeight={(k) => setW8((w) => w.map((v, i) => (i === k ? (v > 0 ? 0 : v === 0 ? -1 : 1) : v)))}
          perMapNorm headMaps="8 maps, from conv 1" headKernel="one 1×1×8 kernel" headOut="one new map" />
      )}

      <h3 className="cnn-h3">In ResNet</h3>
      <p className="cnn-sub">
        ResNet’s block starts with 256 maps. Its first layer is 64 of these
        recipes, each 1×1×256, so it makes 64 new maps: a summary of the 256.
        The 3×3 layer, the only one that looks at neighbouring positions, then
        works on 64 maps instead of 256. The last 1×1 layer is 256 recipes,
        each 1×1×64, which turn the 64 maps back into 256. Squeezing first
        makes the block far cheaper than one plain 3×3 layer:
      </p>
      <table className="cnn-table">
        <thead>
          <tr><th>layer</th><th>kernels</th><th>each kernel</th><th>weights</th></tr>
        </thead>
        <tbody>
          <tr><td>squeeze</td><td>64</td><td>1×1×256</td><td>16,384</td></tr>
          <tr><td>look around</td><td>64</td><td>3×3×64</td><td>36,864</td></tr>
          <tr><td>expand</td><td>256</td><td>1×1×64</td><td>16,384</td></tr>
          <tr className="cnn-table__total"><td>the block</td><td /><td /><td>69,632</td></tr>
          <tr className="cnn-table__alt"><td>one plain 3×3 layer instead</td><td>256</td><td>3×3×256</td><td>589,824</td></tr>
        </tbody>
      </table>
    </>
  );
}
