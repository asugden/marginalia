// Bootstrap resampling, shown the way it gets drawn on a board: give every row
// its own colour, then draw a new sample of the same size *with replacement*
// and look at what happened.
//
// Colour here means identity, not class — dot 7 is row 7, nothing more. That is
// the whole trick of the picture: because each row is individually
// recognisable, you can see a colour appear twice in a resample and see another
// colour missing altogether, which is exactly what sampling with replacement
// does and exactly what a table of numbers hides.

import { useMemo, useState } from "react";

const N = 16;
const COLS = 4;

/** One distinguishable hue per row. Evenly spaced around the wheel with the
 *  lightness alternating, so neighbouring rows stay separable. */
const IDENTITY = Array.from({ length: N }, (_, i) => {
  const hue = Math.round((360 / N) * i);
  const light = i % 2 === 0 ? 58 : 44;
  return `hsl(${hue} 68% ${light}%)`;
});

function draw(seed: number): number[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: N }, () => Math.floor(rnd() * N));
}

function Grid({ picks, title }: { picks: number[]; title: string }) {
  const seen = new Set(picks);
  const missing = N - seen.size;
  const dupes = picks.length - seen.size;
  return (
    <figure className="bag-grid">
      <div className="bag-grid__dots">
        {picks.map((p, i) => (
          <span
            key={i}
            className="bag-dot"
            style={{ background: IDENTITY[p] }}
            title={`row ${p + 1}`}
          />
        ))}
      </div>
      <figcaption>
        {title}
        {missing > 0 && (
          <em>
            {missing} left out · {dupes} repeated
          </em>
        )}
      </figcaption>
    </figure>
  );
}

export function BaggingFigure() {
  const [seed, setSeed] = useState(20260209);
  const samples = useMemo(() => [0, 1, 2].map((k) => draw(seed + k * 7919)), [seed]);
  const original = useMemo(() => Array.from({ length: N }, (_, i) => i), []);
  const leftOut = samples.map((s) => N - new Set(s).size);
  const avg = leftOut.reduce((a, b) => a + b, 0) / leftOut.length;

  return (
    <div className="bag">
      <Grid picks={original} title="the data — one colour per row" />
      <div className="bag-arrow">draw {N} again, with replacement, three times</div>
      <div className="bag-row">
        {samples.map((s, i) => (
          <Grid key={i} picks={s} title={`sample ${i + 1}`} />
        ))}
      </div>
      <div className="dt-controls">
        <button type="button" className="mnist-clear" onClick={() => setSeed((s) => s + 1)}>
          Draw again
        </button>
        <span className="dt-verdict">
          {avg.toFixed(1)} of {N} rows missed on average — about a third, every
          time
        </span>
      </div>
    </div>
  );
}
