// How a submission looks to course staff — everywhere. The writing tool's
// course-wide Submissions page, a writing assignment's page, and a coding
// assignment's page all render submissions through this one component, so
// they can't drift apart: one row per piece of work with its latest
// submission, the typed / pasted / other bar, and earlier submissions behind
// an "N earlier" disclosure.
//
// Callers differ only in what a row is (a writing snapshot, a notebook
// submission), which arrives here already flattened. Class names are the
// writing tool's (`prov-subs__*`) because that's where the surface was born,
// the same arrangement as SubmissionHistory.

import { useState } from "react";
import { Link } from "react-router-dom";
import { lateness, relativeTime } from "../time.js";
import { Badge } from "./core/Badge.js";

/** Characters by origin, as both tools record them (@marginalia/provenance). */
export interface OriginTotals {
  total: number;
  human: number;
  pasted: number;
  llm: number;
  edited: number;
  /** Code only: text the instructor's starter notebook provided. */
  provided?: number;
}

export interface SubmissionCardEntry {
  key: string;
  /** Where the submission opens; null when it can no longer be opened. */
  href: string | null;
  at: number;
  assignmentTitle?: string | null;
  checkpointName?: string | null;
  late?: boolean;
  /** How long after the deadline it landed, when the caller knows the
   *  deadline. Shown beside LATE; the submission still opens as normal. */
  lateByMs?: number | null;
  revoked?: boolean;
  /** Null when origins weren't recorded (e.g. a practice copy). */
  origins: OriginTotals | null;
}

export interface SubmissionCardGroup {
  key: string;
  title: string;
  /** The student, as a person reads it: name, else email. */
  who: string;
  /** Newest first; the first is the one the row shows. */
  entries: SubmissionCardEntry[];
}

/**
 * `layout`:
 *   "submission" (default) — the work leads: its title is the row's link, with
 *     who and when beneath. For lists that span assignments.
 *   "student" — the person leads: their name is the link (and the only text in
 *     the key colour), with when beside it; the title drops to the second line.
 *     For a single assignment's page, where every title is that assignment's.
 */
export function SubmissionCards({
  groups,
  layout = "submission",
}: {
  groups: SubmissionCardGroup[];
  layout?: "submission" | "student";
}) {
  return (
    <div className="app-list">
      {groups.map((g) => (
        <SubmissionCardRow key={g.key} group={g} layout={layout} />
      ))}
    </div>
  );
}

/** What the submission belongs to: assignment and/or checkpoint. */
function Where({ e }: { e: SubmissionCardEntry }) {
  return e.assignmentTitle != null ? (
    <>
      {" · "}
      {e.assignmentTitle}
      {e.checkpointName != null && <> — {e.checkpointName}</>}
    </>
  ) : (
    e.checkpointName != null && <> · {e.checkpointName}</>
  );
}

/** How it arrived: late, revoked. */
function Status({ e }: { e: SubmissionCardEntry }) {
  return (
    <>
      {e.late &&
        (e.lateByMs != null && e.lateByMs > 0
          ? ` · LATE by ${lateness(e.lateByMs)}`
          : " · LATE")}
      {e.revoked && " · revoked"}
    </>
  );
}

