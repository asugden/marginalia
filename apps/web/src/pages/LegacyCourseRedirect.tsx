// v1.0 §7.2 — legacy /author/... and /attendance paths kept alive as
// redirect shims after the page-by-page migration to /course/:courseId/...
//
// Resolves the caller's "default" course (first enrollment, most-recently-
// joined per /api/me ordering) and replaces the URL with the new course-
// scoped equivalent. Lives for at least 6 months after v1.0 ships per the
// plan, then can be deleted.
//
// `to` is the sub-path under /course/:courseId/. If the caller has no
// enrollments at all, fall back to / (which shows the join-code empty
// state).

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMe } from "../client.js";

export function LegacyCourseRedirect({ to }: { to: string }) {
  const navigate = useNavigate();
  const params = useParams();
  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        if (m.enrollments.length === 0) {
          navigate("/", { replace: true });
          return;
        }
        const first = m.enrollments[0]!;
        // Substitute :id-style params from the legacy URL into the new path.
        const filled = to.replace(/:(\w+)/g, (_, key) => params[key] ?? "");
        navigate(`/course/${first.courseId}${filled}`, { replace: true });
      })
      .catch(() => {
        navigate("/", { replace: true });
      });
    return () => ctrl.abort();
  }, [navigate, params, to]);
  return <div className="page" />;
}
