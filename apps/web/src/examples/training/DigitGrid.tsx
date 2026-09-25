// A digit, drawn as a grid of cells.
//
// Used three ways on the training page, each in the figure scale for the kind
// of number it holds (style.md §11):
//
//   input    the digit, and the model's reconstruction of it: paper to ink.
//            The reconstruction is computed, but it is a picture of the digit
//            read side by side with the input, so it stays in the input's
//            greyscale (a recorded exception, like the CNN's feature maps).
//   value    the error: computed and signed. Vermillion where the model put
//            too much ink, cerulean where too little.
//   learned  a neuron's incoming weights: learned and signed, sage and plum.
//
// Signed kinds are scaled against their own largest magnitude, so a nearly
// converged model still shows visible structure instead of a blank square.

import { input, learned, value } from "../shared/palette.js";

export type GridKind = "input" | "value" | "learned";

interface Props {
  /** Pixel values, length dim*dim: 0..1 for input, signed otherwise. */
  pixels: Float32Array;
  dim: number;
  kind?: GridKind;
  /** Display size in px. */
  size?: number;
  label?: string;
  sublabel?: string;
}

export function DigitGrid({ pixels, dim, kind = "input", size = 120, label, sublabel }: Props) {
  let bound = 1;
  if (kind !== "input") {
    let b = 0;
    for (let i = 0; i < pixels.length; i++) b = Math.max(b, Math.abs(pixels[i]!));
    bound = b || 1;
  }
  const fill = (v: number) =>
    kind === "input" ? input(v) : kind === "value" ? value(v / bound) : learned(v / bound);

  return (
    <figure className="tr-grid">
      <svg
        className="tr-grid__svg"
        viewBox={`0 0 ${dim} ${dim}`}
        width={size}
        height={size}
        role="img"
        aria-label={label ?? "digit"}
        shapeRendering="crispEdges"
      >
        {Array.from({ length: dim * dim }, (_, i) => (
          <rect
            key={i}
            x={i % dim}
            y={Math.floor(i / dim)}
            width={1}
            height={1}
            fill={fill(pixels[i] ?? 0)}
          />
        ))}
      </svg>
      {label && (
        <figcaption className="tr-grid__cap">
          <span className="fig-label">{label}</span>
          {sublabel && <span className="fig-label-sub">{sublabel}</span>}
        </figcaption>
      )}
    </figure>
  );
}
