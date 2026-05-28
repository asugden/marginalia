// Shared chrome for course-agnostic standalone surfaces (e.g. the
// provenance writing tool at /write). The course-scoped pages get their
// chrome from <CourseLayout>; this is the parallel primitive for pages
// that live outside the /course/:courseId/* tree but still want the same
// header look + an optional course switcher.
//
// Goal: one header implementation per "kind" of page, so updating the
// chrome is a single-file change. Modules render only their own body.

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MeEnrollment } from "../client.js";

interface Props {
  /** Page title shown in the breadcrumb position. */
  title: string;
  /** Optional sub-segment after the title (e.g. "Agents"). */
  section?: string;
  /** When the section links somewhere (breadcrumb back to the root). */
  titleTo?: string;
  /** Right-aligned header actions (links / buttons). */
  actions?: ReactNode;
  /** Optional course context + switcher. When provided and the caller has
   *  >1 enrollment, a "Switch course" menu renders next to the actions. */
  course?: {
    active: MeEnrollment | null;
    enrollments: MeEnrollment[];
    onSwitch: (courseId: string) => void;
  };
  /** A short note rendered under the header. */
  note?: ReactNode;
  children: ReactNode;
}

export function StandalonePage({
  title,
  section,
  titleTo,
  actions,
  course,
  note,
  children,
}: Props) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const others =
    course?.enrollments.filter((e) => e.courseId !== course.active?.courseId) ?? [];

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>
            {titleTo ? (
              <Link to={titleTo} className="course-breadcrumb-link">{title}</Link>
            ) : (
              title
            )}
            {section && (
              <>
                <span className="course-breadcrumb-sep" aria-hidden> · </span>
                <span className="course-breadcrumb-tab">{section}</span>
              </>
            )}
          </h1>
          <div className="header-actions">
            {actions}
            {course && course.active && (
              <span className="standalone-course-tag" title="Active course">
                {course.active.courseName}
              </span>
            )}
            {course && others.length > 0 && (
              <div className="course-switcher">
                <button
                  type="button"
                  className="subtle"
                  onClick={() => setSwitcherOpen((v) => !v)}
                  aria-expanded={switcherOpen}
                >
                  Switch course ▾
                </button>
                {switcherOpen && (
                  <ul className="course-switcher-menu">
                    {others.map((e) => (
                      <li key={e.courseId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSwitcherOpen(false);
                            course.onSwitch(e.courseId);
                          }}
                        >
                          <strong>{e.courseName}</strong>
                          <span className="muted small"> · {e.role}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </header>

        {note && <p className="scope-note">{note}</p>}

        {children}
      </div>
    </div>
  );
}
