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
import { Button, Wordmark } from "../components/index.js";
import { ChevronIcon } from "../icons.js";

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
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to="/" aria-label="Home">
          <Wordmark size="sm" />
        </Link>
        {section && <span className="ds-staff-top__role">{section}</span>}
        <div className="ds-staff-top__course">
          {course && others.length > 0 ? (
            <div className="ds-switcher">
              <Button
                variant="ghost"
                size="sm"
                iconRight={<ChevronIcon size={14} />}
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-expanded={switcherOpen}
              >
                {course.active?.courseName ?? "Switch course"}
              </Button>
              {switcherOpen && (
                <ul className="ds-switcher__menu">
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
          ) : (
            course?.active && <span>{course.active.courseName}</span>
          )}
        </div>
      </header>

      <div className="ds-staff-page">
        <div className="ds-staff-head">
          <div>
            <span className="eyebrow">{section ?? title}</span>
            <h1>
              {titleTo ? (
                <Link to={titleTo} className="course-breadcrumb-link">
                  {title}
                </Link>
              ) : (
                title
              )}
            </h1>
            {note && <div className="ds-staff-head__scope">{note}</div>}
          </div>
          {actions && <div className="ds-staff-actions">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  );
}
