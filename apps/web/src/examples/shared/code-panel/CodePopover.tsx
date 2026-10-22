// One code box, popped over the figure beside the part it builds.
//
// Only one box is ever open, so the program is never on screen as a whole,
// and the reader reaches each piece by pointing at the part of the figure
// they want explained. While a box is open the page keeps that part lit and
// dims the rest (see regionsLitBy).
//
// When several boxes sit over the same part, the popover pages between
// them. Escape, the close button, or a press anywhere outside closes it;
// the page also opens it on hover and closes it when the pointer leaves.

import { useEffect, useRef, type CSSProperties } from "react";
import { Button } from "../../../components/index.js";
import { highlightPython, renderProse } from "./highlight.js";
import type { CodeSection } from "./types.js";

export interface CodePopoverProps {
  /** The boxes for the chosen part, in order; one is shown at a time. */
  sections: CodeSection[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Placement, from the page (it knows where the part is). */
  style?: CSSProperties;
  className?: string;
  /** Hover-open: the page keeps the popover up while the pointer is on it. */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

/** The regions an open (or hovered) section lights in the figure. */
export function regionsLitBy(section: CodeSection | undefined): Set<string> | null {
  if (!section) return null;
  return new Set([...section.over, ...(section.alsoLights ?? [])]);
}

export function CodePopover({
  sections,
  index,
  onIndex,
  onClose,
  style,
  className = "",
  onPointerEnter,
  onPointerLeave,
}: CodePopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const s = sections[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // A press outside closes. Markers and figure parts reopen on their own
    // click, which lands after this, so moving between parts is one click.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  if (!s) return null;
  const many = sections.length > 1;

  return (
    <div
      ref={ref}
      className={`ex-pop ${className}`}
      style={style}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      role="dialog"
      aria-label={s.title}
    >
      <div className="ex-pop__head">
        <h3 className="ex-pop__title">{s.title}</h3>
        {many && (
          <span className="ex-pop__pager">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Previous"
              title="Previous"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              ‹
            </Button>
            {index + 1}/{sections.length}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Next"
              title="Next"
              disabled={index === sections.length - 1}
              onClick={() => onIndex(index + 1)}
            >
              ›
            </Button>
          </span>
        )}
        <Button variant="ghost" size="sm" aria-label="Close" title="Close" onClick={onClose}>
          ×
        </Button>
      </div>
      {/* One row per line so a long line wraps with a hanging indent: the
          continuation sits indented under its own line instead of reading
          as a new line of code. Leading spaces stay as the line's indent. */}
      <pre className="ex-pop__src">
        <code>
          {s.code
            .replace(/^\s*\n|\n\s*$/g, "")
            .split("\n")
            .map((line, i) => {
              const indent = line.length - line.trimStart().length;
              return (
                <span
                  key={i}
                  className="ex-pop__line"
                  style={{ paddingLeft: `${indent + 2}ch`, textIndent: "-2ch" }}
                >
                  {line.trim() ? highlightPython(line.trimStart()) : "\u00a0"}
                </span>
              );
            })}
        </code>
      </pre>
      {s.shape && <div className="ex-pop__shape">{s.shape}</div>}
      <div className="ex-pop__explain">{renderProse(s.explain)}</div>
    </div>
  );
}
