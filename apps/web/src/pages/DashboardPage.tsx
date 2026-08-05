// Student course dashboard — the course's overview, a stack of its enabled
// module panels (Agents always; Writing when provenance is on) so they read as
// peers. This is where the logo and the "Dashboard" nav item land. The focused
// per-module routes (/agents, /writing) hold the full lists; the dashboard is
// the at-a-glance combined view.
//
// Each panel is self-contained: Agents lives in AgentsPanel (shared with the
// dedicated /agents page); Writing is inline here (its dedicated page is the
// provenance DocumentListPage). Course id / name / flags come from useCourse()
// (the shell validated enrollment).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createDocument,
  listDocuments,
  type DocumentSummary,
} from "../modules/provenance/api.js";
import { useCourse } from "../course/useCourse.js";
import { ArrowIcon, DocIcon, PencilIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import { Button } from "../components/index.js";
import { AgentsPanel } from "./AgentsPanel.js";

export function DashboardPage() {
  const {
    courseId,
    courseName,
    role,
    provenanceEnabled,
    agentsEnabled,
    actingAsStudent,
  } = useCourse();
  const navigate = useNavigate();
  const base = `/course/${courseId}`;
  // "Preview as student" is true either because an instructor is on their own
  // course root, or because the act-as-student downgrade is active (in which
  // case `role` already reads `student`). Either way, frame this as a preview.
  const scoped = role === "instructor" || actingAsStudent;
  // Editor links carry ?preview=1 as a belt-and-suspenders signal for the
  // standalone editor. (The editor also reads the act-as-student flag directly,
  // so this is a legacy fallback; harmless to keep.)
  const editorSuffix = scoped ? "?preview=1" : "";

  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);

  // Writing module data. Best-effort: a failed load leaves the panel empty
  // rather than blocking the whole dashboard.
  useEffect(() => {
    const ctrl = new AbortController();
    listDocuments(courseId, ctrl.signal)
      .then((d) => setDocs(d))
      .catch(() => {
        if (!ctrl.signal.aborted) setDocs([]);
      });
    return () => ctrl.abort();
  }, [courseId]);

  async function onNewDocument() {
    if (creatingDoc) return;
    setCreatingDoc(true);
    try {
      const doc = await createDocument(courseId);
      navigate(`${base}/writing/${doc.id}${editorSuffix}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start a document");
      setCreatingDoc(false);
    }
  }

  return (
    <div className="app-home__inner">
      <div className="app-head">
        <span className="eyebrow">
          {scoped ? "Course preview" : courseName || "Course"}
        </span>
        <span className="app-rule" />
        <h1>{courseName}</h1>
        <p className="app-head__sub">
          {scoped
            ? "The student’s view of this course — every module it has turned on."
            : "Each one is set up by your instructor — it’ll tell you up front how it works and what it’s for, then lead you through it."}
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="app-modstack">
        {/* ── Agents — only when the Agents extension is enabled ─────────── */}
        {agentsEnabled && <AgentsPanel courseId={courseId} />}

        {/* ── Writing (provenance) — only when the module is enabled ─────── */}
        {provenanceEnabled && (
          <section
            className="app-modpanel app-modpanel--open"
            data-module="writing"
          >
            <div className="app-modpanel__head">
              <div className="app-modpanel__heading">
                <span className="eyebrow">Provenance</span>
                <h2>Writing</h2>
              </div>
              {docs && docs.length > 0 && (
                <span className="app-modpanel__meta">
                  {docs.length} document{docs.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="app-modpanel__body">
              <div className="app-writing__intro">
                <p className="app-writing__note">
                  Write here and every word is tagged by where it came from —
                  typed, pasted, or generated — so you can share the history of
                  your work.
                </p>
                <Button
                  variant="primary"
                  icon={<PencilIcon size={16} />}
                  onClick={onNewDocument}
                  loading={creatingDoc}
                  disabled={creatingDoc}
                >
                  New document
                </Button>
              </div>
              {docs === null ? (
                <p className="app-empty">Loading…</p>
              ) : docs.length === 0 ? (
                <p className="app-papers__empty">
                  No documents in this course yet.
                </p>
              ) : (
                <ul className="app-papers__list">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <a
                        href={`${base}/writing/${d.id}${editorSuffix}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`${base}/writing/${d.id}${editorSuffix}`);
                        }}
                      >
                        <span className="app-papers__ic" aria-hidden>
                          <DocIcon size={18} />
                        </span>
                        <span className="app-papers__main">
                          <span className="app-papers__title">{d.title}</span>
                          <span className="app-papers__meta">
                            {d.wordCount.toLocaleString()} word
                            {d.wordCount === 1 ? "" : "s"}
                            <i>·</i>
                            edited {relativeTime(d.updatedAt)}
                          </span>
                        </span>
                        <span className="app-papers__go" aria-hidden>
                          <ArrowIcon size={18} />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* No Attendance panel: check-in is QR-gated (a student arrives via a
            scanned session code at /a/:id), and there is no student-facing
            attendance-HISTORY API yet. When a student can see their own past
            check-in statuses, re-add an Attendance module panel here (and the
            nav item in StudentModuleNav), gated on `showAttendance`. */}
      </div>
    </div>
  );
}
