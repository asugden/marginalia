// Shown to an instructor who has switched into the student view of their own
// course. Previewing is backed by a session-scoped act-as-student flag (a real
// role downgrade, so the worker reports the instructor as a student and things
// like provenance marks hide exactly as a student sees them). StudentLayout
// decides when to mount this; the banner reads the course from context.
//
// It does two jobs: (1) reassures the instructor that what they're seeing is
// the real student experience of *this* course, and (2) gives them an explicit
// way back into authoring — which must *clear* the downgrade, not just
// navigate, so the "Back to instructor" control routes through the toggle.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setActingAsStudent } from "../client.js";
import { EyeIcon } from "../icons.js";

export interface PreviewBannerProps {
  courseId: string;
  courseName: string;
}

export function PreviewBanner({ courseId, courseName }: PreviewBannerProps) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  async function back() {
    if (leaving) return;
    setLeaving(true);
    try {
      // Clear the downgrade before returning to authoring so the instructor
      // page loads with full instructor powers.
      await setActingAsStudent(false);
      navigate(`/course/${courseId}/instructor`);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="app-preview" role="status">
      <EyeIcon size={16} aria-hidden />
      <span>
        <b>Previewing {courseName} as a student.</b> The student&rsquo;s view of
        this course.
      </span>
      <button
        type="button"
        className="app-preview__back"
        onClick={back}
        disabled={leaving}
      >
        Back to instructor
      </button>
    </div>
  );
}
