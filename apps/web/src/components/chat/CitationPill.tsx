import * as React from "react";

/** CitationPill — an inline numbered source reference, e.g. [1]. */
export interface CitationPillProps extends React.HTMLAttributes<HTMLElement> {
  /** The displayed ordinal. */
  n: React.ReactNode;
  /** Source URL; omit or set disabled for unlinked. */
  href?: string;
  disabled?: boolean;
}

export function CitationPill({
  n,
  href,
  disabled = false,
  className = "",
  ...rest
}: CitationPillProps) {
  const cls = ["ds-cite", disabled ? "ds-cite--disabled" : "", className]
    .filter(Boolean)
    .join(" ");
  if (href && !disabled) {
    return (
      <a
        className={cls}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {n}
      </a>
    );
  }
  return (
    <span className={cls} {...rest}>
      {n}
    </span>
  );
}

export interface SourceItem {
  ordinal?: number;
  filename: string;
  href?: string;
}

/** SourcesStrip — the compact list of cited sources under an assistant turn. */
export interface SourcesStripProps {
  sources?: SourceItem[];
  className?: string;
}

export function SourcesStrip({ sources = [], className = "" }: SourcesStripProps) {
  return (
    <div className={["ds-sources", className].filter(Boolean).join(" ")}>
      <span className="ds-sources__label">Sources</span>
      {sources.map((s, i) => (
        <span key={s.ordinal ?? i}>
          <a className="ds-sources__item" href={s.href || undefined}>
            <span className="ds-cite" style={{ pointerEvents: "none" }}>
              {s.ordinal ?? i + 1}
            </span>{" "}
            {s.filename}
          </a>
          {i < sources.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  );
}
