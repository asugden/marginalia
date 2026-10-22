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
import { Link } from "react-router-dom";

/**
 * True when an href must be a full document navigation rather than a router
 * transition: a path the SPA router does not own (the worker serves /api/*
 * and /auth/* directly — CSV exports, the login redirect), or an absolute URL
 * to another origin. Everything else is an in-app route, and a plain <a>
 * there forces a full reload — re-downloading the bundle, re-running every
 * bootstrap fetch, and dropping in-memory state — for a navigation the router
 * does in place. Exported for IconButton, which applies the same rule.
 */
export function isDocumentHref(href: string): boolean {
  return !href.startsWith("/") || /^\/(api|auth)\//.test(href);
}

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
  /** Render as an anchor instead of a button. In-app paths navigate through
   *  the router (no reload); /api/*, /auth/*, other origins, and anchors with
   *  target/download stay real document navigations. */
  href?: string;
  /** Force a full document load even for an in-app path. The 404/error page
   *  uses this: after a failed chunk load, only a reload gets a fresh bundle. */
  reloadDocument?: boolean;
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
  reloadDocument = false,
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
    const anchorProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    const documentNav =
      reloadDocument ||
      isDocumentHref(href) ||
      anchorProps.target !== undefined ||
      anchorProps.download !== undefined;
    if (!documentNav) {
      return (
        <Link className={cls} to={href} {...anchorProps}>
          {content}
        </Link>
      );
    }
    return (
      <a className={cls} href={href} {...anchorProps}>
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
