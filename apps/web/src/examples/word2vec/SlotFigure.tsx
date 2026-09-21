// The distributional hypothesis, as a figure rather than a sentence about a
// figure.
//
// One frame with a gap in it, and the candidate words living *inside* that
// gap: a vertical reel that scrolls through the blank, so the word being
// tested is always sitting in the position it is being tested for. Dragging
// the reel is dragging the word through the slot.
//
// Some candidates land and the sentence reads as English; some do not. The
// words that fit the same slot turn out to be the words that mean similar
// things — which is the whole linguistic premise underneath every word
// embedding, and it is something a student can *see* by dragging rather than
// be told in a paragraph.
//
// Nothing here consults the embedding table. That is deliberate: this box is
// the idea from linguistics, and it has to stand before any model appears. The
// verdicts are a property of the frame, written alongside it.

import { useCallback, useEffect, useRef } from "react";

export interface Candidate {
  word: string;
  /** Does the sentence still read as English with this word in the slot? */
  fits: boolean;
}

export interface Frame {
  /** Text before the gap. */
  before: string;
  /** Text after the gap. */
  after: string;
  candidates: Candidate[];
}

interface Props {
  frame: Frame;
  /** Index of the candidate currently sitting in the slot. */
  selected: number;
  onSelect: (i: number) => void;
}

// One reel row. All the candidates are visible at once — the column is the
// figure, and hiding four of five behind a one-row window would turn it back
// into a mystery control.
const ROW_H = 38;

export function SlotFigure({ frame, selected, onSelect }: Props) {
  const reelRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ y: 0, index: 0 });

  // Dragging moves the reel by whole rows relative to where the drag began,
  // which keeps the word under the pointer instead of jumping to wherever the
  // pointer happens to be inside the window.
  const pickFromDrag = useCallback(
    (clientY: number) => {
      const delta = clientY - dragStart.current.y;
      const steps = Math.round(-delta / ROW_H);
      const next = dragStart.current.index + steps;
      onSelect(Math.max(0, Math.min(frame.candidates.length - 1, next)));
    },
    [frame.candidates.length, onSelect],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      pickFromDrag(e.clientY);
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [pickFromDrag]);

  const current = frame.candidates[selected];

  return (
    <div className="w2v-slot">
      {/* The sentence is fixed. The candidate column sits INSIDE it, at the
          gap, positioned so the selected word lands exactly on the sentence's
          line — the other options hang above and below, overlaying the box.
          Dragging slides the column through the sentence. */}
      <div
        className="w2v-slot__frame"
        style={{
          // The sentence sits at the frame's centre. With the first candidate
          // selected the column hangs fully below it; with the last, fully
          // above. Reserving the column height on each side means the frame
          // never clips and the sentence never moves — at the cost of some
          // quiet space, which is what keeps the gesture legible.
          paddingTop: (frame.candidates.length - 1) * ROW_H + 14,
          paddingBottom: (frame.candidates.length - 1) * ROW_H + 14,
        }}
      >
        <span className="w2v-slot__text">{frame.before}</span>

        <span className="w2v-slot__gap">
          <span
            className={`w2v-slot__reel${
              current?.fits
                ? " w2v-slot__reel--fits"
                : " w2v-slot__reel--misfits"
            }`}
            ref={reelRef as React.RefObject<HTMLDivElement>}
            style={{
              // Shift the column so row `selected` sits on the sentence line.
              // Measured from the column's centre, so the overhang is never
              // more than half the column in either direction.
              transform: `translateY(${-selected * ROW_H - ROW_H / 2}px)`,
            }}
            role="listbox"
            aria-label="candidate words for the gap"
            tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault();
              dragging.current = true;
              dragStart.current = { y: e.clientY, index: selected };
            }}
            onWheel={(e) => {
              if (Math.abs(e.deltaY) < 2) return;
              onSelect(
                Math.max(
                  0,
                  Math.min(
                    frame.candidates.length - 1,
                    selected + (e.deltaY > 0 ? 1 : -1),
                  ),
                ),
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                onSelect(Math.min(frame.candidates.length - 1, selected + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                onSelect(Math.max(0, selected - 1));
              }
            }}
          >
            {frame.candidates.map((c, i) => (
              <span
                key={c.word}
                className={`w2v-slot__word${
                  i === selected ? " w2v-slot__word--on" : ""
                }${c.fits ? " w2v-slot__word--fits" : ""}`}
                style={{ height: ROW_H }}
                role="option"
                aria-selected={i === selected}
                onClick={() => onSelect(i)}
              >
                {c.word}
              </span>
            ))}
          </span>
        </span>

        <span className="w2v-slot__text">{frame.after}</span>
      </div>

      <div className="w2v-slot__footer">
        <span
          className={`w2v-slot__verdict${
            current?.fits ? " w2v-slot__verdict--fits" : ""
          }`}
        >
          {current?.fits ? "valid replacement" : "invalid replacement"}
        </span>
      </div>
    </div>
  );
}
