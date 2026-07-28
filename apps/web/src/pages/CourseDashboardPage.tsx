// Per-course instructor index (/course/:courseId/instructor).
//
// In the design system, entering a course lands the instructor on Agents — the
// all-courses "dashboard" (expandable course cards + New Course) lives on the
// /courses surface (CoursePickerPage), not here. So this index simply
// redirects into the Agents tab; the course chrome (topbar + nav) is owned by
// CourseLayout.

import { Navigate, useParams } from "react-router-dom";

export function CourseDashboardPage() {
  // Read the course id from the URL, not from CourseContext: this index route
  // can render before the layout's context catches up to a course switch, and
  // trusting stale context here would redirect back to the previous course.
  const { courseId } = useParams<{ courseId: string }>();
  return <Navigate to={`/course/${courseId}/instructor/agents`} replace />;
}
