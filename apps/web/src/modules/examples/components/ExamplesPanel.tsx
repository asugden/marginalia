// The Examples module's dashboard panel — the examples this course has
// ASSIGNED, shown stacked with the Agents, Writing and Code panels.
//
// Why it exists: examples carry dates and a completion state and render under
// an "Assigned" heading on /course/:id/examples, but a student had no way to
// REACH that page. The only inbound link lives on the example page itself
// (ExampleCourseStrip), so you could find the list of your assigned examples
// only once you were already looking at one — circular. Assigning an example
// told the student nothing.
//
// ASSIGNED ONLY. The curated list and the assigned list are not the same
// thing: `/api/examples/course/mine` returns everything an instructor curated,
// and a curated row with no dates is a SUPPLEMENT — offered all term, browsable
// at /examples, never due. This panel shows only rows with a date, matching
// `isSupplement()`'s inverse in the course-items module (the one definition of
// "assigned" the rest of the app uses). The dashboard answers "what has this
// course set me"; the full browse surface stays at /examples, unchanged.
//
// The panel renders nothing at all when nothing is assigned — an empty panel
// on the course home would be the same noise as a nav item for a module the
// course doesn't use.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { findExample } from "../../../examples/registry.js";
import { getMyCourseExamples, type CourseExampleDTO } from "../api.js";

/** Short date, matching StudentExamplesPage so one example reads the same in
 *  both places. */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Is this curated example actually assigned?
 *
 * Mirrors `isSupplement()` in modules/course-items/api.ts — both dates null
 * means "offered, never due". Kept as the same predicate so the student
 * dashboard and the instructor's Assign list agree on what counts as assigned.
 */
function isAssigned(e: CourseExampleDTO): boolean {
  return e.assignedAt !== null || e.dueAt !== null;
}

export function ExamplesPanel({ courseId }: { courseId: string }) {
  const [examples, setExamples] = useState<CourseExampleDTO[] | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    getMyCourseExamples(courseId, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setExamples(r.examples);
        setCompleted(new Set(r.completed));
      })
      .catch(() => {
        // Stay silent. This is one panel among several on the course home, and
        // a failure here must not take the dashboard down or shout at a
        // student about a surface they may not even use. The dedicated
        // /examples page reports its own errors.
        if (ctrl.signal.aborted) return;
        setExamples([]);
      });
    return () => ctrl.abort();
  }, [courseId]);

  const rows = useMemo(
    () =>
      (examples ?? []).filter(isAssigned).flatMap((entry) => {
        // Skip slugs this deploy's registry no longer knows — a stale curation
        // row outliving an example would otherwise render a dead link.
        const spec = findExample(entry.slug);
        return spec ? [{ entry, spec }] : [];
      }),
    [examples],
  );

  // Nothing assigned (or still loading) → render nothing. The panel appears
  // only when the course has actually set examples.
  if (rows.length === 0) return null;

  const doneCount = rows.filter((r) => completed.has(r.entry.slug)).length;

  return (
    <section className="app-modpanel app-modpanel--open" data-module="examples">
      <div className="app-modpanel__head">
        <div className="app-modpanel__heading">
          <span className="eyebrow">Interactive</span>
          <h2><Link to={`/course/${courseId}/examples`}>Examples</Link></h2>
        </div>
        <span className="app-modpanel__meta">
          {doneCount} of {rows.length} marked complete
        </span>
      </div>
      <div className="app-modpanel__body">
        <div className="app-list">
          {rows.map(({ entry, spec }) => {
            const isDone = completed.has(entry.slug);
            return (
              <div className="app-list__row" key={entry.slug}>
                <div className="app-list__main">
                  <div className="app-list__title">
                    {/* ?c= is what surfaces the course strip on the public
                        example page. Without it the page is the plain one. */}
                    <Link
                      to={`/examples/${entry.slug}?c=${encodeURIComponent(courseId)}`}
                    >
                      {spec.title}
                    </Link>
                  </div>
                  <div className="app-list__sub">
                    {[
                      entry.dueAt !== null
                        ? `Due ${formatDate(entry.dueAt)}`
                        : entry.assignedAt !== null
                          ? `Assigned ${formatDate(entry.assignedAt)}`
                          : null,
                      isDone ? "Marked complete" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {entry.note && <> — {entry.note}</>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
