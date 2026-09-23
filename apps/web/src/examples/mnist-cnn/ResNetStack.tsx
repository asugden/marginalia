// "A modern network": ResNet-50, top to bottom, in the diagram's vocabulary.
//
// Layer names run down the left in the diagram's voice; input at the top,
// output at the bottom. Each of the four stages draws ONE bottleneck block in
// full (1×1 → 3×3 → 1×1, with its skip connection into a ⊕), then vertical
// ellipses for the blocks it leaves out. The point for students: after the
// first layer, every kernel is 3×3 or 1×1; depth, not kernel size, is how a
// modern network sees a wide patch.
//
// Kernels are drawn like the diagram's swatches: sage/plum cells, with offset
// tiles behind them for depth (the conv-2 "stack" cue). The weights are
// ILLUSTRATIVE (a fixed pseudo-random pattern), and the panel says so; the
// size and the depth are the information. Every label writes the depth
// (1×1×256), as the diagram does for conv 2 (3×3×8).
//
// The right-hand column draws each stage's output maps as a stack whose front
// square shrinks with the map size and whose depth grows with the channel
// count, which shows the halve-the-size, double-the-maps rule. The last two
// rows are neuron rows with horizontal ellipses and faint learned-colour
// wiring, like the diagram's fully connected layer. The skip connection is
// structure, so it takes --purple-600 like the diagram's wiring.
//
// Sizes are from He et al. 2016, Table 1 (ResNet-50 column).

import { LEARNED_NEG, LEARNED_POS, learned } from "../shared/palette.js";

const VW = 760;
const LABEL_X = 10;
const CX = 200;           // centre line of the kernel column
const SKIP_X = 150;       // where the skip connection runs
const TEXT_X = 250;       // kernel labels
const NOTE_X = 388;       // stage-1 notes, on the kernel labels' lines
const MAP_X = 520;        // output-map stacks
const MAP_TEXT_X = 612;   // output-map sizes
const CELL = 10;          // one kernel cell
const STROKE = "#888";    // the diagram's kernel border
const MAP_BORDER = "#c9c2b8";
const WIRE = "var(--purple-600)";

const PAPER_URL = "https://doi.org/10.1109/CVPR.2016.90";

