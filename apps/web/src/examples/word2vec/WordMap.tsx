// The map: a fixed set of words projected to 2D, so the clustering can be seen
// all at once instead of read off a list.
//
// A nearest-neighbour list answers "what is near this word?" one word at a
// time. The map answers "what is the shape of the whole space?" — and the
// answer is that things clump, without anyone having labelled a single clump.
// Transport ends up with transport, food with food, cities with cities. That
// is the payoff of the entire example, and it wants to be a picture.
//
// The word set is fixed and curated so the layout is stable between visits and
// an instructor can point at the same clusters twice. The projection is PCA
// over exactly these words (see projectTo2D), which means the axes have no
// independent meaning — the page says so, and the readout shows true
// full-dimensional cosine alongside the picture so students can catch the
// places where 2D lies.

import { useMemo } from "react";
import {
  cosine,
  projectTo2D,
  vectorFor,
  type Table,
} from "../shared/embeddings/embeddings.js";

interface Props {
  table: Table;
  /** Words to plot. */
  words: string[];
  /** The focused word, whose neighbours are highlighted. */
  selected: string | null;
  onSelect: (w: string) => void;
}

const W = 760;
const H = 460;
const PAD = 46;

export function WordMap({ table, words, selected, onSelect }: Props) {
  const { points, present } = useMemo(() => {
    const present = words.filter((w) => table.index.has(w));
    const vecs = present
      .map((w) => vectorFor(table, w))
      .filter((v): v is Float32Array => v !== null);
    const proj = projectTo2D(vecs, table.dim);
    const xs = proj.map((p) => p.x);
    const ys = proj.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      present,
      points: proj.map((p) => ({
        x: PAD + ((p.x - minX) / (maxX - minX || 1)) * (W - PAD * 2),
        y: H - PAD - ((p.y - minY) / (maxY - minY || 1)) * (H - PAD * 2),
      })),
    };
  }, [table, words]);

  const selVec = selected ? vectorFor(table, selected) : null;

  // Similarity of every plotted word to the selected one, in FULL dimensions.
  // The picture is a shadow; these numbers are the real thing.
  const sims = useMemo(() => {
    if (!selVec) return null;
    return present.map((w) => {
      const v = vectorFor(table, w);
      return v ? cosine(selVec, v) : 0;
    });
  }, [present, selVec, table]);

  return (
    <div className="w2v-map">
      <svg
        className="w2v-map__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Word embeddings projected to two dimensions; related words cluster together"
      >
        {/* Lines to the nearest neighbours of the selected word. */}
        {selected &&
          sims &&
          present.map((w, i) => {
            if (w === selected) return null;
            const s = sims[i] ?? 0;
            if (s < 0.45) return null;
            const from = points[present.indexOf(selected)];
            const to = points[i];
            if (!from || !to) return null;
            return (
              <line
                key={`l-${w}`}
                className="w2v-map__link"
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={0.5 + (s - 0.45) * 6}
                opacity={0.15 + (s - 0.45) * 1.2}
              />
            );
          })}

        {present.map((w, i) => {
          const p = points[i]!;
          const isSel = w === selected;
          const s = sims?.[i] ?? 0;
          const near = !!selected && !isSel && s >= 0.45;
          return (
            <g
              key={w}
              className="w2v-map__item"
              onClick={() => onSelect(w)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(w);
              }}
            >
              <circle
                className={`w2v-map__dot${isSel ? " w2v-map__dot--sel" : ""}${
                  near ? " w2v-map__dot--near" : ""
                }${selected && !isSel && !near ? " w2v-map__dot--far" : ""}`}
                cx={p.x}
                cy={p.y}
                r={isSel ? 6 : near ? 4.5 : 3.5}
              />
              <text
                className={`w2v-map__label${isSel ? " w2v-map__label--sel" : ""}${
                  near ? " w2v-map__label--near" : ""
                }${selected && !isSel && !near ? " w2v-map__label--far" : ""}`}
                x={p.x}
                y={p.y - 9}
                textAnchor="middle"
              >
                {w}
              </text>
              {near && (
                <text
                  className="w2v-map__sim"
                  x={p.x}
                  y={p.y + 15}
                  textAnchor="middle"
                >
                  {s.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="w2v-map__note">
        {selected ? (
          <>
            Lines connect <b>{selected}</b> to every word with a similarity
            above 0.45. Surprising lines (long ones or missing ones) come from
            the fact that we've reduced the image to two dimensions.
          </>
        ) : (
          <>
            Click a word to see lines connecting it to every word with a
            similarity above 0.45.
          </>
        )}
      </p>
    </div>
  );
}
