import type { InputHTMLAttributes, ReactNode } from "react";

/** RadioCardGroup — responsive grid wrapper for RadioCards. */
export interface RadioCardGroupProps {
  /** Tighter columns for short options. */
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

/** RadioCard — selectable card for agent / model / mode pickers. */
export interface RadioCardProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  selected?: boolean;
  name?: string;
  value?: string;
}

/** RadioCardGroup — layout wrapper for a set of RadioCards. */
export function RadioCardGroup({
  inline = false,
  className = "",
  children,
}: RadioCardGroupProps) {
  return (
    <div
      className={[
        "ds-radiocards",
        inline ? "ds-radiocards--inline" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="radiogroup"
    >
      {children}
    </div>
  );
}

/**
 * RadioCard — a selectable card for agent / model / mode pickers. Shows a
 * title, optional description, and an accent tick when selected.
 */
export function RadioCard({
  title,
  description,
  selected = false,
  name,
  value,
  onChange,
  className = "",
  ...rest
}: RadioCardProps) {
  return (
    <label
      className={[
        "ds-radiocard",
        selected ? "ds-radiocard--selected" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onChange}
        {...rest}
      />
      <span className="ds-radiocard__title">
        {title}
        <span className="ds-radiocard__tick" aria-hidden="true" />
      </span>
      {description && <span className="ds-radiocard__desc">{description}</span>}
    </label>
  );
}
