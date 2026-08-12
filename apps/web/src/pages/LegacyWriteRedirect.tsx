// v1.2 renamed the student writing surface from `write` to `writing` (the nav
// label and eyebrow already said "Writing"; only the URL lagged). This shim
// bounces the old course-scoped /write* paths to their /writing* equivalents so
// bookmarks and in-flight links keep working. Distinct from LegacyCourseRedirect,
// which resolves a *course-agnostic* legacy URL to the caller's default course;
// here the course is already in the URL, so we just swap the segment.
import { Navigate, useParams } from "react-router-dom";

export function LegacyWriteRedirect({ suffix }: { suffix?: "agents" }) {
  const { courseId, id } = useParams<{ courseId: string; id: string }>();
  let to = `/course/${courseId}/writing`;
  if (suffix === "agents") to += "/agents";
  else if (id) to += `/${id}`;
  return <Navigate to={to} replace />;
}
