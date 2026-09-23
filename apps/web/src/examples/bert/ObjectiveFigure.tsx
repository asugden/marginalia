// Three training tasks, side by side, on the same sentence and the same word.
//
//   skip-gram   one word in, its neighbours out       (the embeddings page)
//   CBOW        the neighbours in, the one word out   (word2vec's other model)
//   masked LM   the whole ordered sentence with a blank in, the word out (BERT)
//
// The point is made by the arrows. The first two are the same pair of layers
// with the direction flipped; the third is CBOW with the bag replaced by the
// sentence in order and the average replaced by twelve blocks of attention.

const TILE_W = 56;
const TILE_H = 22;
// Column layout: the masked-LM column carries the whole sentence and gets
// half the width.
const COLS: { x: number; w: number }[] = [
  { x: 0, w: 230 },
  { x: 230, w: 260 },
  { x: 490, w: 510 },
];

function Tiles({ words, x, y, hot, hollow }: { words: string[]; x: number; y: number; hot?: string; hollow?: boolean }) {
  const gap = 4;
  const total = words.length * TILE_W + (words.length - 1) * gap;
  return (
    <g transform={`translate(${x - total / 2}, ${y})`}>
      {words.map((w, k) => (
        <g key={`${w}-${k}`} transform={`translate(${k * (TILE_W + gap)}, 0)`}>
          <rect className={`bt-obj__tile${w === hot ? " bt-obj__tile--hot" : ""}${hollow || w === "___" ? " bt-obj__tile--hollow" : ""}`} width={TILE_W} height={TILE_H} rx={5} />
          <text className={`bt-obj__text${w === hot ? " bt-obj__text--hot" : ""}`} x={TILE_W / 2} y={TILE_H / 2 + 4} textAnchor="middle">
            {w}
          </text>
        </g>
      ))}
    </g>
  );
}

export function ObjectiveFigure({ tokens, at, window = 2 }: { tokens: string[]; at: number; window?: number }) {
  const centre = tokens[at]!;
  const bag = tokens.filter((_, k) => k !== at && Math.abs(k - at) <= window);
  const masked = tokens.map((t, k) => (k === at ? "___" : t));

  const W = 1000;
  const yTitle = 16;
  const yTop = 34;
  const yBox = 92;
  const yBot = 160;
  const H = yBot + TILE_H + 16;

  const Column = ({
    i,
    title,
    sub,
    top,
    bottom,
    box,
    topHot,
    bottomHot,
    topHollow,
  }: {
    i: number;
    title: string;
    sub: string;
    top: string[];
    bottom: string[];
    box: string;
    topHot?: string;
    bottomHot?: string;
    topHollow?: boolean;
  }) => {
    const col = COLS[i]!;
    const cx = col.x + col.w / 2;
    return (
      <g>
        <text className="bt-obj__title" x={cx} y={yTitle} textAnchor="middle">
          {title}
        </text>
        <text className="tf-stack__cap" x={cx} y={yTitle + 12} textAnchor="middle">
          {sub}
        </text>
        <Tiles words={top} x={cx} y={yTop} hot={topHot} hollow={topHollow} />
        <line className="rn-wire" x1={cx} y1={yTop + TILE_H + 2} x2={cx} y2={yBox - 3} markerEnd="url(#bt-obj-arrow)" />
        <rect className="rn-box" x={cx - 70} y={yBox} width={140} height={34} rx={7} />
        <text className="tf-blk__label" x={cx} y={yBox + 21} textAnchor="middle">
          {box}
        </text>
        <line className="rn-wire" x1={cx} y1={yBox + 34} x2={cx} y2={yBot - 3} markerEnd="url(#bt-obj-arrow)" />
        <Tiles words={bottom} x={cx} y={yBot} hot={bottomHot} />
      </g>
    );
  };

  return (
    <div className="tf-figwrap">
      <svg className="tf-fig bt-obj" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Skip-gram predicts the neighbours from ${centre}; CBOW predicts ${centre} from its neighbours; BERT predicts ${centre} from the whole sentence with ${centre} blanked out.`}>
        <defs>
          <marker id="bt-obj-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-stack__head" />
          </marker>
        </defs>
        <Column i={0} title="skip-gram" sub="word2vec, the embeddings page" top={[centre]} topHot={centre} bottom={bag} box="one layer, a waist" />
        <Column i={1} title="CBOW" sub="word2vec's other model, the same year" top={bag} bottom={[centre]} bottomHot={centre} box="average, then one layer" />
        <Column i={2} title="masked language model" sub="BERT: CBOW, grown up" top={masked} bottom={[centre]} bottomHot={centre} box="12 transformer blocks" />
        <line className="bt-obj__divider" x1={COLS[1]!.x} y1={8} x2={COLS[1]!.x} y2={H - 8} />
        <line className="bt-obj__divider" x1={COLS[2]!.x} y1={8} x2={COLS[2]!.x} y2={H - 8} />
      </svg>
    </div>
  );
}
