// A digit, drawn as a grid of cells.
//
// Used three ways on the training page: the input image, the reconstruction,
// and the error between them. The error variant is why this component takes a
// `signed` mode — an error image has to show *which direction* each pixel is
// wrong, and the red/blue convention the gallery uses for weights carries over
// exactly: red where the model output too much, blue where too little.

interface Props {
  /** Pixel values, length dim*dim. */
  pixels: Float32Array;
  dim: number;
  /** Signed mode: 0 is neutral, positive red, negative blue. */
  signed?: boolean;
  /** Display size in px. */
  size?: number;
  label?: string;
  sublabel?: string;
}

export function DigitGrid({
  pixels,
  dim,
  signed = false,
  size = 120,
  label,
  sublabel,
}: Props) {
  // Signed images are scaled against their own largest magnitude so a nearly
  // converged model still shows visible structure instead of a blank square.
  let bound = 1;
  if (signed) {
    let b = 0;
    for (let i = 0; i < pixels.length; i++) {
      const a = Math.abs(pixels[i]!);
      if (a > b) b = a;
    }
    bound = b || 1;
  }

  const cell = size / dim;
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
        {Array.from({ length: dim * dim }, (_, i) => {
          const v = pixels[i] ?? 0;
          return (
            <rect
              key={i}
              x={i % dim}
              y={Math.floor(i / dim)}
              width={1}
              height={1}
              fill={signed ? signedFill(v / bound) : greyFill(v)}
            />
          );
        })}
      </svg>
      {label && (
        <figcaption className="tr-grid__cap">
          <span className="tr-grid__label">{label}</span>
          {sublabel && <span className="tr-grid__sub">{sublabel}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** Ink: white through black, matching the digit recognizer's input grid. */
function greyFill(v: number): string {
  const c = Math.round(255 * (1 - Math.max(0, Math.min(1, v))));
  return `rgb(${c},${c},${c})`;
}

/** Signed: red too much, blue too little, page surface at zero. */
function signedFill(t: number): string {
  const c = Math.max(-1, Math.min(1, t));
  if (c >= 0) {
    return `color-mix(in srgb, var(--accent) ${Math.round(c * 95)}%, var(--surface))`;
  }
  return `color-mix(in srgb, #4a6fa5 ${Math.round(-c * 95)}%, var(--surface))`;
}
