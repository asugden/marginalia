// Per-course instructor index (/course/:courseId/instructor).
//
// In the design system, entering a course lands the instructor on Agents — the
// all-courses "dashboard" (expandable course cards + New Course) lives on the
// /courses surface (CoursePickerPage), not here. So this index simply
// redirects into the Agents tab; the course chrome (topbar + nav) is owned by
// CourseLayout.

import { Navigate } from "react-router-dom";
import { useCourse } from "../course/useCourse.js";

export function CourseDashboardPage() {
  const { courseId } = useCourse();
  return <Navigate to={`/course/${courseId}/instructor/agents`} replace />;
}
