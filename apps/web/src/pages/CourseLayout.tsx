// v1.0 §1 / Phase 2 — per-course route wrapper *and* unified header.
//
// Mounted under `/course/:courseId/*`. Reads the URL segment, fetches
// `/api/me`, finds the matching enrollment, and supplies
// `{ courseId, courseName, role }` to every child page via React
// context. A caller who isn't enrolled is bounced to `/` (the picker /
// single-enrollment landing decides what to show them).
//
// v1.0 Phase 2: the layout owns the page chrome — `.page.staff` frame,
// the breadcrumb-style header (course name · current tab), the
// "Switch course" dropdown, the "← Student view" link, and the tab
// strip. Each tab body (AuthorListPage, RosterPage, etc.) renders only
// its own content — no more per-page header drift, no more two stacked
// headers.
//
// The validation is best-effort UX gating — the worker enforces the
// same enrollment check on every endpoint, so a malicious deep-link
// still 403s at the API layer.

import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { getMe, type MeEnrollment } from "../client.js";
import { CourseContext, type CourseContextValue } from "../course/useCourse.js";
import { TABS, tabForPathname, tabHref } from "../course/tabs.js";
import { CourseSwitcher, IconButton, RoleSwitch, Wordmark } from "../components/index.js";
import { SignOutIcon } from "../icons.js";
import { signOut } from "../session.js";

export function CourseLayout() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState<CourseContextValue | null>(null);
  const [enrollments, setEnrollments] = useState<MeEnrollment[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset the resolved course context synchronously when the URL's `courseId`
  // changes. Without this, switching courses re-renders this layout with the
  // new param but keeps serving the *previous* course's context until the
  // async /api/me fetch resolves — during that gap children (e.g. the
  // dashboard reading useCourse()) would flash the stale course's data.
  const [prevCourseId, setPrevCourseId] = useState(courseId);
  if (courseId !== prevCourseId) {
    setPrevCourseId(courseId);
    setValue(null);
  }

  // Fetch /api/me, validate enrollment, and build the context value. Extracted
  // so `refresh` (exposed on the context) can re-run it after a Settings edit.
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!courseId) return;
      try {
        const m = await getMe(signal);
        if (signal?.aborted) return;
        const e = m.enrollments.find((x) => x.courseId === courseId);
        if (!e) {
          navigate("/", { replace: true });
          return;
        }
        setEnrollments(m.enrollments);
        setValue({
          courseId: e.courseId,
          courseName: e.courseName,
          role: e.role,
          showAttendance: e.showAttendance,
          showCollections: e.showCollections,
          hideProvenanceMarks: e.hideProvenanceMarks,
          provenanceEnabled: e.provenanceEnabled,
          agentsEnabled: e.agentsEnabled,
          termSeason: e.termSeason,
          termYear: e.termYear,
          startDate: e.startDate,
          endDate: e.endDate,
          isAdmin: Boolean(m.isAdmin),
          actingAsStudent: Boolean(m.actingAsStudent),
          refresh: () => load(),
        });
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Load failed");
      }
    },
    [courseId, navigate],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  if (error) {
    return (
      <div className="ds-staff">
        <div className="ds-staff-page">
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }
  if (!value || !courseId) {
    return <div className="ds-staff" />;
  }

  const currentEnrollment = enrollments.find((e) => e.courseId === courseId);
  const currentTab = tabForPathname(location.pathname, courseId);
  const visibleTabs = TABS.filter((t) => t.visible(currentEnrollment));

  return (
    <CourseContext.Provider value={value}>
      {/* DS app shell: locked viewport, one fixed instructor bar, scrolling
          body. The instructor bar carries the lockup, the course switcher, the
          nav pills (inline, not a separate strip), and the role switch — the
          DS .app-topbar--instructor layout. */}
      <div className="app">
        <header className="app-topbar app-topbar--wide app-topbar--instructor">
          <div className="app-topbar__inner">
            <Link
              to={`/course/${courseId}/instructor`}
              aria-label="Course home"
              className="app-lockup-link"
            >
              <Wordmark size="sm" />
            </Link>

            {/* Course switcher — current course + jump / new / all courses. */}
            <CourseSwitcher
              courseId={courseId}
              courseName={value.courseName}
              enrollments={enrollments}
              variant="instructor"
            />

            {/* Nav pills, inline in the bar (DS .app-nav). */}
            <nav className="app-nav" aria-label="Course sections">
              {visibleTabs.map((t) => {
                const to = tabHref(t, courseId);
                const active = currentTab?.slug === t.slug;
                return (
                  <Link
                    key={t.slug}
                    to={to}
                    className={
                      "app-nav__item" + (active ? " app-nav__item--active" : "")
                    }
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>

            <div className="app-topbar__spacer" />
            <div className="app-topbar__actions">
              <RoleSwitch
                courseId={courseId}
                role={value.role}
                isAdmin={value.isAdmin}
                current="author"
                actingAsStudent={value.actingAsStudent}
              />
              <span className="app-topbar__divider" aria-hidden />
              <IconButton title="Sign out" onClick={signOut}>
                <SignOutIcon />
              </IconButton>
            </div>
          </div>
        </header>

        <div className="app__body">
          <Outlet />
        </div>
      </div>
    </CourseContext.Provider>
  );
}
