// Instructor view — /course/:courseId/instructor/assign/examples.
//
// Examples are a kind of assignment, so this sits under the Assignments tab
// rather than having a tab of its own; the combined list that links here lives
// in the provenance module's AssignmentsPage. Only the navigation is shared —
// the curation, usage, and completion data below are entirely this module's,
// read from this module's endpoints, under this module's rules. The old
// /instructor/examples path still redirects here (see apps/web/src/main.tsx).
//
// Three panels behind a segmented control:
//   Assign — pick examples from the registry, set optional dates, reorder.
//   Usage  — the anonymous aggregate, with the small-cohort floor applied.
//   Completion — the binary ✓ / — roster.
//
// The Usage and Completion panels are separate on purpose, and there is no
// view that combines them. They come from two tables that cannot be joined:
// usage carries no identity, completion carries no counts. Putting them in one
// table with a student down the side would suggest a correlation the data
// deliberately does not support. See the worker module README.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import { EXAMPLES, findExample } from "../../../examples/registry.js";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  PageHeader,
  SegmentedControl,
  Section,
} from "../../../components/index.js";
import {
  getCompletionRoster,
  getCourseExamples,
  getUsage,
  putCourseExamples,
  type CompletionRosterEntryDTO,
  type CourseExampleDTO,
  type UsageResponse,
} from "../api.js";
import "../examples-course.css";

type Panel = "assign" | "usage" | "completion";

export function InstructorExamplesPage() {
  const { courseId } = useCourse();
  const [panel, setPanel] = useState<Panel>("assign");

  return (
    <div className="ds-staff-page">
      <PageHeader
        eyebrow="Instructor · Assignments"
        title="Examples"
        scope="Pick interactive examples for this course. The example pages themselves stay public and identical for everyone — assigning one adds it to your students' list, it doesn't lock anyone out."
      />

      {/* Same back-link idiom the assignment roster uses — both are detail
          surfaces hanging off the one Assignments list. */}
      <p className="muted small">
        <Link to={`/course/${courseId}/instructor/assign`}>← Assign</Link>
      </p>

      <SegmentedControl
        options={[
          { value: "assign", label: "Assign" },
          { value: "usage", label: "Usage" },
          { value: "completion", label: "Completion" },
        ]}
        value={panel}
        onChange={(v) => setPanel(v as Panel)}
      />

      {panel === "assign" && <AssignPanel courseId={courseId} />}
      {panel === "usage" && <UsagePanel courseId={courseId} />}
      {panel === "completion" && <CompletionPanel courseId={courseId} />}
    </div>
  );
}

// ── Assign ─────────────────────────────────────────────────────────────────

/** Local editing shape. Dates are held as `YYYY-MM-DD` strings because that's
 *  what `<input type="date">` speaks; they convert to epoch ms on save. */
interface Draft {
  slug: string;
  assigned: string;
  due: string;
  note: string;
}

