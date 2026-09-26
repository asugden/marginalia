// The student header nav — the lockup, an optional course switcher, and ONE
// nav item: Dashboard.
//
// It used to list every enabled module (Dashboard · Agents · Writing · Code).
// That mirrored the module flags, not the student's task, and it diverged
// from the instructor header, which shows a compact task strip rather than a
// pill per module. The dashboard is now the student hub: its Due-next strip
// and module panels carry students into everything the course has actually
// set, and each panel's heading links to its module's full page, so the
// dedicated routes (/agents, /writing, /code) stay reachable without a
// permanent top-line item each.
//
// This is the single source of truth for the student nav: the StudentLayout
// topbar renders it (and the ≤680 sheet maps over studentModules()), and so
// do the standalone provenance/notebook editors (which live outside
// StudentLayout but still want the same lockup + way home). The editors pass
// no switcher.
//
// It's presentation-only and context-free — the host passes courseId and
// (optionally) a course-switcher node.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "./index.js";

export interface StudentModuleNavProps {
  courseId: string;
  /** The module currently in view (`"dashboard"`), or null on surfaces that
   *  aren't a nav destination (e.g. the editors) so nothing is highlighted. */
  activeModule?: string | null;
  /** Optional course switcher, rendered between the lockup and the nav items.
   *  Present in the StudentLayout topbar; absent in the standalone editor. */
  switcher?: ReactNode;
}

interface StudentModule {
  id: string;
  label: string;
}

/** The student nav destinations, in order — currently just the Dashboard hub.
 *  Kept as a function (and as the mobile sheet's source) so a future
 *  destination lands in the topbar and the sheet together. */
export function studentModules(): StudentModule[] {
  return [{ id: "dashboard", label: "Dashboard" }];
}

export function StudentModuleNav({
  courseId,
  activeModule = null,
  switcher,
}: StudentModuleNavProps) {
  const home = `/course/${courseId}`;
  const modules = studentModules();
  return (
    <>
      <Link to={`${home}/dashboard`} aria-label="Dashboard" className="app-lockup-link">
        <Wordmark />
      </Link>
      {switcher}
      {/* Wrapped in .app-navwrap so the nav is the topbar's one flexible,
          shrinkable item — the shrink invariant that keeps the role switch and
          sign-out pinned right instead of being pushed off the edge. */}
      <div className="app-navwrap">
        <nav className="app-nav app-nav--student" aria-label="Course modules">
          {modules.map((mod) => (
            <Link
              key={mod.id}
              to={`${home}/${mod.id}`}
              className={
                "app-nav__item" +
                (activeModule === mod.id ? " app-nav__item--active" : "")
              }
            >
              {mod.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
