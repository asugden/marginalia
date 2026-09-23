// The next-word slot: the word2vec example's substitution reel, turned to
// generation.
//
// The text so far sits on one line with a gap at its end. The candidates for
// the gap hang in a column through it, each with its probability to the
// right. Drawing a word is a lottery: the column holds still while a box
// jumps from word to word and slows; once it stops, the column slides so the
// drawn word sits in the gap. The words the next choice depends on, the
// current state, are underlined and named in purple.
//
// Stepping and rolling live in useWalk (walk.ts); this only draws.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "../../components/index.js";
import type { Phase } from "./walk.js";

export interface ReelOption {
  label: string;
  p: number;
  /** A quiet second line: a token's ID. */
  sub?: string;
}

interface Props {
  /** The text so far, one entry per word or token, spacing included. */
  words: string[];
  /** How many words at the end are the current state. */
  stateSize: number;
  stateLabel: string;
  options: ReelOption[] | null;
  /** The row the box is on, while rolling or once drawn. */
  onLine: number | null;
  landed: boolean;
  /** Step and reset, drawn in the frame's top-left corner. */
  controls?: ReactNode;
  /** A line under the figure (what the options leave out). */
  footer?: string;
}

const ROW_H = 38;
const MAX_ROWS = 5;

export function pct(p: number): string {
  if (p >= 0.995) return "100%";
  if (p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export function NextWordReel({ words, stateSize, stateLabel, options, onLine, landed, controls, footer }: Props) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const box = textRef.current;
      const inner = innerRef.current;
      if (box && inner) setClipped(inner.offsetWidth > box.clientWidth + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [words]);

  const n = options?.length ?? 0;
  // The column stays centred on the line until the draw is over.
  const at = landed && onLine !== null ? onLine : (n - 1) / 2;
  const cut = Math.max(0, words.length - stateSize);
  // A leading space belongs to the text before the underline, not under it.
  const joined = words.slice(cut).join("");
  const lead = joined.length - joined.trimStart().length;
  const before = words.slice(0, cut).join("") + joined.slice(0, lead);
  const state = joined.slice(lead);

  return (
    <div className="lm-reel">
      <div
        className="lm-reel__frame"
        style={{ paddingTop: (MAX_ROWS - 1) * ROW_H + 14, paddingBottom: (MAX_ROWS - 1) * ROW_H + 14 }}
      >
        {controls && <div className="lm-reel__controls">{controls}</div>}
        <span ref={textRef} className={`lm-reel__text${clipped ? " lm-reel__text--clipped" : ""}`}>
          <span ref={innerRef} className="lm-reel__inner">
            {before && <span className="lm-reel__before">{before}</span>}
            {state && (
              <span className="lm-reel__state">
                {state}
                <span className="lm-reel__statelabel">{stateLabel}</span>
              </span>
            )}
          </span>
        </span>

        <span className="lm-reel__gap" aria-live="polite">
          <span className="lm-reel__slot" aria-hidden="true">
            {n === 0 ? "?" : ""}
          </span>
          {options && (
            <span
              className={`lm-reel__column${landed ? " lm-reel__column--landed" : ""}`}
              style={{ transform: `translateY(${-at * ROW_H - ROW_H / 2}px)` }}
              role="list"
              aria-label="possible next words and their probabilities"
            >
              {onLine !== null && (
                <span
                  className="lm-reel__box"
                  style={{ transform: `translateY(${onLine * ROW_H}px)`, height: ROW_H }}
                  aria-hidden="true"
                />
              )}
              {options.map((o, i) => {
                const on = landed && onLine === i;
                return (
                  <span
                    key={`${o.label}-${i}`}
                    role="listitem"
                    className={`lm-reel__row${on ? " lm-reel__row--on" : ""}${landed && !on ? " lm-reel__row--dim" : ""}`}
                    style={{ height: ROW_H }}
                  >
                    <span className="lm-reel__word">
                      {o.label}
                      {o.sub && <span className="lm-reel__sub">{o.sub}</span>}
                    </span>
                    <span className="lm-reel__bar">
                      <span className="lm-reel__fill" style={{ width: `${Math.max(1.5, o.p * 100)}%` }} />
                    </span>
                    <span className="lm-reel__pct">{pct(o.p)}</span>
                  </span>
                );
              })}
            </span>
          )}
        </span>
      </div>
      {footer && <p className="lm-reel__footer">{footer}</p>}
    </div>
  );
}

/** Step and reset, as icons. The step's tooltip says what it will do next. */
export function WalkControls({
  phase,
  onAdvance,
  onReset,
  startTitle = "Show the next words",
}: {
  phase: Phase;
  onAdvance: () => void;
  onReset: () => void;
  startTitle?: string;
}) {
  const next =
    phase === "start"
      ? startTitle
      : phase === "options"
        ? "Draw a word"
        : phase === "landed"
          ? "Add it to the text"
          : "";
  return (
    <>
      <IconButton
        variant="primary"
        size="sm"
        title={next ? `Next step: ${next}` : "Next step"}
        onClick={onAdvance}
        disabled={phase === "rolling" || phase === "done"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 2.5 L10.5 8 L3.5 13.5 Z" fill="currentColor" />
          <rect x="11.5" y="2.5" width="2" height="11" rx="0.5" fill="currentColor" />
        </svg>
      </IconButton>
      <IconButton size="sm" className="lm-iconbtn--outline" title="Start over" onClick={onReset} disabled={phase === "start"}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8a5 5 0 1 0 1.6-3.7" />
          <path d="M3 2.5v3.2h3.2" />
        </svg>
      </IconButton>
    </>
  );
}
