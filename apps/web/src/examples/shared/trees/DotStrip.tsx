import { useLayoutEffect, useRef, useState } from "react";

// One dot per row of the dataset, in a fixed order, drawn as a single line.
//
// Borrowed from the way this material is taught on a whiteboard: give every
// data point a dot, then show what happens to it. Because the order is fixed
// across every strip on a page, strips stack into a grid you can read
// vertically — the same data point occupies the same column in every tree, so
// disagreement between trees shows up as speckle in a column and agreement
// shows up as a clean band.
//
// The encodings differ by page but the geometry never does:
//   forest    colour = the class this tree votes for; faded = a row this tree
//             never saw, because the bootstrap left it out
//   boosting  colour = the direction of the error handed to this round, radius
//             = how big it is, so the whole strip shrinks as rounds go by

export interface DotStripProps {
  count: number;
  colorOf: (i: number) => string;
  /** 0..1 magnitude per dot. Mapped to *area*, not radius — see below. */
  sizeOf?: (i: number) => number;
  /** Rows to draw faint — for the forest, the ones left out of the sample. */
  fadedOf?: (i: number) => boolean;
  /** Distance between dot centres, in px. */
  pitch?: number;
  /** Radius at full size. */
  radius?: number;
  /** Dots per line; anything longer wraps. A two-hundred-row dataset cannot sit
   *  on one line at a legible dot size, so it wraps into a block instead.
   *
   *  Leave it unset and the strip measures the box it is in and fits itself to
   *  the width available, reflowing when that changes. Strips sharing a grid
   *  column all measure the same width and so agree on the layout, which is
   *  what keeps a dog in the same position in every strip. */
  columns?: number;
  className?: string;
}

/** Starting guess before the first measurement lands, chosen so the initial
 *  paint is close to the settled layout rather than a single enormous line. */
const ASSUMED_COLUMNS = 40;

export function DotStrip({
  count,
  colorOf,
  sizeOf,
  fadedOf,
  pitch = 11,
  radius = 5,
  columns,
  className,
}: DotStripProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(ASSUMED_COLUMNS);

  useLayoutEffect(() => {
    if (columns != null) return;
    const el = hostRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w > 0) setMeasured(Math.max(4, Math.floor(w / pitch)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [columns, pitch]);

  const cols = Math.max(1, Math.min(columns ?? measured, count));
  const lines = Math.ceil(count / cols);
  const w = cols * pitch;
  const h = lines * pitch;
  return (
    <div ref={hostRef} className="dotstrip__host">
    <svg
      className={"dotstrip" + (className ? ` ${className}` : "")}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`${count} data points`}
    >
      {Array.from({ length: count }, (_, i) => {
        // Area-proportional, so radius goes as the square root of the value.
        // This is the perceptually correct encoding for magnitude, and it also
        // keeps the later rounds of a boosted model legible: scaled linearly
        // against a maximum set by one outlier, every dot after the fifth round
        // collapses to a dot of the same invisible size and the rows stop being
        // comparable to each other.
        const v = sizeOf ? Math.max(0, Math.min(1, sizeOf(i))) : 1;
        const r = radius * Math.max(0.16, Math.sqrt(v));
        return (
          <circle
            key={i}
            cx={(i % cols) * pitch + pitch / 2}
            cy={Math.floor(i / cols) * pitch + pitch / 2}
            r={r}
            fill={colorOf(i)}
            opacity={fadedOf?.(i) ? 0.22 : 1}
          />
        );
      })}
    </svg>
    </div>
  );
}
