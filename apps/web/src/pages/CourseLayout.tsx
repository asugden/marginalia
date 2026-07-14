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

import { useEffect, useState } from "react";
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
import { IconButton, RoleSwitch, Wordmark } from "../components/index.js";
import { BackIcon, CheckIcon, ChevronIcon, PlusIcon, SignOutIcon } from "../icons.js";
import { signOut } from "../session.js";

export function CourseLayout() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState<CourseContextValue | null>(null);
  const [enrollments, setEnrollments] = useState<MeEnrollment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
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
          isAdmin: Boolean(m.isAdmin),
          actingAsStudent: Boolean(m.actingAsStudent),
        });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId, navigate]);

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
  const others = enrollments.filter((e) => e.courseId !== courseId);
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
            <div className="app-course">
              <button
                type="button"
                className="app-course__btn"
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
              >
                <span className="app-course__name">{value.courseName}</span>
                <ChevronIcon size={14} />
              </button>
              {switcherOpen && (
                <div className="app-course__menu" role="menu">
                  <button
                    type="button"
                    className="app-course__opt app-course__all"
                    onClick={() => {
                      setSwitcherOpen(false);
                      navigate("/courses");
                    }}
                  >
                    <BackIcon size={15} />
                    <span className="app-course__main">
                      <b>All courses</b>
                      <span>Your courses</span>
                    </span>
                  </button>
                  <div className="app-course__sep" />
                  <button
                    type="button"
                    className="app-course__opt"
                    onClick={() => setSwitcherOpen(false)}
                  >
                    <span className="app-course__main">
                      <b>{value.courseName}</b>
                      <span>This course</span>
                    </span>
                    <span className="app-course__tick">
                      <CheckIcon size={16} />
                    </span>
                  </button>
                  {others.map((e) => (
                    <button
                      key={e.courseId}
                      type="button"
                      className="app-course__opt"
                      onClick={() => {
                        setSwitcherOpen(false);
                        navigate(`/course/${e.courseId}/instructor`);
                      }}
                    >
                      <span className="app-course__main">
                        <b>{e.courseName}</b>
                        <span>{e.role}</span>
                      </span>
                    </button>
                  ))}
                  <div className="app-course__sep" />
                  <button
                    type="button"
                    className="app-course__opt app-course__new"
                    onClick={() => {
                      setSwitcherOpen(false);
                      navigate("/courses?new=1");
                    }}
                  >
                    <PlusIcon size={16} />
                    <span className="app-course__main">
                      <b>New course…</b>
                      <span>Blank or copy an existing one</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

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
