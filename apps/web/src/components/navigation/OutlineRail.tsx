import type { ReactNode } from "react";

export interface OutlineStep {
  title: ReactNode;
  /** Default "upcoming". */
  status?: "done" | "current" | "upcoming";
  /** Small mono caption (e.g. "3 turns", "In progress"). */
  meta?: ReactNode;
}

export interface OutlineRailProps {
  steps: OutlineStep[];
  className?: string;
}

const Check = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 12l5 5L20 6" />
  </svg>
);

/**
 * OutlineRail — the guided-outline progress list shown in a conversation
 * sidebar. Each step is done / current / upcoming, connected by a rail that
 * fills with the accent as the student advances. This is the visible
 * representation of the backbone state machine.
 */
export function OutlineRail({ steps = [], className = "" }: OutlineRailProps) {
  return (
    <ol className={["ds-rail", className].filter(Boolean).join(" ")}>
      {steps.map((s, i) => {
        const status = s.status || "upcoming";
        return (
          <li key={i} className={`ds-rail__item ds-rail__item--${status}`}>
            <span className="ds-rail__gutter">
              <span className="ds-rail__node">
                {status === "done" ? <Check /> : i + 1}
              </span>
            </span>
            <span className="ds-rail__label">
              <span className="ds-rail__title">{s.title}</span>
              {status === "current" && (s.meta ?? true) && (
                <span className="ds-rail__meta">{s.meta || "In progress"}</span>
              )}
              {status === "upcoming" && s.meta && (
                <span className="ds-rail__meta">{s.meta}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
