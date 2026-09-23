// "Make it bigger!" (moved from the language models example) and the panel
// that follows it: where the chosen model's parameters go. Both follow one
// choice, a row of the table. The second panel is not pinned to the first:
// the choice drives two panels only, and the grid is tall.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/index.js";
import "./bigger.css";
import { bytesFor, formatBytes, formatParams } from "./budget.js";
import { MODELS, SOURCE_LABEL, TABLE, type ModelShape } from "./models.js";
import { COUNT_FILL } from "./network.js";
import { StackGrid } from "./StackGrid.js";

export function useModelPick() {
  // GPT-2 XL: big enough to see both directions (index into MODELS).
  return useState(1);
}

export function BiggerPanel({
  picked,
  onPick,
}: {
  picked: number;
  onPick: (i: number) => void;
}) {
  const model = MODELS[picked]!;
  return (
    <Card className="pb-panel" padding="md">
      <h2 className="pb-h2">Make it bigger!</h2>
      <p className="pb-sub">
        A large language model is a stack of{" "}
        <Link to="/examples/transformers">transformer</Link> blocks. Each square
        is one <Link to="/examples/attention">attention head</Link>; a row is
        one block, and a word passes through every row in turn. Pick a model in
        the table.
      </p>
      <div className="mb-layout">
        <aside className="mb-side" aria-live="polite">
          <Readout model={model} />
        </aside>
        <StackGrid model={model} />
      </div>
      <ModelTable picked={picked} onPick={onPick} />
    </Card>
  );
}

function Readout({ model }: { model: ModelShape }) {
  return (
    <>
      <div className="mb-box">
        <span className="mb-kicker">{model.name}</span>
        <dl className="mb-stats">
          <dt>blocks, in series</dt>
          <dd>{model.blocks.toLocaleString()}</dd>
          <dt>heads per block, in parallel</dt>
          <dd>{model.heads.toLocaleString()}</dd>
          <dt>heads in all</dt>
          <dd className="mb-stats__total">
            {(model.blocks * model.heads).toLocaleString()}
          </dd>
          <dt>width of a word's vector</dt>
          <dd>{model.width.toLocaleString()}</dd>
        </dl>
      </div>
      <p className="mb-text">
        Every word passes through all {model.blocks.toLocaleString()}{" "}
        {model.blocks === 1 ? "block" : "blocks"}, one after another. Inside
        each block, {model.heads.toLocaleString()} heads operate on the words in
        parallel.
      </p>
    </>
  );
}

