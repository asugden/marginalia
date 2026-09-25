// The mobile navigation sheet — everything the header can't show on a phone.
//
// Below 680px the topbar used to WRAP to two rows: the lockup + switcher on
// top, the nav as a horizontal scroll strip beneath. That cost ~110px of a
// ~667px viewport (a quarter of the screen, once the preview banner is up) and
// hid the tail of the nav behind a scrollbar that `scrollbar-width: none` had
// made invisible. Destinations you cannot see are destinations you do not have.
//
// So mobile is a different shell, not the desktop bar squeezed: ONE 56px row
//
//     [☰]  Wordmark            [role ▾] [⏻]
//
// and this sheet holds the rest — the course switcher's destinations and every
// nav item, expanded as a flat, fully visible list. Nothing scrolls sideways,
// nothing is hidden behind an affordance the user can't see.
//
// It's presentation-only: the host passes the sections to render and where each
// row goes. That keeps it usable by both shells, whose navs differ (the
// instructor's is banded; the student's is a flat module list).

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export interface NavSheetRow {
  key: string;
  label: string;
  /** Optional one-line explanation, shown under the label. */
  detail?: string;
  to: string;
  active?: boolean;
}

export interface NavSheetSection {
  key: string;
  /** Mono eyebrow above the group. Omit for an ungrouped leading block. */
  title?: string;
  rows: NavSheetRow[];
}

export interface NavSheetProps {
  open: boolean;
  onClose: () => void;
  sections: NavSheetSection[];
}

export function NavSheet({ open, onClose, sections }: NavSheetProps) {
  const navigate = useNavigate();

  // Escape closes. Also lock the body while the sheet is up so the page behind
  // it doesn't scroll under the overlay on touch.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="app-sheet" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        className="app-sheet__scrim"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="app-sheet__panel">
        {sections.map((s) => (
          <div key={s.key} className="app-sheet__group">
            {s.title && <div className="app-sheet__eyebrow">{s.title}</div>}
            {s.rows.map((r) => (
              <button
                key={r.key}
                type="button"
                className={
                  "app-sheet__row" + (r.active ? " app-sheet__row--active" : "")
                }
                onClick={() => {
                  onClose();
                  navigate(r.to);
                }}
              >
                <b>{r.label}</b>
                {r.detail && <span>{r.detail}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
