// The feed-forward layer, drawn as what it is: a bank of memories.
//
// Half of every transformer block is not attention at all. After the heads
// have let the words read each other, each word — alone, with no view of the
// others — passes through a two-layer network: expand, threshold, contract.
// Read row by row that network is a set of drawers. Each drawer has a KEY (a
// pattern it responds to) and a VALUE (what it adds when it opens). Present a
// word, a few keys match, those drawers open, and their values are added to
// the word. Research on real models finds that this is where facts are
// stored: which drawers open for "Eiffel Tower" is what makes "Paris" likely
// a few layers later, and editing those drawers edits the fact.
//
// This page's memory is DESIGNED and labelled so (see transformer.ts): one
// drawer per word the model knows, keyed on that word's embedding. The
// mechanism — sparse keys, summed values, each word on its own — is exact;
// the contents stand in for the thousands of learned drawers a real layer
// has.

import type { BlockRun, Model } from "./transformer.js";
import { Strip, maxAbs } from "./draw.js";

interface Props {
  model: Model;
  run: BlockRun;
  row: number;
}

const DRAWER_W = 26;
const KEY_CELL = 3;
const BAR_H = 44;
const CELL = 5;

export function MemoryPanel({ model, run, row }: Props) {
  const i = Math.min(row, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const mem = run.memory[i]!;
  const x1 = run.x1[i]!;
  const eDim = model.eDim;
  const n = model.vocab.length;
  const keyLen = eDim * KEY_CELL;
  const w = n * DRAWER_W + 20;
  const inY = 34;
  const barY = inY + 60;
  const keyY = barY + BAR_H + 8;
  const labelY = keyY + keyLen + 12;
  const outY = labelY + 70;
  const h = outY + 40;
  const inLen = eDim * CELL;
  const inX = (w - inLen) / 2;
  const keyBound = maxAbs(model.vocab.map((v) => model.embed.get(v)!));
  const maxAct = Math.max(0.001, ...Array.from(mem.activation));
  const openSet = new Set(mem.open);

  return (
    <div className="tf-figwrap">
      <svg
        className="tf-fig"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={`${word}'s vector is presented to ${n} memory drawers; ${mem.open.length} open, and their values are added to the word.`}
      >
        <text className="at-grid__axis" x={inX} y={inY - 10}>
          {word}, after attention — presented to every drawer
        </text>
        <Strip v={x1} bound={maxAbs([x1])} x={inX} y={inY} cell={CELL} />
        <text className="at-grid__axis" x={10} y={barY - 6}>
          how strongly each key matched
        </text>

        {model.vocab.map((v, k) => {
          const x = 10 + k * DRAWER_W;
          const cx = x + DRAWER_W / 2;
          const act = mem.activation[k]!;
          const open = openSet.has(k);
          const bar = (act / maxAct) * BAR_H;
          return (
            <g key={v} className={`tf-drawer${open ? " tf-drawer--open" : ""}`}>
              {open && (
                <line
                  className="tf-flow tf-flow--on"
                  x1={inX + inLen / 2}
                  y1={inY + 10}
                  x2={cx}
                  y2={barY + BAR_H - bar - 2}
                />
              )}
              <rect
                className="tf-drawer__bar"
                x={cx - 6}
                y={barY + BAR_H - bar}
                width={12}
                height={bar}
                rx={1}
              />
              <Strip
                v={model.embed.get(v)!}
                bound={keyBound}
                x={cx - 4.5}
                y={keyY}
                dir="v"
                cell={KEY_CELL}
                thick={9}
              />
              <rect className="tf-drawer__frame" x={x + 2} y={keyY - 3} width={DRAWER_W - 4} height={keyLen + 5} rx={2} />
              <text
                className="tf-drawer__label"
                transform={`translate(${cx + 3}, ${labelY}) rotate(55)`}
              >
                {v}
              </text>
              {open && (
                <line
                  className="tf-flow tf-flow--on"
                  x1={cx}
                  y1={labelY + 46}
                  x2={inX + inLen / 2}
                  y2={outY - 6}
                />
              )}
            </g>
          );
        })}

        <text className="at-grid__axis" x={inX} y={outY - 10}>
          what the open drawers add, summed
        </text>
        <Strip v={mem.out} bound={maxAbs([mem.out])} x={inX} y={outY} cell={CELL} />
      </svg>

      <p className="tf-readout">
        {mem.open.length === 0 ? (
          <>
            No drawer matched <b>{word}</b> closely enough to open, so the
            memory adds nothing and the word passes through unchanged. That is
            allowed, and common.
          </>
        ) : (
          <>
            For <b>{word}</b>, {mem.open.length === 1 ? "one drawer opened" : `${mem.open.length} drawers opened`}:{" "}
            <b>
              {mem.open
                .slice(0, 4)
                .map((k) => `${model.vocab[k]} (${mem.activation[k]!.toFixed(2)})`)
                .join(", ")}
            </b>
            {mem.open.length > 4 ? ", …" : ""}. Each one's value is added to
            the word, scaled by how well it matched. Every other drawer stays
            shut and contributes nothing.
          </>
        )}
      </p>
    </div>
  );
}
