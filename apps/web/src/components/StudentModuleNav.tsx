// The student module nav — the lockup, an optional course switcher, and one
// item per student surface. Dashboard is the combined overview (the course
// root); Agents and Writing are dedicated routes shown only when their
// extension is on for the course (Agents unless toggled off, Writing when the
// provenance module is on). As of v1.2 these are real routes, not `#module`
// hash scroll targets — each item navigates to its own page.
//
// This is the single source of truth for the student nav: the StudentLayout
// topbar renders it, and so does the standalone provenance editor (which lives
// outside StudentLayout but still wants the same lockup + way home). The editor
// passes no switcher.
//
// It's presentation-only and context-free — the host passes courseId, the
// module flags, and (optionally) a course-switcher node — so it works in the
// editor's context-less route too.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "./index.js";

export interface StudentModuleNavProps {
  courseId: string;
  /** Whether the provenance writing module is on for this course. Drives the
   *  Writing nav item. */
  provenanceEnabled: boolean;
  /** Whether the Agents extension is on for this course. Drives the Agents nav
   *  item (default on). */
  agentsEnabled: boolean;
  /** The module currently in view (`"dashboard" | "agents" | "writing"`), or
   *  null when the nav is shown on a surface that isn't a module route (e.g.
   *  the editor) so nothing is highlighted. */
  activeModule?: string | null;
  /** Optional course switcher, rendered between the lockup and the nav items.
   *  Present in the StudentLayout topbar; absent in the standalone editor. */
  switcher?: ReactNode;
}

interface StudentModule {
  id: string;
  label: string;
}

/** The student surfaces, in order. Dashboard (the overview) is always present;
 *  Agents appears unless the Agents extension is toggled off; Writing appears
 *  only when the course's provenance module is on. Attendance is intentionally
 *  absent (QR-gated, no student history surface yet). */
export function studentModules(
  provenanceEnabled: boolean,
  agentsEnabled: boolean,
): StudentModule[] {
  const mods: StudentModule[] = [{ id: "dashboard", label: "Dashboard" }];
  if (agentsEnabled) mods.push({ id: "agents", label: "Agents" });
  if (provenanceEnabled) mods.push({ id: "writing", label: "Writing" });
  return mods;
}

export function StudentModuleNav({
  courseId,
  provenanceEnabled,
  agentsEnabled,
  activeModule = null,
  switcher,
}: StudentModuleNavProps) {
  const home = `/course/${courseId}`;
  const modules = studentModules(provenanceEnabled, agentsEnabled);
  return (
    <>
      <Link to={`${home}/dashboard`} aria-label="Dashboard" className="app-lockup-link">
        <Wordmark />
      </Link>
      {switcher}
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
    </>
  );
}
