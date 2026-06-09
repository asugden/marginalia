// Avatar — a person or agent identity chip. Shows an image, explicit initials,
// or auto-derived initials with a deterministic warm tint. `agent` paints it in
// the accent colour for the assistant/agent identity.
//
// Styles live in ../css/Avatar.css (imported via components.css); we do not
// inject a <style> tag at runtime.

import type { HTMLAttributes, CSSProperties } from "react";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Display name — used for initials, tint hashing, and the title tooltip. */
  name?: string;
  /** Image URL; overrides initials. */
  src?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Render in the accent colour as the agent/assistant identity. */
  agent?: boolean;
  /** Add a separating ring (for overlapping stacks). */
  ring?: boolean;
}

// Deterministic warm tints for person avatars (neutral, not brand-derived).
const TONES: [string, string][] = [
  ["#e3f0e6", "#1d5836"],
  ["#e2ebf6", "#1c4474"],
  ["#fbeed1", "#7a4f06"],
  ["#f5dad8", "#8b1a1a"],
  ["#ece5da", "#57514a"],
];

function toneFor(name = ""): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
}

function initials(name = ""): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({
  name = "",
  src,
  size = "md",
  agent = false,
  ring = false,
  className = "",
  style,
  ...rest
}: AvatarProps) {
  const cls = [
    "ds-avatar",
    size !== "md" ? `ds-avatar--${size}` : "",
    agent ? "ds-avatar--agent" : "",
    ring ? "ds-avatar--ring" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const auto = !src && !agent ? toneFor(name) : null;
  const st: CSSProperties | undefined = auto
    ? { background: auto[0], color: auto[1], ...style }
    : style;
  return (
    <span className={cls} style={st} title={name || undefined} {...rest}>
      {src ? <img src={src} alt={name} /> : initials(name)}
    </span>
  );
}