/** A fixed pseudo-random weight in [-1, 1] (illustrative, not trained). */
function fakeW(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** A kernel swatch: n×n sage/plum cells, with `depth` offset tiles behind. */
function Kernel({ n, cx, y, seed, depth = 2, cell = CELL }: {
  n: number; cx: number; y: number; seed: number; depth?: number; cell?: number;
}) {
  const s = n * cell, x = cx - s / 2;
  return (
    <g>
      {Array.from({ length: depth }, (_, d) => {
        const o = (depth - d) * 3;
        return <rect key={d} x={x + o} y={y - o} width={s} height={s} rx={2}
          fill={d % 2 ? "var(--sand-100)" : "var(--sand-200)"} stroke={MAP_BORDER} strokeWidth={1} />;
      })}
      {Array.from({ length: n * n }, (_, i) => (
        <rect key={i} x={x + (i % n) * cell} y={y + Math.floor(i / n) * cell} width={cell} height={cell}
          fill={learned(fakeW(seed, i))} stroke="var(--surface)" strokeWidth={0.5} />
      ))}
      <rect x={x} y={y} width={s} height={s} fill="none" stroke={STROKE} strokeWidth={1.1} rx={2} />
    </g>
  );
}

/** A stack of output maps: front square ∝ map size, depth ∝ channel count. */
function MapStack({ size, channels, x, cy }: { size: number; channels: number; x: number; cy: number }) {
  const s = Math.max(6, size * 1.1);
  const tiles = Math.max(1, Math.round(channels / 128));   // 64 → 1 … 2048 → 16
  const step = 2.5;
  const y = cy - s / 2 + (tiles * step) / 2;
  return (
    <g>
      {Array.from({ length: tiles }, (_, t) => {
        const o = (tiles - t) * step;
        return <rect key={t} x={x + o} y={y - o} width={s} height={s} fill="var(--surface)" stroke={MAP_BORDER} strokeWidth={0.8} />;
      })}
      <rect x={x} y={y} width={s} height={s} fill="var(--sand-200)" stroke={STROKE} strokeWidth={1} />
    </g>
  );
}

type Stage = { name: string; blocks: number; inC: number; mid: number; out: number; size: number; halves: boolean };
const STAGES: Stage[] = [
  { name: "stage 1", blocks: 3, inC: 256, mid: 64, out: 256, size: 56, halves: false },
  { name: "stage 2", blocks: 4, inC: 512, mid: 128, out: 512, size: 28, halves: true },
  { name: "stage 3", blocks: 6, inC: 1024, mid: 256, out: 1024, size: 14, halves: true },
  { name: "stage 4", blocks: 3, inC: 2048, mid: 512, out: 2048, size: 7, halves: true },
];

/** One stage: a bottleneck block in full, its skip, then the ellipsis. */
function StageRow({ s, top, index }: { s: Stage; top: number; index: number }) {
  const entry = top + 8;
  const k1 = top + 20, k2 = top + 46, k3 = top + 90;       // kernel tops
  const plus = top + 118;                                  // ⊕ centre
  const more = s.blocks - 1;
  const seed = 10 + index * 3;
  return (
    <g>
      <text className="fig-label fig-label--lg" x={LABEL_X} y={k1 + 4} dominantBaseline="middle">{s.name}</text>
      <text className="fig-label-sub" x={LABEL_X} y={k1 + 22} dominantBaseline="middle">
        {s.blocks} blocks · {s.blocks * 3} layers
      </text>

      {/* Main path through the block, under the kernels. */}
      <line x1={CX} x2={CX} y1={entry} y2={plus - 7} stroke={STROKE} strokeWidth={1} />
      {/* The skip: the block's input, carried round and added back in. */}
      <path d={`M ${CX} ${entry} H ${SKIP_X + 8} Q ${SKIP_X} ${entry} ${SKIP_X} ${entry + 8} V ${plus - 8} Q ${SKIP_X} ${plus} ${SKIP_X + 8} ${plus} H ${CX - 7}`}
        fill="none" stroke={WIRE} strokeWidth={1.5} />

      <Kernel n={1} cx={CX} y={k1} seed={seed} cell={12} depth={4} />
      <Kernel n={3} cx={CX} y={k2} seed={seed + 1} depth={2} />
      <Kernel n={1} cx={CX} y={k3} seed={seed + 2} cell={12} depth={2} />
      <text className="fig-num" x={TEXT_X} y={k1 + 6} dominantBaseline="middle">{s.mid} kernels · 1×1×{s.inC}</text>
      <text className="fig-num" x={TEXT_X} y={k2 + 1.5 * CELL} dominantBaseline="middle">{s.mid} kernels · 3×3×{s.mid}</text>
      <text className="fig-num" x={TEXT_X} y={k3 + 6} dominantBaseline="middle">{s.out} kernels · 1×1×{s.mid}</text>
      {index === 0 && (
        <>
          <text className="fig-note" x={NOTE_X} y={k1 + 6} dominantBaseline="middle">squeeze: 256 → 64 maps</text>
          <text className="fig-note" x={NOTE_X} y={k2 + 1.5 * CELL} dominantBaseline="middle">look at neighbours</text>
          <text className="fig-note" x={NOTE_X} y={k3 + 6} dominantBaseline="middle">expand: 64 → 256 maps</text>
        </>
      )}

      <circle cx={CX} cy={plus} r={7} fill="var(--surface)" stroke={WIRE} strokeWidth={1.5} />
      <path d={`M ${CX - 4} ${plus} H ${CX + 4} M ${CX} ${plus - 4} V ${plus + 4}`} stroke={WIRE} strokeWidth={1.5} />
      {index === 0 && (
        <text className="fig-note" x={TEXT_X} y={plus + 2} dominantBaseline="middle">
          add the block’s input back in (the skip)
        </text>
      )}

      {/* The blocks left out. */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={CX} cy={plus + 20 + i * 8} r={1.8} fill={STROKE} />
      ))}
      <text className="fig-note" x={TEXT_X} y={plus + 28} dominantBaseline="middle">
        {more} more {more === 1 ? "block" : "blocks"} like this one
      </text>

      <MapStack size={s.size} channels={s.out} x={MAP_X} cy={k2 + 1.5 * CELL} />
      <text className="fig-num" x={MAP_TEXT_X} y={k2 + 1.5 * CELL} dominantBaseline="middle">
        {s.size}×{s.size} × {s.out}
      </text>
      {s.halves && (
        <>
          <text className="fig-note" x={MAP_TEXT_X} y={k2 + 1.5 * CELL + 18} dominantBaseline="middle">half as wide,</text>
          <text className="fig-note" x={MAP_TEXT_X} y={k2 + 1.5 * CELL + 33} dominantBaseline="middle">twice the maps</text>
        </>
      )}
    </g>
  );
}

