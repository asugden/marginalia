// The student module nav — one item per enabled student module (Agents always;
// Writing when the course's provenance module is on). Each item links to the
// course home with a `#module` hash the home reads to scroll the matching panel
// into view. This is the single source of truth for the student nav: the
// StudentLayout topbar renders it, and so does the standalone provenance editor
// (which lives outside StudentLayout but still wants the same way back).
//
// It's presentation-only and context-free — the host passes courseId and the
// module flags — so it works in the editor's context-less route too.
import { Link } from "react-router-dom";
import { Wordmark } from "./index.js";

export interface StudentModuleNavProps {
  courseId: string;
  /** Whether the provenance writing module is on for this course. Drives the
   *  Writing nav item. */
  provenanceEnabled: boolean;
  /** The module currently in view (`"agents"` | `"writing"`), or null when the
   *  nav is shown on a surface that isn't the home scroll-stack (e.g. the
   *  editor) so nothing is highlighted. */
  activeModule?: string | null;
}

interface StudentModule {
  id: string;
  label: string;
}

/** The enabled student modules, in order. Agents is the always-present core;
 *  Writing appears only when the course's provenance module is on. Attendance
 *  is intentionally absent (QR-gated, no student history surface yet). */
export function studentModules(provenanceEnabled: boolean): StudentModule[] {
  const mods: StudentModule[] = [{ id: "agents", label: "Agents" }];
  if (provenanceEnabled) mods.push({ id: "writing", label: "Writing" });
  return mods;
}

export function StudentModuleNav({
  courseId,
  provenanceEnabled,
  activeModule = null,
}: StudentModuleNavProps) {
  const home = `/course/${courseId}`;
  const modules = studentModules(provenanceEnabled);
  return (
    <>
      <Link to={home} aria-label="Home" className="app-lockup-link">
        <Wordmark />
      </Link>
      <nav className="app-nav app-nav--student" aria-label="Course modules">
        {modules.map((mod) => (
          <Link
            key={mod.id}
            to={`${home}#${mod.id}`}
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
