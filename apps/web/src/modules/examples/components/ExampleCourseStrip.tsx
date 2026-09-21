// The course strip: a thin band above an otherwise-unchanged example page.
//
// THE CONSTRAINT THIS COMPONENT EXISTS TO RESPECT: /examples/<slug> is public,
// static, and identical for every viewer. This component renders **nothing at
// all** unless the URL carries `?c=<courseId>` AND the viewer turns out to be
// enrolled in that course. An anonymous visitor, a signed-in student who
// followed a bare link, and a crawler all get exactly the page that existed
// before this module — no strip, no layout shift, no /api call that changes
// what they see.
//
// Because of that, the component is safe to mount unconditionally at the top of
// any example page. It self-suppresses; the host page does not need to know
// about courses.
//
// Two things happen when the strip is live:
//   - the anonymous usage beacon fires (see ../api.ts and the worker README);
//   - the student gets the "Mark complete" button and the statement of what is
//     recorded.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Button } from "../../../components/index.js";
import { getMe } from "../../../api.js";
import {
  getMyCourseExamples,
  markComplete,
  sendUsageBeacon,
  unmarkComplete,
  type CourseExampleDTO,
} from "../api.js";
import { RecordingNotice } from "./RecordingNotice.js";
import "../examples-course.css";

/**
 * How long a visitor must stay before an "engaged" signal is allowed to fire.
 *
 * Engagement is reported on the first real interaction (a pointer press or a
 * key press inside the page) that happens after this delay. Both halves matter:
 * requiring an interaction keeps a bounce from counting, and the delay keeps a
 * stray click on the way to the back button from counting either. Erring toward
 * under-counting is the right direction — an instructor acting on an inflated
 * engagement number is worse than one who sees a conservative floor.
 */
const ENGAGEMENT_MIN_DWELL_MS = 10_000;

interface StripState {
  courseId: string;
  courseName: string;
  entry: CourseExampleDTO | null;
  completed: boolean;
}

export interface ExampleCourseStripProps {
  /** The example's registry slug. The host page passes its own. */
  slug: string;
}

export function ExampleCourseStrip({ slug }: ExampleCourseStripProps) {
  const [params] = useSearchParams();
  const courseId = params.get("c");
  const [state, setState] = useState<StripState | null>(null);
  const [busy, setBusy] = useState(false);

  // Resolve enrollment. A non-enrolled or signed-out viewer leaves `state` null
  // forever, which renders nothing — the failure mode is silence, never an
  // error banner on a public teaching page.
  useEffect(() => {
    if (!courseId) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const me = await getMe(ctrl.signal);
        const enrollment = me.enrollments.find((e) => e.courseId === courseId);
        if (!enrollment) return;
        const mine = await getMyCourseExamples(courseId, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setState({
          courseId,
          courseName: enrollment.courseName,
          entry: mine.examples.find((e) => e.slug === slug) ?? null,
          completed: mine.completed.includes(slug),
        });
      } catch {
        /* silent by design — see above */
      }
    })();
    return () => ctrl.abort();
  }, [courseId, slug]);

  // The open beacon, once the viewer is confirmed to be a member of the course
  // they claimed. Fired from an effect keyed on the resolved course so a
  // re-render can't double-count.
  const openSent = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const key = `${state.courseId}:${slug}`;
    if (openSent.current === key) return;
    openSent.current = key;
    sendUsageBeacon(state.courseId, slug, false);
  }, [state, slug]);

  // The engagement beacon: at most once per visit, on a real interaction after
  // the dwell floor. Listeners are removed as soon as it fires, so this costs
  // nothing for the rest of the visit.
  const engagedSent = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (engagedSent.current) return;
    const readyAt = Date.now() + ENGAGEMENT_MIN_DWELL_MS;
    const onInteract = () => {
      if (engagedSent.current || Date.now() < readyAt) return;
      engagedSent.current = true;
      sendUsageBeacon(state.courseId, slug, true);
      detach();
    };
    const detach = () => {
      window.removeEventListener("pointerdown", onInteract, true);
      window.removeEventListener("keydown", onInteract, true);
    };
    window.addEventListener("pointerdown", onInteract, true);
    window.addEventListener("keydown", onInteract, true);
    return detach;
  }, [state, slug]);

  const toggleComplete = useCallback(async () => {
    if (!state) return;
    setBusy(true);
    try {
      if (state.completed) {
        await unmarkComplete(state.courseId, slug);
        setState({ ...state, completed: false });
      } else {
        await markComplete(state.courseId, slug);
        setState({ ...state, completed: true });
      }
    } catch {
      /* leave the button as it was; the student can retry */
    } finally {
      setBusy(false);
    }
  }, [state, slug]);

  if (!courseId || !state) return null;

  const due = state.entry?.dueAt ?? null;

  return (
    <div className="ex-strip" role="complementary" aria-label="Course context">
      <div className="ex-strip__inner">
        <div className="ex-strip__what">
          <span className="ex-strip__label">
            Assigned in{" "}
            <Link to={`/course/${state.courseId}/examples`}>{state.courseName}</Link>
            {due !== null && <> · due {formatDate(due)}</>}
          </span>
          {state.entry?.note && (
            <span className="ex-strip__note">{state.entry.note}</span>
          )}
        </div>
        <div className="ex-strip__actions">
          {state.completed && <Badge tone="success">Complete</Badge>}
          <Button
            variant={state.completed ? "ghost" : "primary"}
            size="sm"
            onClick={toggleComplete}
            loading={busy}
            disabled={busy}
          >
            {state.completed ? "Un-mark" : "Mark complete"}
          </Button>
        </div>
      </div>
      <RecordingNotice variant="compact" />
    </div>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
