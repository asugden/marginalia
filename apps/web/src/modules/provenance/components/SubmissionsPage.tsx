// Instructor-side Submissions page — /course/:id/instructor/submissions.
//
// The course-wide review surface for provenance. Every time a student presses
// "Share" in the writing editor, the worker freezes a snapshot of the document
// and mints a token; this page lists them.
//
// Grouped by DOCUMENT, not by mint. A student can press Share repeatedly on the
// same piece, so the raw table is one row per press — listing that flat buries
// the actual unit of work under near-duplicate rows. Each row here is a document
// with its latest snapshot; earlier ones are collapsed behind a "N earlier"
// disclosure, newest first.
//
// Only instructors can reach the endpoint (403 otherwise) or open an individual
// snapshot at /s/:token. This UI gate is best-effort; the server is authority.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import { relativeTime } from "../../../time.js";
import {
  listCourseSubmissions,
  type CourseSubmissionSummary,
} from "../api.js";
import {
  Badge,
  Input,
  PageHeader,
  Section,
} from "../../../components/index.js";

/** One document and every snapshot taken of it, newest first. */
interface DocGroup {
  documentId: string;
  title: string;
  studentEmail: string;
  studentName: string | null;
  /** Newest first; `latest` is subs[0]. */
  subs: CourseSubmissionSummary[];
}

export function SubmissionsPage() {
  const { courseId } = useCourse();
  const [subs, setSubs] = useState<CourseSubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSubs(null);
    setError(null);
    const ctrl = new AbortController();
    listCourseSubmissions(courseId, ctrl.signal)
      .then((s) => {
        if (ctrl.signal.aborted) return;
        setSubs(s);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  // Group by document, preserving the server's newest-first order — so the
  // document with the most recent snapshot leads the page.
  const groups = useMemo<DocGroup[]>(() => {
    if (!subs) return [];
    const byDoc = new Map<string, DocGroup>();
    for (const s of subs) {
      let g = byDoc.get(s.documentId);
      if (!g) {
        g = {
          documentId: s.documentId,
          title: s.title,
          studentEmail: s.studentEmail,
          studentName: s.studentName,
          subs: [],
        };
        byDoc.set(s.documentId, g);
      }
      g.subs.push(s);
    }
    return [...byDoc.values()];
  }, [subs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.studentEmail.toLowerCase().includes(q) ||
        (g.studentName ?? "").toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q),
    );
  }, [groups, query]);

  const students = useMemo(
    () => new Set(groups.map((g) => g.studentEmail)).size,
    [groups],
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Provenance"
        title="Submissions"
        scope="Snapshots students have shared from the writing tool. Each one freezes the document at that moment and records where every word came from. Only instructors can open them."
      />

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Shared documents"
        meta={
          subs === null
            ? undefined
            : `${groups.length} document${groups.length === 1 ? "" : "s"} · ${students} student${students === 1 ? "" : "s"}`
        }
        actions={
          <Input
            type="search"
            placeholder="Filter by student or title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "16rem", maxWidth: "40vw" }}
          />
        }
      >
        {/* No legend here by design — each bar carries its own breakdown in a
            hover title and aria-label, and the snapshot view it links to has the
            full legend. A standing legend just added noise to the list. */}
        {subs === null ? (
          <p className="muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="muted">
            Nothing shared yet. A student creates a snapshot with “Share” in the
            writing editor.
          </p>
        ) : filtered.length === 0 ? (
          <p className="muted">Nothing matches that filter.</p>
        ) : (
          <div className="app-list">
            {filtered.map((g) => (
              <DocumentRow key={g.documentId} group={g} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function DocumentRow({ group }: { group: DocGroup }) {
  const [open, setOpen] = useState(false);
  const latest = group.subs[0]!;
  const earlier = group.subs.slice(1);
  const who = group.studentName || group.studentEmail;

  return (
    <>
      <div className="app-list__row prov-subs__row">
        <div className="app-list__main">
          <div className="app-list__title">
            {latest.revokedAt !== null ? (
              latest.title || "Untitled"
            ) : (
              <Link to={`/s/${latest.token}`}>{latest.title || "Untitled"}</Link>
            )}
          </div>
          <div className="app-list__sub">
            {who} · shared {relativeTime(latest.createdAt)}
            {latest.revokedAt !== null && " · revoked"}
            {earlier.length > 0 && (
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
            )}
          </div>
        </div>
        <div className="app-list__meta">
          <OriginBar origins={latest.origins} />
        </div>
      </div>
      {open &&
        earlier.map((s) => (
          <div className="app-list__row prov-subs__row is-earlier" key={s.token}>
            <div className="app-list__main">
              <div className="app-list__sub">
                {s.revokedAt !== null ? (
                  <>Earlier snapshot · revoked</>
                ) : (
                  <Link to={`/s/${s.token}`}>Earlier snapshot</Link>
                )}
                {" · "}
                {relativeTime(s.createdAt)}
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

/**
 * Proportional bar of where the text came from, in the same color vocabulary as
 * the editor and the snapshot viewer. Percentages are of total characters in the
 * frozen render, so an instructor can triage without opening every snapshot.
 */
function OriginBar({ origins }: { origins: CourseSubmissionSummary["origins"] }) {
  const { total, human, llm, pasted, edited, pasteCount } = origins;
  if (total <= 0) {
    return <Badge tone="neutral">empty</Badge>;
  }
  const pct = (n: number) => (n / total) * 100;
  // Text the student didn't compose at the keyboard. `pasted` includes text
  // that was pasted and later retyped by hand — the server folds that in at
  // mint time, since it's the same fact about how the content arrived.
  const notTyped = Math.round(pct(llm + pasted + edited));
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
        {notTyped}% not typed
        {pasteCount > 0 && ` · ${pasteCount} paste${pasteCount === 1 ? "" : "s"}`}
      </span>
    </span>
  );
}