function ModelTable({
  picked,
  onPick,
}: {
  picked: number;
  onPick: (i: number) => void;
}) {
  return (
    <>
      <table className="mb-table">
        <thead>
          <tr>
            <th>model</th>
            <th>blocks</th>
            <th>heads per block</th>
            <th>heads in all</th>
            <th>width</th>
            <th>parameters</th>
            <th>source</th>
          </tr>
        </thead>
        <tbody>
          {TABLE.map((row) => {
            if (row.kind === "closed") {
              const r = row.model;
              return (
                <tr key={r.name} className="mb-row mb-row--est">
                  <td>
                    {r.name} <span className="mb-table__year">{r.year}</span>
                  </td>
                  <td>{r.blocks ?? "—"}</td>
                  <td>—</td>
                  <td className="mb-table__guess">{r.headsGuess}</td>
                  <td>—</td>
                  <td>{r.params}</td>
                  <td>
                    <span className="mb-tag mb-tag--reported">
                      {SOURCE_LABEL[r.source]}
                    </span>
                  </td>
                </tr>
              );
            }
            const m = row.model;
            const i = MODELS.indexOf(m);
            return (
              <tr
                key={m.name}
                className={`mb-row${i === picked ? " mb-row--on" : ""}`}
                onClick={() => onPick(i)}
                tabIndex={0}
                aria-selected={i === picked}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPick(i);
                  }
                }}
              >
                <td>
                  {m.name}{" "}
                  {m.year && <span className="mb-table__year">{m.year}</span>}
                </td>
                <td>{m.blocks}</td>
                <td>{m.heads}</td>
                <td className="mb-table__total">
                  {(m.blocks * m.heads).toLocaleString()}
                </td>
                <td>{m.width.toLocaleString()}</td>
                <td>
                  {m.params}
                  {m.active && (
                    <span className="mb-table__active">
                      {" "}
                      ({m.active} per word)
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={`mb-tag mb-tag--${m.source.replace(" ", "-")}`}
                  >
                    {SOURCE_LABEL[m.source]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pb-note">
        Parameter counts for closed models are from best estimates or leaks, and
        their heads in all are this page's guesses from open models of a similar
        size. Most recent models are <i>mixtures of experts</i>: each block has
        many sets of fully connected layers, and a router picks a few of them
        for each word.
      </p>
    </>
  );
}

/** Where the chosen model's parameters are, part by part, on one scale. */
export function SplitPanel({ picked }: { picked: number }) {
  const m = MODELS[picked]!;
  const s = m.split;
  const total = s.table + s.attention + s.connected + s.other;
  const perWord = s.table + s.attention + (s.connectedPerWord ?? s.connected);

  const rows: Array<{ name: string; sub: string; n: number; used?: number }> = [
    {
      name: "word table",
      sub: `${s.vocab.toLocaleString()} words × ${m.width.toLocaleString()} numbers${
        s.tables === 2 ? ", in and out" : ""
      }`,
      n: s.table,
    },
    {
      name: "attention",
      sub: `${m.blocks} ${m.blocks === 1 ? "block" : "blocks"}`,
      n: s.attention,
    },
    {
      name: "fully connected",
      sub: s.experts
        ? `${m.blocks} blocks × ${s.experts.perBlock} experts, ${s.experts.perWord} used per word`
        : `${m.blocks} ${m.blocks === 1 ? "block" : "blocks"}`,
      n: s.connected,
      used: s.connectedPerWord,
    },
  ];
  if (s.other / total >= 0.005) {
    rows.push({
      name: "other",
      sub: "extra prediction layers, normalisation, images",
      n: s.other,
    });
  }

  return (
    <Card className="pb-panel" padding="md">
      <h2 className="pb-h2">How {m.name}'s parameters are allocated</h2>
      <p className="pb-sub">
        LLM parameters are, surprisingly, largely in the fully connected layers
        of the transformers. This has led model creators to begin using "mixture
        of experts" models, which actively use only a subset of the fully
        connected layers in each computation-- the experts.
        <br />
        <br />
        Each word in this model is an embedding vector (a list of{" "}
        {m.width.toLocaleString()} numbers).
      </p>
      <div className="pb-split">
        {rows.map((r) => (
          <div className="pb-split__row" key={r.name}>
            <div className="pb-split__name">
              <span className="pb-split__title">{r.name}</span>
              <span className="pb-split__sub">{r.sub}</span>
            </div>
            <div className="pb-split__track">
              {r.used != null ? (
                <>
                  <span
                    className="pb-split__idle"
                    style={{ width: `${(r.n / total) * 100}%` }}
                  />
                  <span
                    className="pb-split__fill"
                    style={{
                      width: `${Math.max(0.3, (r.used / total) * 100)}%`,
                      background: COUNT_FILL,
                    }}
                  />
                </>
              ) : (
                <span
                  className="pb-split__fill"
                  style={{
                    width: `${Math.max(0.3, (r.n / total) * 100)}%`,
                    background: COUNT_FILL,
                  }}
                />
              )}
            </div>
            <div className="pb-split__val">
              <span className="pb-mono pb-split__n">{formatParams(r.n)}</span>
              <span className="pb-split__pct">
                {share(r.n / total)} · {formatBytes(bytesFor(r.n, 16))}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="pb-readouts">
        <div className="pb-readout">
          <span className="pb-kicker">in all</span>
          <span className="pb-readout__val">{formatParams(total)}</span>
          <span className="pb-readout__sub">
            {formatBytes(bytesFor(total, 16))} at 16-bit
          </span>
        </div>
        {s.experts && (
          <div className="pb-readout">
            <span className="pb-kicker">used for each word</span>
            <span className="pb-readout__val">{formatParams(perWord)}</span>
            <span className="pb-readout__sub">
              {share(perWord / total)} of the model
            </span>
          </div>
        )}
      </div>
      <p className="pb-note">
        {s.experts ? (
          <>
            The outlined part of a bar is that which is required for training
            and memory, but is excluded on any "forward pass" or computed word.
          </>
        ) : null}
        Sizes are estimated at 16-bit, which is how most models are used.
      </p>
    </Card>
  );
}

function share(f: number): string {
  return f < 0.01 ? "under 1%" : `${Math.round(f * 100)}%`;
}
