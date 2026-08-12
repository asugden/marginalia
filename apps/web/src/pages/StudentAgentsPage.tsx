// Dedicated Agents route (/course/:courseId/agents) — the full agent list as
// its own focused surface, the counterpart to the Writing document list. Until
// now "Agents" was only a scroll target on the home page and had no page of its
// own; this is that page. The list itself lives in AgentsPanel (shared with the
// dashboard), so this file is just the page frame around it.
import { useCourse } from "../course/useCourse.js";
import { AgentsPanel } from "./AgentsPanel.js";

export function StudentAgentsPage() {
  const { courseId } = useCourse();
  return (
    <div className="app-home__inner">
      <div className="app-head">
        <span className="eyebrow">Tutors to talk to</span>
        <span className="app-rule" />
        <h1>Agents</h1>
        <p className="app-head__sub">
          Each one is set up by your instructor — it’ll tell you up front how it
          works and what it’s for, then lead you through it.
        </p>
      </div>
      <div className="app-modstack">
        <AgentsPanel courseId={courseId} />
      </div>
    </div>
  );
}
