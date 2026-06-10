// v1.0 §2 — multi-enrollment landing.
//
// Renders the list of courses the caller is enrolled in. Each card
// navigates to the right per-course home depending on role:
//   * instructor → /course/:courseId/instructor  (the dashboard)
//   * student    → /course/:courseId             (the student home)
//
// Reachable via:
//   * GET / (RootRedirect) when the caller has >1 enrollments.
//   * the dashboard's "Switch course" menu (the menu navigates directly,
//     but the picker is also a deep-linkable surface for completeness).
//
// Staff-register page even when the caller is a student — the picker is
// a meta-surface, not the inside of a course.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMe, type MeEnrollment } from "../client.js";
import { readBootstrap } from "../bootstrap.js";
import { Badge, Wordmark } from "../components/index.js";
import { ArrowIcon } from "../icons.js";

export function CoursePickerPage() {
  const [enrollments, setEnrollments] = useState<MeEnrollment[] | null>(() => {
    const boot = readBootstrap();
    return boot && boot.kind === "picker" ? boot.enrollments : null;
  });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setEnrollments(m.enrollments);
        // Lone enrollment? Send them where they'd have landed anyway.
        if (m.enrollments.length === 1) {
          const only = m.enrollments[0]!;
          navigate(
            only.role === "instructor"
              ? `/course/${only.courseId}/instructor`
              : `/course/${only.courseId}`,
            { replace: true },
          );
        }
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [navigate]);

  return (
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to="/courses" aria-label="Courses">
          <Wordmark size="sm" />
        </Link>
        <span className="ds-staff-top__role">Courses</span>
      </header>

      <div className="ds-staff-page">
        <div className="ds-staff-head">
          <div>
            <span className="eyebrow">Your courses</span>
            <h1>Pick a course</h1>
            <div className="ds-staff-head__scope">
              You&rsquo;re enrolled in more than one course on this instance.
              Pick the one you want to open.
            </div>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {enrollments === null ? (
          <p className="muted">Loading…</p>
        ) : enrollments.length === 0 ? (
          <p className="muted">
            You aren&rsquo;t enrolled in any courses yet. Use a join code on the
            home page to enroll.
          </p>
        ) : (
          <div className="ds-staff-list">
            {enrollments.map((e) => (
              <button
                key={e.courseId}
                type="button"
                className="ds-staff-list__row"
                style={{ cursor: "pointer", textAlign: "left" }}
                onClick={() =>
                  navigate(
                    e.role === "instructor"
                      ? `/course/${e.courseId}/instructor`
                      : `/course/${e.courseId}`,
                  )
                }
              >
                <div className="ds-staff-list__main">
                  <div className="ds-staff-list__title">{e.courseName}</div>
                  <div
                    className="ds-staff-list__sub"
                    style={{ marginTop: "0.3rem" }}
                  >
                    <Badge tone={e.role === "instructor" ? "brand" : "ghost"}>
                      {e.role}
                    </Badge>
                  </div>
                </div>
                <div className="ds-staff-list__actions">
                  <span className="ds-btn ds-btn--primary ds-btn--sm" aria-hidden>
                    Open
                    <span className="ds-btn__icon">
                      <ArrowIcon size={16} />
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
