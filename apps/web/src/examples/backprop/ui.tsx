// Small pieces every backprop panel shares: the §14 panel frame, a readout,
// lines of working, and number formatting.

import type { ReactNode } from "react";
import { Card } from "../../components/index.js";
import { renderProse } from "../shared/code-panel/highlight.js";

/** A number for display: at most `dp` decimals, trailing zeros dropped, and
 *  a true minus sign. Rounds away float noise (0.9999999 → 1). */
export function fmt(v: number, dp = 4): string {
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  const fixed = (Object.is(r, -0) ? 0 : r).toFixed(dp);
  const s = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return s.replace("-", "−");
}

/** A number in parentheses when negative, for use inside a product. */
export function fmtIn(v: number, dp = 4): string {
  return v < 0 ? `(${fmt(v, dp)})` : fmt(v, dp);
}

/** The ink class for a computed value's sign (docs/style.md §11). */
export function signClass(v: number): string {
  return v > 0 ? "bp-pos" : v < 0 ? "bp-neg" : "";
}

export function Panel({
  title,
  standfirst,
  note,
  children,
}: {
  title: string;
  standfirst: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Card className="bp-panel" padding="md">
      <h2 className="bp-h2">{title}</h2>
      <div className="bp-sub">{renderProse(standfirst)}</div>
      {children}
      {note && <div className="bp-note">{renderProse(note)}</div>}
    </Card>
  );
}

export function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bp-readout">
      <span className="bp-kicker">{label}</span>
      {children}
    </div>
  );
}

/** Lines of arithmetic, one per row, in mono. */
export function Working({ lines }: { lines: ReactNode[] }) {
  return (
    <div className="bp-working">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}
