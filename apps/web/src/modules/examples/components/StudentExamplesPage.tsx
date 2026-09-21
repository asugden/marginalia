// Student view — /course/:courseId/examples.
//
// The examples an instructor curated for this course, in their order, with
// whatever dates they set. Each links out to the public example page with
// `?c=<courseId>` appended, which is the only thing that makes the example
// page aware of the course at all (see ExampleCourseStrip).
//
// Completion is markable from here as well as from the example page itself. A
// student who did the work last week shouldn't have to reopen the page to say
// so.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import { findExample } from "../../../examples/registry.js";
import { Badge, Button, PageHeader, Section } from "../../../components/index.js";
import {
  getMyCourseExamples,
  markComplete,
  unmarkComplete,
  type CourseExampleDTO,
} from "../api.js";
import { RecordingNotice } from "./RecordingNotice.js";
import "../examples-course.css";

export function StudentExamplesPage() {
  const { courseId, courseName } = useCourse();
  const [examples, setExamples] = useState<CourseExampleDTO[] | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  useEffect(() => {
    setExamples(null);
    setError(null);
    const ctrl = new AbortController();
    getMyCourseExamples(courseId, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setExamples(r.examples);
        setCompleted(new Set(r.completed));
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  const toggle = useCallback(
    async (slug: string) => {
      setBusySlug(slug);
      try {
        const next = new Set(completed);
        if (completed.has(slug)) {
          await unmarkComplete(courseId, slug);
          next.delete(slug);
        } else {
          await markComplete(courseId, slug);
          next.add(slug);
        }
        setCompleted(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that");
      } finally {
        setBusySlug(null);
      }
    },
    [completed, courseId],
  );

  // Skip slugs the registry no longer knows — an example can be removed from a
  // deploy while a stale curation row survives, and a dead link is worse than
  // a missing one.
  const rows = useMemo(
    () =>
      (examples ?? []).flatMap((e) => {
        const spec = findExample(e.slug);
        return spec ? [{ entry: e, spec }] : [];
      }),
    [examples],
  );

  const doneCount = rows.filter((r) => completed.has(r.entry.slug)).length;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Examples"
        title="Interactive examples"
        scope={`Hands-on illustrations ${courseName} has picked out. Each one runs entirely in your browser — nothing to install, nothing to set up.`}
      />

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Assigned"
        meta={
          examples === null
            ? undefined
            : `${doneCount} of ${rows.length} marked complete`
        }
      >
        <RecordingNotice />

        {examples === null ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">
            Nothing assigned yet. You can still browse{" "}
            <Link to="/examples">every example</Link> — they're open to anyone.
          </p>
        ) : (
          <div className="app-list">
            {rows.map(({ entry, spec }) => {
              const isDone = completed.has(entry.slug);
              return (
                <div className="app-list__row ex-row" key={entry.slug}>
                  <div className="app-list__main">
                    <div className="app-list__title">
                      {/* ?c= is what surfaces the course strip on the example
                          page. Without it the page is the plain public one. */}
                      <Link to={`/examples/${entry.slug}?c=${encodeURIComponent(courseId)}`}>
                        {spec.title}
                      </Link>
                    </div>
                    <div className="app-list__sub">
                      {spec.blurb}
                      {entry.note && <> — {entry.note}</>}
                    </div>
                    {(entry.assignedAt !== null || entry.dueAt !== null) && (
                      <div className="ex-row__dates">
                        {entry.assignedAt !== null && (
                          <>assigned {formatDate(entry.assignedAt)}</>
                        )}
                        {entry.assignedAt !== null && entry.dueAt !== null && " · "}
                        {entry.dueAt !== null && <>due {formatDate(entry.dueAt)}</>}
                      </div>
                    )}
                  </div>
                  <div className="app-list__meta">
                    {isDone && <Badge tone="success">Complete</Badge>}
                    <Button
                      variant={isDone ? "ghost" : "subtle"}
                      size="sm"
                      onClick={() => toggle(entry.slug)}
                      loading={busySlug === entry.slug}
                      disabled={busySlug === entry.slug}
                    >
                      {isDone ? "Un-mark" : "Mark complete"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
