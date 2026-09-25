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
import {
  adminMenuTabs,
  navGroups,
  tabForPathname,
  tabHref,
} from "../course/tabs.js";
import {
  CourseNav,
  CourseSwitcher,
  IconButton,
  NavSheet,
  RoleSwitch,
  Wordmark,
  type NavSheetSection,
} from "../components/index.js";
import { MenuIcon, SignOutIcon } from "../icons.js";
import { signOut } from "../session.js";

export function CourseLayout() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState<CourseContextValue | null>(null);
  const [enrollments, setEnrollments] = useState<MeEnrollment[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Mobile nav sheet (≤680). Declared with the other state so it sits above the
  // error / loading early-returns — hooks must not be conditional.
  const [sheetOpen, setSheetOpen] = useState(false);

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
          codeEnabled: e.codeEnabled ?? false,
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

  // Any navigation closes the sheet — including a back/forward that didn't go
  // through its own onClick.
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

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

  // Mobile sheet contents (≤680, where the nav strip and course switcher are
  // hidden). The bands are FLATTENED here: on a phone there's room to list
  // every destination outright, and a menu-inside-a-menu would reintroduce the
  // hiding this redesign exists to remove. Course admin and "All courses"
  // follow, so nothing the header used to reach becomes unreachable.
  const sheetSections: NavSheetSection[] = [
    ...navGroups(currentEnrollment).map((g) => ({
      key: g.key,
      // A band that collapsed to one tab needs no heading above its single row.
      title: g.items.length > 1 ? g.label : undefined,
      rows: g.items.map((t) => ({
        key: t.slug,
        label: t.label,
        to: tabHref(t, courseId),
        active: currentTab?.slug === t.slug,
      })),
    })),
    {
      key: "course",
      title: "This Course",
      rows: [
        ...adminMenuTabs(currentEnrollment).map((t) => ({
          key: t.slug,
          label: t.label,
          to: tabHref(t, courseId),
          active: currentTab?.slug === t.slug,
        })),
        { key: "all", label: "All Courses", detail: "Your courses", to: "/courses" },
      ],
    },
  ];

  return (
    <CourseContext.Provider value={value}>
      {/* DS app shell: locked viewport, one fixed instructor bar, scrolling
          body. The instructor bar carries the lockup, the course switcher, the
          banded nav (inline, not a separate strip), and the role switch — the
          DS .app-topbar--instructor layout. */}
      <div className="app">
        <header className="app-topbar app-topbar--wide app-topbar--instructor">
          <div className="app-topbar__inner">
            {/* ≤680 only (CSS-gated): the nav strip and course switcher are
                hidden there, and everything they hold moves into the sheet. */}
            <button
              type="button"
              className="app-burger"
              aria-label="Menu"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen(true)}
            >
              <MenuIcon />
            </button>
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
              flags={currentEnrollment}
            />

            {/* The banded nav — Dashboard · Assign · Review ▾ · Build ▾ —
                inline in the bar. Four entries rather than one pill per tab;
                see CourseNav for why, and navGroups() for the grouping. */}
            <CourseNav
              courseId={courseId}
              flags={currentEnrollment}
              activeSlug={currentTab?.slug ?? null}
            />

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

        <NavSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          sections={sheetSections}
        />

        <div className="app__body">
          <Outlet />
        </div>
      </div>
    </CourseContext.Provider>
  );
}
