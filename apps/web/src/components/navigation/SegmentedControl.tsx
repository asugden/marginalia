import type { ReactNode } from "react";

export type SegmentOption =
  | string
  | { value: string; label: ReactNode; count?: number };

export interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}

/**
 * SegmentedControl — a small one-of-N switch (Sources/Outline/Settings tabs,
 * Students/Authors). The active pill sits on the surface in the accent; inactive
 * options stay flush so the group reads as one unit, never competing buttons.
 */
export function SegmentedControl({
  options = [],
  value,
  onChange,
  className = "",
}: SegmentedControlProps) {
  return (
    <div
      className={["ds-seg", className].filter(Boolean).join(" ")}
      role="tablist"
    >
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const count = typeof opt === "object" ? opt.count : undefined;
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            className={["ds-seg__btn", active ? "ds-seg__btn--active" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange?.(v)}
          >
            {label}
            {count != null && <span className="ds-seg__count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
