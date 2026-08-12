// Course-rooted student shell — the primary surface, owning the clean course
// root. Parallels CourseLayout (the staff shell, prefixed under /instructor)
// but wears the student topbar register. Mounted at /course/:courseId/*.
//
// Like CourseLayout it reads :courseId from the URL, fetches /api/me, finds the
// matching enrollment, and supplies the same CourseContext every in-shell page
// consumes — so the student home, chat, history, and the writing surface all
// read course id / role / flags from one validated place (no useActiveCourse,
// no localStorage course resolution).
//
// The student topbar carries an inline MODULE NAV — one item per enabled module
// (Agents always; Writing when provenance is on; Attendance when the course
// turned it on). The home is a single scrolling stack of those module panels;
// a nav item scrolls its panel into view (via a `#module` hash the home reads),
// and the lockup is home. Together they retire the per-screen back buttons the
// student surfaces used to each invent — the header always gets you to any
// module, so nothing needs its own "← back" affordance.
//
// When the caller is an instructor, this is "preview as student" of their own
// course: the RoleSwitch shows Instructor/Admin to step back out, and a
// PreviewBanner makes the mode explicit. A real student sees neither — for them
// this is simply home. The worker re-checks enrollment on every endpoint, so a
// deep-link by a non-enrolled user still 403s at the API layer; the redirect
// here is best-effort UX.

import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { getMe, type MeEnrollment } from "../client.js";
import { CourseContext, type CourseContextValue } from "../course/useCourse.js";
import {
  CourseSwitcher,
  IconButton,
  PreviewBanner,
  RoleSwitch,
  StudentModuleNav,
} from "../components/index.js";
import { SignOutIcon, UserIcon } from "../icons.js";
import { signOut } from "../session.js";

export function StudentLayout() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState<CourseContextValue | null>(null);
  const [enrollments, setEnrollments] = useState<MeEnrollment[]>([]);
  const [identity, setIdentity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch /api/me, validate enrollment, and build the context value. Extracted
  // so `refresh` (exposed on the context) can re-run it; the student side rarely
  // needs it, but the shared context contract requires it.
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!courseId) return;
      try {
        const m = await getMe(signal);
        if (signal?.aborted) return;
        if (m.email) setIdentity(m.email.split("@")[0] ?? null);
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
      <div className="ds-home">
        <div className="ds-home__inner">
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }
  if (!value || !courseId) {
    return <div className="ds-home" />;
  }

  const home = `/course/${courseId}`;
  // An instructor is previewing when they're really an instructor. With a live
  // act-as-student downgrade, `value.role` is reported as `student`, so also
  // treat the flag as previewing — otherwise the banner would vanish exactly
  // when the downgrade is active.
  const previewing = value.role === "instructor" || value.actingAsStudent;

  // v1.2 — the modules are real routes now, so the active nav item comes from
  // the path's first segment, not a `#hash`. The bare course root (pre-redirect)
  // and /dashboard both read as Dashboard; a conversation (/chat) highlights
  // Agents, matching where the student came from.
  const seg = location.pathname
    .slice(home.length)
    .replace(/^\//, "")
    .split("/")[0];
  // Inside an agent conversation the header takes the same register as the
  // provenance editor: full width, no sign-out / identity chrome.
  const inAgent = seg === "chat";
  const activeModule =
    seg === "" || seg === "dashboard"
      ? "dashboard"
      : seg === "agents" || seg === "chat"
        ? "agents"
        : seg === "writing"
          ? "writing"
          : null;

  return (
    <CourseContext.Provider value={value}>
      {/* DS app shell: a locked viewport (the page itself never scrolls) with a
          fixed topbar and a single scrolling body region. This is the
          structural fix for the runaway outer scroll that dragged the topbar. */}
      <div className="app">
        <header
          className={
            "app-topbar app-topbar--student" + (inAgent ? " prov-appbar" : "")
          }
        >
          <div className="app-topbar__inner">
            {/* Lockup + course switcher + module nav. The switcher (between the
                lockup and the menu items) lets a student with multiple courses
                jump between them or reach "All courses" — the affordance the
                student shell previously lacked. Each module item navigates to
                its own route (Dashboard / Agents / Writing). */}
            <StudentModuleNav
              courseId={courseId}
              provenanceEnabled={value.provenanceEnabled}
              agentsEnabled={value.agentsEnabled}
              activeModule={activeModule}
              switcher={
                <CourseSwitcher
                  courseId={courseId}
                  courseName={value.courseName}
                  enrollments={enrollments}
                  variant="student"
                />
              }
            />

            <div className="app-topbar__spacer" />
            {/* Inside an agent the header matches the provenance editor: no
                sign-out / identity chrome. Instructors previewing still exit
                via the PreviewBanner below, so nothing is trapped. */}
            {!inAgent && (
              <div className="app-topbar__actions">
                {/* The role switch is an INSTRUCTOR/admin affordance only — a
                    pure student never sees it (RoleSwitch renders null), so
                    there's no way to leave the student view. */}
                <RoleSwitch
                  courseId={courseId}
                  role={value.role}
                  isAdmin={value.isAdmin}
                  current="student"
                  actingAsStudent={value.actingAsStudent}
                />
                <span className="app-topbar__divider" aria-hidden />
                {identity && (
                  <span className="app-id">
                    <span className="app-id__icon">
                      <UserIcon />
                    </span>
                    <span className="app-id__name">{identity}</span>
                  </span>
                )}
                <IconButton title="Sign out" onClick={signOut}>
                  <SignOutIcon />
                </IconButton>
              </div>
            )}
          </div>
        </header>

        {previewing && (
          <PreviewBanner courseId={courseId} courseName={value.courseName} />
        )}

        <div className="app__body">
          <Outlet />
        </div>
      </div>
    </CourseContext.Provider>
  );
}
