// Select — a styled native <select> dropdown with a system chevron. Pass
// <option>s as children.
//
// Styles live in ../css/Select.css (imported via components.css); this file is
// markup + props only. Authored against the generic token layer, so a branded
// deploy re-tints the focus ring via the accent override — no brand-specific
// colour literal appears here.

import type { ReactNode, SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children?: ReactNode;
}

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <span className="ds-select-wrap">
      <select className={["ds-select", className].filter(Boolean).join(" ")} {...rest}>
        {children}
      </select>
      <span className="ds-select-wrap__chev" aria-hidden="true">
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path
            d="M1 1l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}