/** A row of neurons with a horizontal ellipsis in the middle. */
function NeuronRow({ y, left, right, x0, size }: { y: number; left: number; right: number; x0: number; size: number }) {
  const step = size + 5;
  const xs: number[] = [];
  for (let i = 0; i < left; i++) xs.push(x0 + i * step);
  const gapX = x0 + left * step;
  for (let i = 0; i < right; i++) xs.push(gapX + 34 + i * step);
  return {
    xs: xs.map((x) => x + size / 2),
    node: (
      <g>
        {xs.map((x, i) => (
          <rect key={i} x={x} y={y - size / 2} width={size} height={size} rx={size / 3}
            fill="var(--surface)" className="fig-neuron fig-neuron--small" />
        ))}
        {[0, 1, 2].map((i) => <circle key={i} cx={gapX + 9 + i * 8} cy={y} r={1.8} fill={STROKE} />)}
      </g>
    ),
  };
}

export function ResNetStack() {
  const HEAD = 36;
  const ROW = { input: 36, conv1: 70, pool: 40, stage: 166, avg: 44, wires: 46, fc: 44 };
  let y = HEAD;
  const at = (h: number) => { const t = y; y += h; return t; };
  const tInput = at(ROW.input);
  const tConv1 = at(ROW.conv1);
  const tPool = at(ROW.pool);
  const tStages = STAGES.map(() => at(ROW.stage));
  const tAvg = at(ROW.avg);
  at(ROW.wires);
  const tFc = at(ROW.fc);
  const VH = y + 4;

  const mid = (t: number, h: number) => t + h / 2;
  const NX = CX - 40, NS = 13;
  const avgY = mid(tAvg, ROW.avg), fcY = mid(tFc, ROW.fc);
  const avgRow = NeuronRow({ y: avgY, left: 9, right: 4, x0: NX, size: NS });
  const fcRow = NeuronRow({ y: fcY, left: 7, right: 3, x0: NX + 18, size: NS });

  return (
    <svg className="cnn-fig" viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} role="img"
      aria-label="ResNet-50 from top to bottom: a 7×7 convolution, a max pool, four stages of bottleneck blocks (1×1, 3×3, 1×1 kernels with a skip connection), 3, 4, 6 and 3 blocks deep, each stage halving the map size and doubling the number of maps, then an average pool to 2048 values and a fully connected layer of 1000 neurons.">

      <rect x={0} y={tPool + 4} width={VW} height={ROW.pool - 8} rx={6} fill="var(--surface-sunken)" />

      {/* Column heads. */}
      <text className="fig-label" x={NX} y={16}>kernels</text>
      <text className="fig-label-sub" x={NX} y={30}>weights illustrative</text>
      <text className="fig-label" x={MAP_X} y={16}>output maps</text>
      <text className="fig-label-sub" x={MAP_X} y={30}>size × how many</text>
      <line x1={0} x2={VW} y1={HEAD - 2} y2={HEAD - 2} stroke="var(--border)" />

      {/* input */}
      <text className="fig-label fig-label--lg" x={LABEL_X} y={mid(tInput, ROW.input)} dominantBaseline="middle">input</text>
      <text className="fig-note" x={NX} y={mid(tInput, ROW.input)} dominantBaseline="middle">a 224×224 colour photo: 3 maps (red, green, blue)</text>
      <text className="fig-num" x={MAP_TEXT_X} y={mid(tInput, ROW.input)} dominantBaseline="middle">224×224 × 3</text>

      {/* conv 1: the one large kernel. */}
      <text className="fig-label fig-label--lg" x={LABEL_X} y={tConv1 + 22} dominantBaseline="middle">conv 1</text>
      <Kernel n={7} cx={CX} y={tConv1 + 14} seed={3} cell={6} depth={2} />
      <text className="fig-num" x={TEXT_X} y={tConv1 + 26} dominantBaseline="middle">64 kernels · 7×7×3, stride 2</text>
      <text className="fig-note" x={TEXT_X} y={tConv1 + 44} dominantBaseline="middle">the only kernel bigger than 3×3</text>
      <MapStack size={112 / 2} channels={64} x={MAP_X} cy={tConv1 + 30} />
      <text className="fig-num" x={MAP_TEXT_X} y={tConv1 + 30} dominantBaseline="middle">112×112 × 64</text>

      {/* pool 1 */}
      <text className="fig-label fig-label--lg" x={LABEL_X} y={mid(tPool, ROW.pool)} dominantBaseline="middle">pool 1</text>
      <text className="fig-num" x={NX} y={mid(tPool, ROW.pool)} dominantBaseline="middle">3×3 max, stride 2</text>
      <text className="fig-num" x={MAP_TEXT_X} y={mid(tPool, ROW.pool)} dominantBaseline="middle">56×56 × 64</text>

      {STAGES.map((s, i) => <StageRow key={s.name} s={s} top={tStages[i]!} index={i} />)}

      {/* pool 2 → fully connected: neuron rows, like the diagram's. */}
      <g strokeLinecap="round">
        {avgRow.xs.flatMap((ax, i) => fcRow.xs.map((fx, j) => {
          const w = fakeW(99, i * 31 + j);
          return Math.abs(w) < 0.45 ? null : (
            <line key={`${i}-${j}`} x1={ax} y1={avgY + NS / 2} x2={fx} y2={fcY - NS / 2}
              stroke={w > 0 ? LEARNED_POS : LEARNED_NEG} strokeOpacity={0.3} strokeWidth={0.8} />
          );
        }))}
      </g>
      <text className="fig-label fig-label--lg" x={LABEL_X} y={avgY} dominantBaseline="middle">pool 2</text>
      {avgRow.node}
      <text className="fig-note" x={MAP_X} y={avgY - 8} dominantBaseline="middle">average each 7×7 map</text>
      <text className="fig-num" x={MAP_X} y={avgY + 9} dominantBaseline="middle">2048 values</text>

      <text className="fig-label fig-label--lg" x={LABEL_X} y={fcY - 9} dominantBaseline="middle">fully
        <tspan x={LABEL_X} dy={18}>connected</tspan>
      </text>
      {fcRow.node}
      <text className="fig-note" x={MAP_X} y={fcY - 8} dominantBaseline="middle">every value to every neuron</text>
      <text className="fig-num" x={MAP_X} y={fcY + 9} dominantBaseline="middle">1000 neurons, one per class</text>
    </svg>
  );
}

export function ResNetCitation() {
  return (
    <>
      Sizes from Table 1 of Kaiming He, Xiangyu Zhang, Shaoqing Ren, and Jian
      Sun,{" "}
      <a href={PAPER_URL} target="_blank" rel="noreferrer">
        “Deep Residual Learning for Image Recognition”
      </a>
      , <i>CVPR</i> 2016.
    </>
  );
}