function SubmissionCardRow({
  group,
  layout,
}: {
  group: SubmissionCardGroup;
  layout: "submission" | "student";
}) {
  const [open, setOpen] = useState(false);
  const latest = group.entries[0]!;
  const earlier = group.entries.slice(1);
  const title = group.title || "Untitled";
  const link = (text: string) => (latest.href ? <Link className="card-link" to={latest.href}>{text}</Link> : text);
  const more = earlier.length > 0 && (
    <>
      {" · "}
      <button
        type="button"
        className="prov-subs__more"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "hide" : `${earlier.length} earlier`}
      </button>
    </>
  );

  return (
    <>
      <div className="app-list__row prov-subs__row">
        {layout === "student" ? (
          <div className="app-list__main">
            <div className="app-list__title">
              {link(group.who)}
              <span className="prov-subs__when">
                {" · "}shared {relativeTime(latest.at)}
                <Status e={latest} />
                {more}
              </span>
            </div>
            <div className="app-list__sub">
              {title}
              <Where e={latest} />
            </div>
          </div>
        ) : (
          <div className="app-list__main">
            <div className="app-list__title">{link(title)}</div>
            <div className="app-list__sub">
              {group.who} · shared {relativeTime(latest.at)}
              <Where e={latest} />
              <Status e={latest} />
              {more}
            </div>
          </div>
        )}
        <div className="app-list__meta">
          <OriginBar origins={latest.origins} />
        </div>
      </div>
      {open &&
        earlier.map((s) => (
          <div className="app-list__row prov-subs__row is-earlier" key={s.key}>
            <div className="app-list__main">
              <div className="app-list__sub">
                {s.href ? <Link className="card-link" to={s.href}>Earlier snapshot</Link> : <>Earlier snapshot</>}
                {" · "}
                {relativeTime(s.at)}
                <Where e={s} />
                <Status e={s} />
              </div>
            </div>
            <div className="app-list__meta">
              <OriginBar origins={s.origins} />
            </div>
          </div>
        ))}
    </>
  );
}

/** The typed / pasted / other bar. Its breakdown is in the hover title and
 *  aria-label; the submission it links to carries the full legend.
 *
 *  Everything here — bar, percentage, breakdown — measures the student's OWN
 *  text. Starter code the instructor provided isn't theirs either way, so it
 *  is left out entirely rather than drawn beside their work; the submission
 *  view still marks it. */
export function OriginBar({ origins }: { origins: OriginTotals | null }) {
  if (!origins) return <Badge tone="neutral">not recorded</Badge>;
  const { total, human, llm, pasted, edited } = origins;
  const own = total - (origins.provided ?? 0);
  if (total <= 0) {
    return <Badge tone="neutral">empty</Badge>;
  }
  if (own <= 0) {
    return <Badge tone="neutral">starter only</Badge>;
  }
  const pct = (n: number) => (n / own) * 100;
  // Stated as a positive: the share of their own text they typed.
  const typed = Math.round(pct(human));
  const segments = [
    { key: "human", cls: "legend-human", value: human, label: "typed" },
    { key: "pasted", cls: "legend-pasted", value: pasted, label: "pasted" },
    { key: "llm", cls: "legend-llm", value: llm, label: "from LLM" },
    { key: "edited", cls: "legend-edited", value: edited, label: "autocorrect" },
  ].filter((s) => s.value > 0);
  const title = segments
    .map((s) => `${s.label} ${Math.round(pct(s.value))}%`)
    .join(" · ");

  return (
    <span className="prov-subs__origins" title={title} aria-label={`Origins: ${title}`}>
      <span className="prov-subs__bar" aria-hidden>
        {segments.map((s) => (
          <span
            key={s.key}
            className={`prov-subs__seg ${s.cls}`}
            style={{ width: `${pct(s.value)}%` }}
          />
        ))}
      </span>
      <span className="app-list__count">
        {typed}% typed
      </span>
    </span>
  );
}

/** The origin legend a submission view shows above the marked-up work. One
 *  legend for both tools; `provided` appears only where it exists (code). */
export function OriginLegend({ provided = false }: { provided?: boolean }) {
  return (
    <div className="prov-public-legend" aria-label="Word-origin legend">
      <span className="prov-legend-item"><span className="prov-legend-swatch legend-human" /> typed</span>
      <span className="prov-legend-item"><span className="prov-legend-swatch legend-pasted" /> pasted</span>
      <span className="prov-legend-item"><span className="prov-legend-swatch legend-llm" /> from LLM</span>
      <span className="prov-legend-item"><span className="prov-legend-swatch legend-edited" /> autocorrect</span>
      {provided && (
        <span className="prov-legend-item"><span className="prov-legend-swatch legend-provided" /> provided</span>
      )}
    </div>
  );
}
