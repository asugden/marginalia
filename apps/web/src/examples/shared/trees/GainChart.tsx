// The candidate chart: every feature the split search considered at one node,
// scored, with the losers left in.
//
// This is the component the tree examples exist for. A finished tree diagram
// shows which question won and hides the competition, which makes the sequence
// of questions look like a ranked list of features chosen up front. Scoring all
// the candidates at every node shows the truth instead: the ranking is
// recomputed from scratch on whatever rows reached this node, and it comes out
// differently on different branches.
//
// Features stay in dataset order rather than sorted by score, so the bars sit
// in the same place at every node and a student can see the ordering change.

import { useMemo } from "react";
import { searchSplits, splitQuestion, type Criterion, type Dataset, type Row } from "./cart.js";
import { GAIN_BAR, GAIN_BAR_NOISE, GAIN_BAR_WIN } from "./palette.js";

export interface GainChartProps {
  dataset: Dataset;
  rows: Row[];
  criterion: Criterion;
  nClasses: number;
  title?: string;
  /** Hide which bar won until the student has committed to a guess. */
  hideWinner?: boolean;
  /** Let the student nominate a feature; highlights their pick. */
  onPick?: (featureIndex: number) => void;
  picked?: number | null;
  /** Restrict to these features, as a random forest does at every node. */
  featureSubset?: number[];
}

export function GainChart({
  dataset,
  rows,
  criterion,
  nClasses,
  title,
  hideWinner = false,
  onPick,
  picked = null,
  featureSubset,
}: GainChartProps) {
  const search = useMemo(
    () => searchSplits(rows, dataset.features, { criterion, nClasses, featureSubset }),
    [rows, dataset.features, criterion, nClasses, featureSubset],
  );
  const peak = Math.max(
    1e-9,
    ...search.candidates.map((c) => (c.best ? c.best.gain : 0)),
  );

  return (
    <div className="gain">
      <div className="gain__head">
        <span className="gain__title">{title ?? "Which question wins here?"}</span>
        <span className="gain__n">
          {rows.length} rows · impurity {search.impurity.toFixed(3)}
        </span>
      </div>

      <ul className="gain__list">
        {search.candidates.map((c) => {
          const f = dataset.features[c.featureIndex]!;
          const gain = c.best?.gain ?? 0;
          const isWinner = !hideWinner && search.winner === c.featureIndex;
          const isPick = picked === c.featureIndex;
          const color = c.exhausted
            ? GAIN_BAR_NOISE
            : isWinner
              ? GAIN_BAR_WIN
              : f.noise
                ? GAIN_BAR_NOISE
                : GAIN_BAR;
          return (
            <li
              key={f.key}
              className={
                "gain__row" +
                (isWinner ? " is-winner" : "") +
                (isPick ? " is-picked" : "") +
                (c.exhausted ? " is-exhausted" : "") +
                (onPick ? " is-pickable" : "")
              }
              onClick={onPick ? () => onPick(c.featureIndex) : undefined}
            >
              <span className="gain__name">
                {f.name}
                {f.noise && <em className="gain__tag">noise</em>}
              </span>
              <span className="gain__track">
                <span
                  className="gain__fill"
                  style={{
                    width: `${c.exhausted ? 0 : (gain / peak) * 100}%`,
                    background: color,
                  }}
                />
              </span>
              <span className="gain__val">
                {c.exhausted ? "used up" : gain.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>

      {!hideWinner && search.winner >= 0 && (
        <p className="gain__verdict">
          {search.tied ? (
            <>
              <b>It is a tie.</b> Several questions score exactly the same, so
              nothing in the data prefers one of them — the tree takes the first
              and the order you see is an accident of implementation.
            </>
          ) : (
            <>
              Winner: <b>{splitQuestion(
                dataset.features[search.winner]!,
                search.candidates[search.winner]!.best!.threshold,
              )}</b>
            </>
          )}
        </p>
      )}
      {!hideWinner && search.winner < 0 && (
        <p className="gain__verdict">
          <b>No question helps.</b> Every candidate scores zero, so the search
          stops here and this node becomes a leaf.
        </p>
      )}
    </div>
  );
}
