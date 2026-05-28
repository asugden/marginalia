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
import { TABS, tabForPathname } from "../course/tabs.js";

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
      <div className="page staff">
        <div className="staff-frame">
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }
  if (!value || !courseId) {
    return <div className="page" />;
  }

  const currentEnrollment = enrollments.find((e) => e.courseId === courseId);
  const others = enrollments.filter((e) => e.courseId !== courseId);
  const currentTab = tabForPathname(location.pathname, courseId);
  const visibleTabs = TABS.filter((t) => t.visible(currentEnrollment));

  return (
    <CourseContext.Provider value={value}>
      <div className="page staff">
        <div className="staff-frame">
          <header className="card-header">
            <h1>
              <Link
                to={`/course/${courseId}`}
                className="course-breadcrumb-link"
              >
                {value.courseName}
              </Link>
              {currentTab && (
                <>
                  <span className="course-breadcrumb-sep" aria-hidden> · </span>
                  <span className="course-breadcrumb-tab">
                    {currentTab.label}
                  </span>
                </>
              )}
            </h1>
            <div className="header-actions">
              <Link to="/" className="link-button subtle">
                ← Student view
              </Link>
              {others.length > 0 && (
                <div className="course-switcher">
                  <button
                    type="button"
                    className="subtle"
                    onClick={() => setSwitcherOpen((v) => !v)}
                    aria-expanded={switcherOpen}
                  >
                    Switch course ▾
                  </button>
                  {switcherOpen && (
                    <ul className="course-switcher-menu">
                      {others.map((e) => (
                        <li key={e.courseId}>
                          <button
                            type="button"
                            onClick={() => {
                              setSwitcherOpen(false);
                              navigate(`/course/${e.courseId}`);
                            }}
                          >
                            <strong>{e.courseName}</strong>
                            <span className="muted small"> · {e.role}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </header>

          <nav className="tab-row" aria-label="Course sections">
            {visibleTabs.map((t) => {
              const to = t.external ? t.slug : `/course/${courseId}/${t.slug}`;
              const active = currentTab?.slug === t.slug;
              return (
                <Link
                  key={t.slug}
                  to={to}
                  className={`tab-button${active ? " active" : ""}`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <Outlet />
        </div>
      </div>
    </CourseContext.Provider>
  );
}
