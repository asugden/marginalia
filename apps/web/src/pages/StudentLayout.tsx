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
// When the caller is an instructor, this is "preview as student" of their own
// course: the RoleSwitch shows Author/Admin to step back out, and a
// PreviewBanner makes the mode explicit. A real student sees neither — for them
// this is simply home. The worker re-checks enrollment on every endpoint, so a
// deep-link by a non-enrolled user still 403s at the API layer; the redirect
// here is best-effort UX.

import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { getMe, type MeEnrollment } from "../client.js";
import { CourseContext, type CourseContextValue } from "../course/useCourse.js";
import {
  Button,
  IconButton,
  PreviewBanner,
  RoleSwitch,
  Wordmark,
} from "../components/index.js";
import { HistoryIcon, SignOutIcon, UserIcon } from "../icons.js";
import { signOut } from "../session.js";

export function StudentLayout() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
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

  return (
    <CourseContext.Provider value={value}>
      {/* DS app shell: a locked viewport (the page itself never scrolls) with a
          fixed topbar and a single scrolling body region. This is the
          structural fix for the runaway outer scroll that dragged the topbar —
          previously each page was a min-height:100vh block under a sticky bar,
          so the chat (100vh) pushed the whole page past one screen. */}
      <div className="app">
        <header className="app-topbar">
          <div className="app-topbar__inner">
            <Link to={home} aria-label="Home" className="app-lockup-link">
              <Wordmark />
            </Link>
            <div className="app-topbar__spacer" />
            <div className="app-topbar__actions">
              <Button
                variant="ghost"
                size="sm"
                icon={<HistoryIcon size={16} />}
                href={`${home}/history`}
              >
                <span className="app-hide-sm">History</span>
              </Button>
              <span className="app-topbar__divider" aria-hidden />
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
