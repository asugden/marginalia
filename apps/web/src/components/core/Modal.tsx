// Modal — the design-system dialog shell: a dimmed backdrop over a centered,
// raised card. Use this (never the native confirm/alert or an ad-hoc scrim) for
// any blocking overlay. Closes on backdrop click and Escape unless `busy`.
//
// Styles live in ../components.css (.ds-modal-*). Authored against the generic
// token layer — no brand-specific colour literal appears.

import { useEffect, type ReactNode } from "react";

export interface ModalProps {
  /** Accessible dialog label; also rendered as the heading when `title` set. */
  title?: string;
  /** When true, backdrop-click and Escape do not close the modal. */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Max width of the card, e.g. "34rem". */
  maxWidth?: string;
}

export function Modal({ title, busy = false, onClose, children, maxWidth }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div className="ds-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="ds-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