function AssignPanel({ courseId }: { courseId: string }) {
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    getCourseExamples(courseId, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted) return;
        setDraft(rows.map(toDraft));
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  const chosen = useMemo(
    () => new Set((draft ?? []).map((d) => d.slug)),
    [draft],
  );

  const toggle = useCallback((slug: string) => {
    setSaved(false);
    setDraft((prev) => {
      const list = prev ?? [];
      return list.some((d) => d.slug === slug)
        ? list.filter((d) => d.slug !== slug)
        : [...list, { slug, assigned: "", due: "", note: "" }];
    });
  }, []);

  const move = useCallback((index: number, delta: number) => {
    setSaved(false);
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row!);
      return next;
    });
  }, []);

  const patch = useCallback((slug: string, fields: Partial<Draft>) => {
    setSaved(false);
    setDraft((prev) =>
      (prev ?? []).map((d) => (d.slug === slug ? { ...d, ...fields } : d)),
    );
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const rows = await putCourseExamples(
        courseId,
        draft.map((d) => ({
          slug: d.slug,
          assignedAt: dateToMs(d.assigned),
          dueAt: dateToMs(d.due),
          note: d.note.trim() || null,
        })),
      );
      setDraft(rows.map(toDraft));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [courseId, draft]);

  if (draft === null) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <>
      {error && <p className="error">{error}</p>}

      <Section
        kicker="Assigned, in order"
        description="Students see these in this order. Dates are optional — leave both blank to say only that an example is worth their time."
        meta={saved ? "Saved" : undefined}
        actions={
          <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={saving}>
            Save
          </Button>
        }
      >
        {draft.length === 0 ? (
          <p className="muted">Nothing assigned yet. Pick from the list below.</p>
        ) : (
          <div className="app-list">
            {draft.map((d, i) => {
              const spec = findExample(d.slug);
              return (
                <div className="app-list__row ex-assign__row" key={d.slug}>
                  <div className="app-list__main">
                    <div className="app-list__title">{spec?.title ?? d.slug}</div>
                    <div className="ex-assign__fields">
                      <label className="ex-assign__field">
                        <span>Assigned</span>
                        <Input
                          type="date"
                          value={d.assigned}
                          onChange={(e) => patch(d.slug, { assigned: e.target.value })}
                        />
                      </label>
                      <label className="ex-assign__field">
                        <span>Due</span>
                        <Input
                          type="date"
                          value={d.due}
                          onChange={(e) => patch(d.slug, { due: e.target.value })}
                        />
                      </label>
                      <label className="ex-assign__field ex-assign__field--wide">
                        <span>Note</span>
                        <Input
                          type="text"
                          value={d.note}
                          placeholder="Optional one-line instruction"
                          onChange={(e) => patch(d.slug, { note: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="app-list__meta ex-assign__order">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${spec?.title ?? d.slug} up`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => move(i, 1)}
                      disabled={i === draft.length - 1}
                      aria-label={`Move ${spec?.title ?? d.slug} down`}
                    >
                      ↓
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle(d.slug)}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        kicker="All examples"
        description="Every example in this deployment. Each is a public page at its own URL; you can link one directly from a syllabus or a slide whether or not you assign it here."
      >
        <div className="app-list">
          {EXAMPLES.map((ex) => (
            <div className="app-list__row" key={ex.slug}>
              <div className="app-list__main">
                <div className="app-list__title">{ex.title}</div>
                <div className="app-list__sub">{ex.blurb}</div>
              </div>
              <div className="app-list__meta">
                <a
                  className="ex-preview-link"
                  href={`/examples/${ex.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview
                </a>
                <Checkbox
                  checked={chosen.has(ex.slug)}
                  onChange={() => toggle(ex.slug)}
                  label="Assign"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function toDraft(row: CourseExampleDTO): Draft {
  return {
    slug: row.slug,
    assigned: msToDate(row.assignedAt),
    due: msToDate(row.dueAt),
    note: row.note ?? "",
  };
}

/** `YYYY-MM-DD` → epoch ms at UTC midnight, or null for an empty field. */
function dateToMs(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function msToDate(ms: number | null): string {
  if (ms === null) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

// ── Usage ──────────────────────────────────────────────────────────────────

function UsagePanel({ courseId }: { courseId: string }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getUsage(courseId, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  // Opens per UTC hour, summed across every day and example. This is the shape
  // that answers the question the aggregate exists for — whether students are
  // working through the week or all at once — without implying anything about
  // an individual.
  const byHour = useMemo(() => {
    const hours = new Array<number>(24).fill(0);
    for (const b of data?.buckets ?? []) {
      // Guard the index: hour_bucket comes from the server, and a row outside
      // 0-23 would otherwise silently write past the end of the array.
      if (b.hourBucket < 0 || b.hourBucket > 23) continue;
      hours[b.hourBucket] = (hours[b.hourBucket] ?? 0) + (b.opens ?? 0);
    }
    return hours;
  }, [data]);
  const peak = Math.max(1, ...byHour);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const floor = data.minCohort;

  return (
    <>
      <Section
        kicker="Per example"
        description={
          <>
            How often the class opened each example from a course link, and how
            often that turned into actual interaction rather than a glance.{" "}
            <strong>These counts are anonymous</strong> — nothing here records
            who opened anything, and any number below {floor} is shown as a
            range so a small count can't single a student out.
          </>
        }
      >
        {data.totals.length === 0 ? (
          <p className="muted">
            No opens recorded yet. Counts appear once students follow a link
            from their course examples list.
          </p>
        ) : (
          <div className="app-list">
            {data.totals.map((t) => {
              const spec = findExample(t.slug);
              return (
                <div className="app-list__row" key={t.slug}>
                  <div className="app-list__main">
                    <div className="app-list__title">{spec?.title ?? t.slug}</div>
                    <div className="app-list__sub">
                      {describeCount(t.opens, floor, "open")} ·{" "}
                      {describeCount(t.engagedOpens, floor, "engaged open")}
                    </div>
                  </div>
                  <div className="app-list__meta">
                    {t.suppressed && <Badge tone="neutral">small count</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        kicker="When (UTC hour)"
        description="Opens by hour of day, summed over the term and across every example. Hours are UTC, not local time — the aggregate is stored coarsely on purpose."
      >
        <div className="ex-hours" role="img" aria-label="Opens by UTC hour">
          {byHour.map((n, h) => (
            <div className="ex-hours__col" key={h} title={`${String(h).padStart(2, "0")}:00 UTC — ${n} opens`}>
              <div
                className="ex-hours__bar"
                style={{ height: `${Math.round((n / peak) * 100)}%` }}
              />
              <span className="ex-hours__tick">{h % 6 === 0 ? h : ""}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

/** Render a possibly-suppressed count. A null means "non-zero but under the
 *  floor" — say so in words rather than showing a number we've withheld. */
function describeCount(n: number | null, floor: number, noun: string): string {
  if (n === null) return `fewer than ${floor} ${noun}s`;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

// ── Completion ─────────────────────────────────────────────────────────────

function CompletionPanel({ courseId }: { courseId: string }) {
  const [roster, setRoster] = useState<CompletionRosterEntryDTO[] | null>(null);
  const [assigned, setAssigned] = useState<CourseExampleDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      getCompletionRoster(courseId, ctrl.signal),
      getCourseExamples(courseId, ctrl.signal),
    ])
      .then(([r, a]) => {
        if (ctrl.signal.aborted) return;
        setRoster(r);
        setAssigned(a);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  if (error) return <p className="error">{error}</p>;
  if (!roster || !assigned) return <p className="muted">Loading…</p>;

  const cols = assigned.filter((a) => findExample(a.slug));

  return (
    <Section
      kicker="Completion"
      description="Students mark an example complete themselves; this is their own claim about their own work, and they can withdraw it. It is the only per-student fact this module keeps — there is no open count, no time spent, and no history here, by design."
    >
      {cols.length === 0 ? (
        <p className="muted">Assign an example first.</p>
      ) : roster.length === 0 ? (
        <p className="muted">No students enrolled yet.</p>
      ) : (
        <div className="ex-grid" role="table">
          <div className="ex-grid__row ex-grid__row--head" role="row">
            <span className="ex-grid__who" role="columnheader">
              Student
            </span>
            {cols.map((c) => (
              <span className="ex-grid__cell" role="columnheader" key={c.slug}>
                <span className="ex-grid__colname">
                  {findExample(c.slug)?.title ?? c.slug}
                </span>
              </span>
            ))}
          </div>
          {roster.map((r) => {
            const done = new Set(r.completed);
            return (
              <div className="ex-grid__row" role="row" key={r.userId}>
                <span className="ex-grid__who" role="cell">
                  {r.displayName || r.email || r.userId}
                </span>
                {cols.map((c) => (
                  <span className="ex-grid__cell" role="cell" key={c.slug}>
                    {done.has(c.slug) ? (
                      <span className="ex-grid__yes" aria-label="Marked complete">
                        ✓
                      </span>
                    ) : (
                      <span className="ex-grid__no" aria-label="Not marked">
                        —
                      </span>
                    )}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
