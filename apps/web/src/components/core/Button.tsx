// Button — the primary interactive control.
//
// Variants follow the "one primary per region" rule: exactly one filled accent
// `primary` per card/section; `subtle`/`ghost` for secondary; `danger` for
// destructive (accent text, never filled).
//
// Styles live in ../css/Button.css (imported via components.css); this file is
// markup + props only. Authored against the generic token layer, so a branded
// deploy re-tints the accent automatically — no brand-specific colour literal
// appears here. Pass `href` to render an <a> styled identically (nav actions).

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Visual role. Default "primary". */
  variant?: "primary" | "subtle" | "ghost" | "danger";
  /** Size. Default "md". */
  size?: "sm" | "md" | "lg";
  /** Leading icon node (e.g. an inline SVG). */
  icon?: ReactNode;
  /** Trailing icon node. */
  iconRight?: ReactNode;
  /** Show a spinner and block interaction. */
  loading?: boolean;
  /** Disable the control. */
  disabled?: boolean;
  /** Full-width block button. */
  block?: boolean;
  /** Render as an anchor instead of a button. */
  href?: string;
  /** Button type when rendered as a <button>. Default "button". */
  type?: "button" | "submit" | "reset";
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  block = false,
  href,
  type = "button",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    "ds-btn",
    `ds-btn--${variant}`,
    size === "sm" ? "ds-btn--sm" : size === "lg" ? "ds-btn--lg" : "",
    block ? "ds-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading && <span className="ds-btn__spinner" aria-hidden="true" />}
      {!loading && icon && <span className="ds-btn__icon">{icon}</span>}
      {children && <span>{children}</span>}
      {!loading && iconRight && <span className="ds-btn__icon">{iconRight}</span>}
    </>
  );

  if (href && !disabled) {
    return (
      <a
        className={cls}
        href={href}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      className={cls}
      type={type}
      disabled={disabled || loading}
      {...rest}
    >
      {content}
    </button>
  );
}
