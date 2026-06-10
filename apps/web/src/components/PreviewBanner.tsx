// Shown to an instructor who has switched into the student view of their own
// course. "Preview mode" is not a stored flag — it's simply an instructor on a
// /course/:id route (not under /instructor). StudentLayout decides when to
// mount this; the banner
// itself is pure presentation, reading the course from context.
//
// It does two jobs: (1) reassures the instructor that what they're seeing is
// the real student experience of *this* course, and (2) gives them an explicit
// way back into authoring without hunting for the role switch.

import { Link } from "react-router-dom";

export interface PreviewBannerProps {
  courseId: string;
  courseName: string;
}

export function PreviewBanner({ courseId, courseName }: PreviewBannerProps) {
  return (
    <div className="app-preview" role="status">
      <span>
        <b>Previewing {courseName} as a student.</b> The student&rsquo;s view of
        this course.
      </span>
      <Link to={`/course/${courseId}/instructor`} className="app-preview__back">
        Back to instructor
      </Link>
    </div>
  );
}
