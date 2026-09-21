// Every one of these problems is one sheet. Feature columns, exactly one label
// column, one row per thing you are predicting.
//
// The sheet has two states, and the button between them is the whole lesson:
// what you *collected* is not what a model can *read*. Press it and the raw
// columns become numeric ones in place — "14s" becomes 14.0, "phone" becomes a
// true/false is_mobile — so the change is visible as a change rather than as a
// second table to compare against.
//
// The train/test split is drawn as one table divided, not two tables, because
// the rows differ in exactly one respect: whether the label is filled in.

import { useState } from "react";

export interface Column {
  /** Header in the raw, as-collected state. */
  raw: string;
  /** Header once transformed into something a model can read. */
  feature: string;
  /** Whether this column changes at all. */
  changes: boolean;
}

export interface Row {
  /** Cells in the raw state, parallel to COLUMNS. */
  raw: string[];
  /** Cells once transformed. */
  feature: string[];
  /** The label, or null for test rows. */
  label: string | null;
}

interface Props {
  columns: Column[];
  label: string;
  rows: Row[];
  /** How many rows belong to the training block. */
  trainCount: number;
}

export function SheetFigure({ columns, label, rows, trainCount }: Props) {
  const [asFeatures, setAsFeatures] = useState(false);

  return (
    <div className="ovw-sheet-block">
      <div className="ovw-sheet-bar">
        <button
          type="button"
          className={`ovw-toggle${asFeatures ? " is-on" : ""}`}
          onClick={() => setAsFeatures((v) => !v)}
          aria-pressed={asFeatures}
        >
          {asFeatures ? "← back to data" : "turn data into features →"}
        </button>
        <span className="ovw-sheet-bar__state">
          {asFeatures
            ? "features — every column is a number a model can read"
            : "data — as you collected it"}
        </span>
      </div>

      <div className="ovw-sheet-wrap">
        <table className="ovw-sheet">
          <caption className="ovw-sheet__caption">
          One row per thing you are predicting. Many feature columns, exactly one
          label column.
        </caption>
        <thead>
            <tr>
              <th scope="col" className="ovw-sheet__rownum" aria-label="row" />
              {columns.map((c) => (
                <th
                  key={c.raw}
                  scope="col"
                  className={`ovw-sheet__feat${asFeatures && c.changes ? " is-changed" : ""}`}
                >
                  {asFeatures ? c.feature : c.raw}
                </th>
              ))}
              <th scope="col" className="ovw-sheet__label">
                {label}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => {
              const cells = asFeatures ? r.feature : r.raw;
              const firstTest = i === trainCount;
              return (
                <tr key={i} className={firstTest ? "ovw-sheet__split" : undefined}>
                  <td className="ovw-sheet__rownum">{i + 1}</td>
                  {cells.map((cell, j) => (
                    <td
                      key={j}
                      className={`ovw-sheet__feat${
                        asFeatures && columns[j]?.changes ? " is-changed" : ""
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                  <td
                    className={`ovw-sheet__label${
                      r.label === null ? " ovw-sheet__label--want" : ""
                    }`}
                  >
                    {r.label ?? "?"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* The two bands, named beside the sheet so the split reads as one
            table divided rather than two unrelated tables. */}
        <div className="ovw-bands" aria-hidden="true">
          <div className="ovw-band ovw-band--train">
            <span>training</span>
            <em>labels you have</em>
          </div>
          <div className="ovw-band ovw-band--test">
            <span>testing</span>
            <em>labels you want</em>
          </div>
        </div>
      </div>
    </div>
  );
}
