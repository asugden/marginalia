// Dropdown — a fully custom (non-native) select. Replaces the browser's
// system <select> popup with a designed, token-styled menu so dropdowns match
// the rest of the design system in every browser. Controlled: pass `value`,
// `options`, and `onChange`.
//
// Styles live in ../css/Dropdown.css (imported via components.css). Authored
// against the generic token layer — no brand-specific colour literal appears.

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Optional plain-text label used when the trigger renders the selection. */
  triggerLabel?: string;
  disabled?: boolean;
}

export interface DropdownProps<T extends string = string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Shown when no option matches `value`. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** Native tooltip on the trigger (e.g. why it's disabled). */
  title?: string;
  /** Menu alignment relative to the trigger. Default "start". */
  align?: "start" | "end";
}

export function Dropdown<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  className = "",
  ariaLabel,
  title,
  align = "start",
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(v: T) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={["ds-dropdown", open ? "ds-dropdown--open" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="ds-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ds-dropdown__value">
          {selected ? selected.triggerLabel ?? selected.label : placeholder}
        </span>
        <span className="ds-dropdown__chev" aria-hidden="true">
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
      </button>
      {open && (
        <ul
          className={["ds-dropdown__menu", `ds-dropdown__menu--${align}`].join(" ")}
          role="listbox"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                disabled={o.disabled}
                className={[
                  "ds-dropdown__option",
                  o.value === value ? "ds-dropdown__option--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => pick(o.value)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
