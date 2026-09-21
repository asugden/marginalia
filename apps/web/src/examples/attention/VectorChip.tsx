// A vector, drawn the way lectures draw one: as a named symbol with an arrow
// over it, which opens into its actual numbers when you point at it.
//
// This exists because of a specific gap. Diagrams write E with a vector arrow
// and treat it as an atom, so students come away holding "E is a thing" without
// ever having seen that the thing is a list of numbers — and then the step from
// E to Q = W_Q · E reads as symbol manipulation rather than arithmetic. Hover
// turns the symbol back into the numbers at the moment the student is looking
// at it.
//
// The colour strip is always visible: it is the whole vector at a glance, one
// cell per dimension, red positive and blue negative. So even un-hovered, the
// symbol carries the shape of its contents.

import { useId, useState } from "react";

interface Props {
  /** The symbol, e.g. "E", "Q", "K", "V". */
  symbol: string;
  /** Subscript, usually the token this vector belongs to. */
  subscript?: string;
  vector: Float32Array;
  /** How many components to spell out numerically in the popover. The rest
   *  stay in the colour strip — at 16 dimensions a full numeric dump is a wall
   *  of digits that nobody reads. */
  numericCount?: number;
  /** Optional caption shown at the top of the popover. */
  caption?: string;
}

export function VectorChip({
  symbol,
  subscript,
  vector,
  numericCount = 8,
  caption,
}: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  // Strip colours are scaled against the largest magnitude in this vector, so
  // a vector of small numbers still reads rather than washing out to blank.
  let bound = 0;
  for (let i = 0; i < vector.length; i++) {
    const a = Math.abs(vector[i]!);
    if (a > bound) bound = a;
  }
  bound = bound || 1;

  return (
    <span
      className="at-chip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-describedby={open ? id : undefined}
    >
      <span className="at-chip__sym">
        <span className="at-chip__arrow" aria-hidden="true">
          →
        </span>
        {symbol}
        {subscript && <sub>{subscript}</sub>}
      </span>

      <span className="at-chip__strip" aria-hidden="true">
        {Array.from(vector, (v, i) => (
          <span
            key={i}
            className="at-chip__cell"
            style={{ background: cellColor(v / bound) }}
          />
        ))}
      </span>

      {open && (
        <span className="at-chip__pop" id={id} role="tooltip">
          {caption && <span className="at-chip__caption">{caption}</span>}
          <span className="at-chip__dims">
            {vector.length} dimensions
          </span>
          <span className="at-chip__nums">
            {Array.from(vector.slice(0, numericCount), (v, i) => (
              <span key={i} className="at-chip__num">
                {v >= 0 ? "+" : "−"}
                {Math.abs(v).toFixed(2)}
              </span>
            ))}
            {vector.length > numericCount && (
              <span className="at-chip__more">
                + {vector.length - numericCount} more
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

/** Red for positive, blue for negative — the same convention the network
 *  examples use for weights, so the colour language is consistent across the
 *  gallery. */
function cellColor(t: number): string {
  const clamped = Math.max(-1, Math.min(1, t));
  if (clamped >= 0) {
    return `color-mix(in srgb, var(--accent) ${Math.round(clamped * 90)}%, var(--surface-sunken))`;
  }
  return `color-mix(in srgb, #4a6fa5 ${Math.round(-clamped * 90)}%, var(--surface-sunken))`;
}
