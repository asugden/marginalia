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

import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { getMe } from "../client.js";
import { CourseContext, type CourseContextValue } from "../course/useCourse.js";
import {
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
  const [identity, setIdentity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        if (m.email) setIdentity(m.email.split("@")[0] ?? null);
        const e = m.enrollments.find((x) => x.courseId === courseId);
        if (!e) {
          navigate("/", { replace: true });
          return;
        }
        setValue({
          courseId: e.courseId,
          courseName: e.courseName,
          role: e.role,
          showAttendance: e.showAttendance,
          showCollections: e.showCollections,
          hideProvenanceMarks: e.hideProvenanceMarks,
          provenanceEnabled: e.provenanceEnabled,
          isAdmin: Boolean(m.isAdmin),
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
  const previewing = value.role === "instructor";

  // The module nav highlights the active panel only on the course home (the
  // scroll-stack it targets). On a focused sub-screen (a conversation) a click
  // first returns home, then scrolls — so the nav does the job the per-screen
  // back buttons used to.
  const onHome = location.pathname === home || location.pathname === `${home}/`;
  const activeModule = onHome
    ? (location.hash.replace(/^#/, "") || "agents")
    : null;

  return (
    <CourseContext.Provider value={value}>
      {/* DS app shell: a locked viewport (the page itself never scrolls) with a
          fixed topbar and a single scrolling body region. This is the
          structural fix for the runaway outer scroll that dragged the topbar. */}
      <div className="app">
        <header className="app-topbar app-topbar--student">
          <div className="app-topbar__inner">
            {/* Lockup + module nav (the course's enabled modules). A click
                navigates to the course home with a `#module` hash; the home
                scrolls the matching panel into view. This replaces every
                per-screen back button. */}
            <StudentModuleNav
              courseId={courseId}
              provenanceEnabled={value.provenanceEnabled}
              activeModule={activeModule}
            />

            <div className="app-topbar__spacer" />
            <div className="app-topbar__actions">
              {/* The role switch is an INSTRUCTOR/admin affordance only — a
                  pure student never sees it (RoleSwitch renders null), so
                  there's no way to leave the student view. */}
              <RoleSwitch
                courseId={courseId}
                role={value.role}
                isAdmin={value.isAdmin}
                current="student"
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
