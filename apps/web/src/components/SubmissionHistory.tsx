// The "Your submissions" block of a submit dialog: when each previous version
// went in, exact time first, recency second. Shared by the writing and code
// submit modals so a student sees the identical surface in both tools; the
// callers differ only in what a row is (a snapshot token vs a notebook
// submission), which arrives here already flattened.
//
// Class names are the writing tool's (`prov-submit-*`) because that's where
// the surface was born; the code module already reuses the prov-* shell
// classes the same way.

import type { ReactNode } from "react";
import { SubLabel } from "./layout/Section.js";
import { absoluteTime, relativeTime } from "../time.js";

export interface SubmissionHistoryRow {
  /** Stable row identity (submission id, snapshot token). */
  key: string;
  /** When it was submitted (ms since epoch). */
  at: number;
  /** Dim the row — a submission that no longer counts (e.g. revoked). */
  dimmed?: boolean;
  /** Appended after the recency label, e.g. "withdrawn by instructor". */
  note?: string;
  /** Trailing control, e.g. an instructor's Revoke button. */
  action?: ReactNode;
}

/** `rows === null` means still loading. Newest first — the first row is
 *  labeled "latest" when there's more than one. */
export function SubmissionHistory({ rows }: { rows: SubmissionHistoryRow[] | null }) {
  return (
    <div className="prov-submit-history">
      <SubLabel>Your submissions</SubLabel>
      {rows === null ? (
        <p className="muted small prov-share-list-note">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted small prov-share-list-note">Nothing submitted yet.</p>
      ) : (
        <ul className="prov-submit-list">
          {rows.map((r, i) => (
            <li key={r.key} className={r.dimmed ? "is-revoked" : undefined}>
              <span className="prov-submit-when">{absoluteTime(r.at)}</span>
              <span className="prov-submit-ago muted small">
                {relativeTime(r.at)}
                {i === 0 && rows.length > 1 && " · latest"}
                {r.note && ` · ${r.note}`}
              </span>
              {r.action}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
