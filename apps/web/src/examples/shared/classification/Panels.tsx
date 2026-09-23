// The side-column pieces both classification examples share: the scoreboard,
// the data controls, and the legend. They follow the panel grammar in
// docs/style.md §14 — what the reader operates is sunken, what the figure
// reports is a white readout.

import type { ReactNode } from "react";
import { Button, Switch } from "../../../components/index.js";
import { classHue } from "../palette.js";
import type { ClassModel, Difficulty } from "./data.js";
import { formatPct } from "./plot.js";

// ── Scoreboard ──────────────────────────────────────────────────────────────

export interface ScoreRowSpec {
  name: string;
  /** Null until there is a score to show (a model not yet fitted). */
  train: number | null;
  test: number | null;
}

/** Accuracy on the points shown (train) and, once revealed, on held-out
 *  points from the same distributions (test). */
export function Scoreboard({
  rows,
  showTest,
  note,
}: {
  rows: ScoreRowSpec[];
  showTest: boolean;
  note: ReactNode;
}) {
  return (
    <div className={"cls-box cls-scores" + (showTest ? "" : " cls-scores--train")} aria-live="polite">
      <div className="cls-scores__head">
        <span className="cls-kicker">Accuracy</span>
        <span className="cls-kicker">train</span>
        {showTest && <span className="cls-kicker">test</span>}
      </div>
      {rows.map((r) => (
        <div key={r.name} className="cls-scores__row">
          <span className="cls-scores__name">{r.name}</span>
          <span className="cls-scores__val">{r.train === null ? "—" : formatPct(r.train)}</span>
          {showTest && (
            <span className="cls-scores__val cls-scores__val--test">
              {r.test === null ? "—" : formatPct(r.test)}
            </span>
          )}
        </div>
      ))}
      <p className="cls-box__note">{note}</p>
    </div>
  );
}

// ── Data controls ───────────────────────────────────────────────────────────

export const SHAPES: Array<{ key: Difficulty; label: string }> = [
  { key: "round", label: "Round" },
  { key: "tilted", label: "Tilted" },
  { key: "interleaved", label: "Interleaved" },
];

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
  layout = "inline",
}: {
  /** "inline": label left, buttons right (short choices). "fill": the label
   *  over one unwrapped row of buttons sharing the width (long ones). */
  layout?: "inline" | "fill";
  label: string;
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: (v: T) => boolean;
}) {
  return (
    <div className={`cls-choice cls-choice--${layout}`} role="group" aria-label={label}>
      <span className="cls-kicker">{label}</span>
      <div className="cls-choice__buttons">
        {options.map((o) => (
          <Button
            key={String(o.key)}
            size="sm"
            variant={o.key === value ? "primary" : "subtle"}
            aria-pressed={o.key === value}
            disabled={disabled?.(o.key)}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function DataControls({
  dim,
  onDim,
  nClasses,
  onClasses,
  shape,
  onShape,
  shapeHint,
  showTruth,
  onShowTruth,
}: {
  /** Omit to hide the features choice. */
  dim?: 1 | 2;
  onDim?: (d: 1 | 2) => void;
  /** Omit to hide the classes choice. */
  nClasses?: 2 | 3;
  onClasses?: (k: 2 | 3) => void;
  shape: Difficulty;
  onShape: (d: Difficulty) => void;
  shapeHint: ReactNode;
  showTruth: boolean;
  onShowTruth: (on: boolean) => void;
}) {
  return (
    <div className="cls-box cls-box--controls">
      {dim !== undefined && onDim && (
        <Choice
          label="Features"
          options={[
            { key: 1, label: "1" },
            { key: 2, label: "2" },
          ]}
          value={dim}
          onChange={(v) => onDim(v as 1 | 2)}
        />
      )}
      {nClasses !== undefined && onClasses && (
        <Choice
          label="Classes"
          options={[
            { key: 2, label: "2" },
            { key: 3, label: "3" },
          ]}
          value={nClasses}
          onChange={(v) => onClasses(v as 2 | 3)}
        />
      )}
      <Choice
        label="Shape"
        options={SHAPES}
        value={shape}
        onChange={onShape}
        layout="fill"
        disabled={(k) => k === "tilted" && dim === 1}
      />
      <p className="cls-box__hint">{shapeHint}</p>
      <div className="cls-box__row">
        <Switch
          label="True distributions"
          checked={showTruth}
          onChange={(e) => onShowTruth(e.target.checked)}
        />
      </div>
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────

export type LegendMark = "fill" | "yours" | "model" | "ring" | "ring-yours" | "street" | "edge";

function Glyph({ mark }: { mark: LegendMark }) {
  return (
    <svg className="cls-legend__glyph" width={22} height={12} viewBox="0 0 22 12" aria-hidden>
      {mark === "fill" && <rect x={1} y={2} width={20} height={8} rx={4} className="cls-legend__fill" />}
      {mark === "yours" && <line x1={1} y1={6} x2={21} y2={6} className="cls-legend__line" />}
      {mark === "model" && <line x1={1} y1={6} x2={21} y2={6} className="cls-legend__line cls-legend__line--model" />}
      {mark === "ring" && <circle cx={11} cy={6} r={4.5} className="cls-legend__ring" />}
      {mark === "ring-yours" && <circle cx={11} cy={6} r={4.5} className="cls-legend__ring cls-legend__ring--yours" />}
      {mark === "street" && <rect x={1} y={2} width={20} height={8} className="cls-legend__street" />}
      {mark === "edge" && <line x1={1} y1={6} x2={21} y2={6} className="cls-legend__edge" />}
    </svg>
  );
}

export function Legend({
  classes,
  marks,
}: {
  classes: ClassModel[];
  marks: Array<{ mark: LegendMark; label: string }>;
}) {
  return (
    <div className="cls-legend">
      {classes.map((c, i) => (
        <div key={c.label} className="cls-legend__row">
          <span className="cls-legend__dot" style={{ background: classHue(i) }} />
          <span>
            class <b>{c.label}</b> · {Math.round(c.prior * 100)}% of points
          </span>
        </div>
      ))}
      {marks.map((m) => (
        <div key={m.label} className="cls-legend__row">
          <Glyph mark={m.mark} />
          <span>{m.label}</span>
        </div>
      ))}
    </div>
  );
}
