import * as React from "react";

// Message / ThinkingDots — one chat turn and the streaming indicator.
//
// `user` renders a warm accent bubble (right-flush); `assistant` renders as
// full-measure prose with a mono role label; `system` is a quiet inset note.
// Pass already-rendered children (e.g. Markdown). Styles live in the
// ds-prefixed CSS partial (components/css/Message.css); nothing is injected at
// runtime.

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: "user" | "assistant" | "system";
  /** Override the mono role label ("You" / "Agent"). */
  roleLabel?: React.ReactNode;
  /** Play a one-shot rise+fade on mount (live chat only — off for static views). */
  enter?: boolean;
  children?: React.ReactNode;
}

export function Message({
  role = "assistant",
  roleLabel,
  enter = false,
  children,
  className = "",
  ...rest
}: MessageProps) {
  const label =
    roleLabel ?? (role === "assistant" ? "Agent" : role === "user" ? "You" : null);
  const cls = ["ds-msg", `ds-msg--${role}`, enter ? "ds-msg--enter" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      {role !== "system" && label && <div className="ds-msg__role">{label}</div>}
      <div className="ds-msg__body">{children}</div>
    </div>
  );
}

export interface ThinkingDotsProps extends React.HTMLAttributes<HTMLSpanElement> {}

/** ThinkingDots — three blinking accent dots for a streaming/"thinking" turn. */
export function ThinkingDots({ className = "", ...rest }: ThinkingDotsProps) {
  const cls = ["ds-dots", className].filter(Boolean).join(" ");
  return (
    <span className={cls} aria-label="Thinking" {...rest}>
      <span />
      <span />
      <span />
    </span>
  );
}
