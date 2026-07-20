// Tooltip — an instant, styled hover/focus label for icon-only controls.
//
// Unlike the native `title` attribute (revealed only after a long OS delay),
// this appears immediately and matches the design system. The trigger should
// carry its own `aria-label`; the bubble is decorative.
//
// Positioning: the bubble is rendered in a portal on <body> with position:
// fixed, measured against the trigger's rect, and clamped to the viewport
// (edge detection). This means it (a) never gets clipped by an ancestor's
// overflow, (b) contributes nothing to document scroll — no layout "slop" —
// and (c) is only in the DOM while shown. Wrap any focusable trigger.
//
// Styles live in ../css/Tooltip.css (imported via components.css).

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
  /** The text shown in the bubble. */
  label: string;
  /** Preferred side of the trigger. Flipped/clamped if it would overflow. */
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 8; // keep the bubble at least this far from any edge
const TRIGGER_GAP = 6; // distance between the trigger and the bubble

export function Tooltip({
  label,
  placement = "bottom",
  className = "",
  children,
}: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const t = trigger.getBoundingClientRect();
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;

    let left: number;
    let top: number;
    if (placement === "left" || placement === "right") {
      top = t.top + t.height / 2 - bh / 2;
      left = placement === "right" ? t.right + TRIGGER_GAP : t.left - bw - TRIGGER_GAP;
    } else {
      left = t.left + t.width / 2 - bw / 2;
      top = placement === "top" ? t.top - bh - TRIGGER_GAP : t.bottom + TRIGGER_GAP;
    }

    // Edge detection: clamp within the viewport so the bubble is always fully
    // visible and never pushes the page's scrollable area outward.
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - bw - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - bh - VIEWPORT_MARGIN);
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), maxLeft);
    top = Math.min(Math.max(VIEWPORT_MARGIN, top), maxTop);
    setPos({ left, top });
  }, [placement]);

  // Measure & place after the bubble mounts, and keep it pinned while open.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    reposition();
    const onReflow = () => reposition();
    // Capture scroll so ancestor scrollers (not just window) reposition it too.
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, reposition]);

  return (
    <span
      ref={triggerRef}
      className={`ds-tooltip ${className}`.trim()}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={bubbleRef}
            className="ds-tooltip__bubble"
            role="tooltip"
            aria-hidden
            // Hidden for the first frame (pos null) only long enough to measure;
            // useLayoutEffect sets pos before paint, so there is no flash.
            style={{
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
