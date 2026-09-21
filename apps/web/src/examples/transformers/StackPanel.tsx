// One block, then stack it — and how tall real stacks are.
//
// The left figure is this page's construction drawn as a block: several heads
// read each other, add & norm, the memory, add & norm. The bracket says the
// block is repeated, and each copy has its own heads and its own drawers. The
// table on the right puts numbers on "repeated": how many blocks, how many
// heads per block, and the product, for models whose shapes are known.
//
// The sources matter and are tagged. Published papers and open weights give
// exact numbers. The largest closed models publish nothing; the figures for
// those come from press reports of leaked details and should be read as
// estimates. Rows are ordered by the total number of heads.

import { Link } from "react-router-dom";

interface ModelRow {
  name: string;
  year: number;
  layers: number;
  heads: number;
  width: number;
  source: "paper" | "open weights" | "reported";
  note?: string;
}

// Shapes as published. Width is the model dimension d_model. "heads" is heads
// per layer (attention heads; for grouped-query models this is the number of
// query heads, which is what fills the n × n grids).
const MODELS: ModelRow[] = [
  { name: "GPT-2 XL", year: 2019, layers: 48, heads: 25, width: 1600, source: "open weights" },
  { name: "Llama 2 70B", year: 2023, layers: 80, heads: 64, width: 8192, source: "open weights" },
  { name: "PaLM 540B", year: 2022, layers: 118, heads: 48, width: 18432, source: "paper" },
  { name: "DeepSeek-V3", year: 2024, layers: 61, heads: 128, width: 7168, source: "open weights" },
  { name: "GPT-3 175B", year: 2020, layers: 96, heads: 96, width: 12288, source: "paper" },
  { name: "Llama 3.1 405B", year: 2024, layers: 126, heads: 128, width: 16384, source: "open weights" },
];

const SOURCE_LABEL: Record<ModelRow["source"], string> = {
  paper: "published paper",
  "open weights": "open weights",
  reported: "reported, unconfirmed",
};

export function StackPanel() {
  const rows = [...MODELS].sort((a, b) => a.layers * a.heads - b.layers * b.heads);

  return (
    <div className="tf-stack">
      <svg
        className="tf-fig tf-stack__fig"
        viewBox="0 0 260 420"
        role="img"
        aria-label="One transformer block: words with positions enter; several attention heads; add and norm; the memory; add and norm; repeated N times."
      >
        {/* the repeat bracket */}
        <rect className="tf-stack__panel" x={30} y={70} width={200} height={270} rx={12} />
        <text className="tf-stack__nx" x={14} y={210} textAnchor="middle">
          N ×
        </text>

        {(
          [
            { y: 300, label: "several heads read each other", sub: "multi-head attention", cls: "tf-blk--attn" },
            { y: 250, label: "add & norm", sub: "keep the word; keep the numbers tame", cls: "tf-blk--norm" },
            { y: 170, label: "the memory", sub: "each word alone: keys, values, facts", cls: "tf-blk--ff" },
            { y: 120, label: "add & norm", sub: "", cls: "tf-blk--norm" },
          ] as const
        ).map((b) => (
          <g key={b.y}>
            <rect className={`tf-blk ${b.cls}`} x={60} y={b.y - 18} width={140} height={b.sub ? 40 : 30} rx={6} />
            <text className="tf-blk__label" x={130} y={b.y - 2} textAnchor="middle">
              {b.label}
            </text>
            {b.sub && (
              <text className="tf-blk__sub" x={130} y={b.y + 13} textAnchor="middle">
                {b.sub}
              </text>
            )}
          </g>
        ))}

        {/* the spine and the two skips */}
        <g className="tf-stack__lines">
          <line x1={130} y1={400} x2={130} y2={322} markerEnd="url(#tf-arrow)" />
          <line x1={130} y1={282} x2={130} y2={272} markerEnd="url(#tf-arrow)" />
          <line x1={130} y1={232} x2={130} y2={192} markerEnd="url(#tf-arrow)" />
          <line x1={130} y1={152} x2={130} y2={135} markerEnd="url(#tf-arrow)" />
          <line x1={130} y1={102} x2={130} y2={40} markerEnd="url(#tf-arrow)" />
          {/* skip connections: the word itself, carried around each sublayer */}
          <path d="M 130 360 L 48 360 L 48 250 L 58 250" markerEnd="url(#tf-arrow)" />
          <path d="M 130 215 L 48 215 L 48 120 L 58 120" markerEnd="url(#tf-arrow)" />
        </g>
        <defs>
          <marker id="tf-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-stack__head" />
          </marker>
        </defs>
        <text className="tf-stack__cap" x={130} y={412} textAnchor="middle">
          words + positions in
        </text>
        <text className="tf-stack__cap" x={130} y={30} textAnchor="middle">
          the same words, having read the sentence
        </text>
        <text className="tf-stack__skip" x={40} y={305} textAnchor="end" transform="rotate(-90 40 305)">
          the word itself
        </text>
      </svg>

      <div className="tf-stack__side">
        <p className="tf-p">
          That is one block. A transformer is this block repeated, output to
          input, dozens of times — and <b>every copy has its own heads and its
          own drawers</b>. The three heads above become tens of thousands. Each
          of them fills an n × n grid for every word it reads, which is the
          cost the attention page ended on, multiplied by every head in every
          layer.
        </p>
        <table className="tf-table">
          <thead>
            <tr>
              <th>model</th>
              <th>blocks</th>
              <th>heads per block</th>
              <th>heads in all</th>
              <th>width</th>
              <th>source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.name}>
                <td>
                  {m.name} <span className="tf-table__year">{m.year}</span>
                </td>
                <td>{m.layers}</td>
                <td>{m.heads}</td>
                <td className="tf-table__hot">{(m.layers * m.heads).toLocaleString()}</td>
                <td>{m.width.toLocaleString()}</td>
                <td>
                  <span className={`tf-tag tf-tag--${m.source.replace(" ", "-")}`}>{SOURCE_LABEL[m.source]}</span>
                </td>
              </tr>
            ))}
            <tr className="tf-table__est">
              <td>
                GPT-4 <span className="tf-table__year">2023</span>
              </td>
              <td>~120</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>
                <span className="tf-tag tf-tag--reported">{SOURCE_LABEL.reported}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="tf-p tf-p--muted">
          Open models and published papers state their shapes exactly. The
          biggest closed models state nothing: the GPT-4 row is from press
          reports of leaked details, which also describe it as a{" "}
          <i>mixture of experts</i> — several memories per block, with a
          router choosing which to open — and should be read as an estimate.
          Current frontier models from every lab are undisclosed. The width
          column is the length of each word's vector, sixteen on this page;{" "}
          <Link to="/examples/parameter-budget">counting parameters</Link> shows
          why that number, more than the count of blocks, is what makes a
          model large.
        </p>
      </div>
    </div>
  );
}
