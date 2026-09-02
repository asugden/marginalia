// The training rows, laid out as a table.
//
// A tree diagram is a summary of a table, and showing the table first is what
// stops the diagram from looking like a taxonomy somebody wrote down. Once you
// can see that several rows share a pattern and disagree on the answer, it is
// obvious why leaves come out impure and why the splits have to be *scored*
// rather than simply listed.

import type { Dataset } from "../shared/trees/cart.js";
import { CLASS_PALETTE } from "../shared/trees/palette.js";

export function DataTable({
  dataset,
  highlight,
}: {
  dataset: Dataset;
  /** Row ids to emphasise. */
  highlight?: Set<string>;
}) {
  const regression = dataset.classes === undefined;
  return (
    <div className="dtable">
      <table>
        <thead>
          <tr>
            <th />
            {dataset.features.map((f) => (
              <th key={f.key} className={f.noise ? "is-noise" : undefined}>
                {f.name}
                {f.unit ? <em> ({f.unit})</em> : null}
              </th>
            ))}
            <th className="dtable__target">
              {regression ? (dataset.target?.name ?? "target") : "diet"}
            </th>
          </tr>
        </thead>
        <tbody>
          {dataset.rows.map((r) => (
            <tr key={r.id} className={highlight?.has(r.id) ? "is-on" : undefined}>
              <th scope="row">{r.label}</th>
              {r.x.map((v, i) => {
                const f = dataset.features[i]!;
                return (
                  <td key={f.key} className={f.kind === "binary" ? "is-bin" : "is-num"}>
                    {f.kind === "binary" ? (v > 0.5 ? "✓" : "·") : v}
                  </td>
                );
              })}
              <td className="dtable__target">
                {regression ? (
                  r.y
                ) : (
                  <span
                    className="dtable__chip"
                    style={{ background: CLASS_PALETTE[r.y % CLASS_PALETTE.length] }}
                  >
                    {dataset.classes![r.y]}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
