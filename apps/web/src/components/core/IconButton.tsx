// IconButton — a square, icon-only control for toolbars and headers.
//
// Ported from the design-system source. Styles live in
// ../css/IconButton.css (imported by components.css); we do NOT inject a
// <style> tag at runtime. Always pass a `title` — it serves as both the
// tooltip and the accessible label for the icon-only control.

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type CommonProps = {
  /** Visual role. Default "ghost". "round" = bordered circle, "primary" = filled accent. */
  variant?: "ghost" | "round" | "primary";
  size?: "sm" | "md" | "lg";
  /** Tooltip + accessible label. Required for icon-only controls. */
  title: string;
  /** Render as an anchor. */
  href?: string;
  disabled?: boolean;
  className?: string;
  /** The icon node (inline SVG). */
  children?: ReactNode;
};

export type IconButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "children"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "title" | "children" | "href">;

export function IconButton({
  variant = "ghost",
  size = "md",
  title,
  href,
  disabled = false,
  className = "",
  children,
  ...rest
}: IconButtonProps) {
  const cls = [
    "ds-iconbtn",
    variant === "round" ? "ds-iconbtn--round" : "",
    variant === "primary" ? "ds-iconbtn--primary" : "",
    size === "sm" ? "ds-iconbtn--sm" : size === "lg" ? "ds-iconbtn--lg" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href && !disabled) {
    return (
      <a className={cls} href={href} title={title} aria-label={title} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button
      className={cls}
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
