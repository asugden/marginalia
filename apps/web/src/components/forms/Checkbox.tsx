import type { InputHTMLAttributes, ReactNode } from "react";

/** Checkbox — labelled boolean with an optional description line. */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  /** Secondary description under the label. */
  description?: ReactNode;
}

/** Switch — labelled on/off toggle for settings. */
export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

const CheckMark = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 12l5 5L20 6" />
  </svg>
);

/** Checkbox — labelled boolean with an optional description line. */
export function Checkbox({
  label,
  description,
  disabled = false,
  className = "",
  ...rest
}: CheckboxProps) {
  return (
    <label
      className={["ds-check", disabled ? "ds-check--disabled" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <input type="checkbox" disabled={disabled} {...rest} />
      <span className="ds-check__box">
        <CheckMark />
      </span>
      {(label || description) && (
        <span className="ds-check__text">
          {label}
          {description && <small>{description}</small>}
        </span>
      )}
    </label>
  );
}

/** Switch — labelled on/off toggle. Use for settings, not form submission. */
export function Switch({
  label,
  disabled = false,
  className = "",
  ...rest
}: SwitchProps) {
  return (
    <label className={["ds-switch", className].filter(Boolean).join(" ")}>
      <input type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="ds-switch__track">
        <span className="ds-switch__thumb" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
