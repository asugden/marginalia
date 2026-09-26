// Student course dashboard — a "Due next" strip on top, then a stack of the
// course's module panels (Agents, Writing, Code, Examples) so they read as
// peers. This is where the logo and the "Dashboard" nav item land. The focused
// per-module routes (/agents, /writing) hold the full lists; the dashboard is
// the at-a-glance combined view.
//
// A PANEL APPEARS ONLY WHEN ITS MODULE HAS CONTENT. An enabled-but-empty
// module already has a nav item; an empty panel under it on the course home
// is the same noise twice. So every panel hides itself (or is hidden here)
// until the course has actually set something in it — the rule ExamplesPanel
// established. The module remains reachable from the nav either way.
//
// THE DUE-NEXT STRIP reuses the instructor dashboard's machinery wholesale:
// course/dueness.ts buckets `course_items` by deadline, and the shared
// ItemRows renders the identical row grid — kind · title · date · phrase —
// with studentHref instead of instructorHref. Completion here is the
// CALLER'S OWN (the endpoint's contract), which is exactly right on this
// page: overdue-but-submitted items are dropped (nothing left to act on),
// and upcoming ones carry their own verb ("submitted", "marked done").
//
// Each panel is self-contained: Agents lives in AgentsPanel (shared with the
// dedicated /agents page); Writing is inline here (its dedicated page is the
// provenance DocumentListPage); Code and Examples live in their own modules'
// CodePanel / ExamplesPanel.
//
// EVERY ENABLED MODULE NEEDS A PANEL HERE. The Code one was missing for a
// while: the course got a Code nav item and a working /code route, but its
// assignments never appeared on the course home the way writing ones did. If
// you add a module with a student surface, add its panel in this stack too
// (self-hiding when empty). Course id / name / flags come from useCourse()
// (the shell validated enrollment).
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createDocument,
  listDocuments,
  type DocumentSummary,
} from "../modules/provenance/api.js";
import { useCourse } from "../course/useCourse.js";
import {
  completionLabel,
  listCourseItems,
  studentHref,
  type CourseItemDTO,
} from "../modules/course-items/api.js";
import { ItemRows } from "../modules/course-items/components/ItemRows.js";
import { overdueItems, upcomingItems } from "../course/dueness.js";
import { ArrowIcon, DocIcon, PencilIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import { Button } from "../components/index.js";
import { AgentsPanel } from "./AgentsPanel.js";

// Lazy: DashboardPage is eagerly bundled (it is the student landing), and the
// code module drags in the notebook editor and its Python kernel. A course
// without Code enabled must not pay for that, and one with it enabled can load
// the panel a beat late.
const CodePanel = lazy(() =>
  import("../modules/code/index.js").then((m) => ({ default: m.CodePanel })));

// Examples has no enable flag — it is always on, gated only by whether the
// instructor assigned any. The panel decides that for itself and renders null
// when nothing is assigned, so there is no flag to check here.
const ExamplesPanel = lazy(() =>
  import("../modules/examples/index.js").then((m) => ({ default: m.ExamplesPanel })));

export function DashboardPage() {
  const {
    courseId,
    courseName,
    role,
    provenanceEnabled,
    agentsEnabled,
    codeEnabled,
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
  const [items, setItems] = useState<CourseItemDTO[] | null>(null);
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

  // The combined assigned-work list, for the due-next strip and for deciding
  // whether the Writing panel has anything set. Best-effort like the rest.
  useEffect(() => {
    const ctrl = new AbortController();
    listCourseItems(courseId, {}, ctrl.signal)
      .then((i) => setItems(i))
      .catch(() => {
        if (!ctrl.signal.aborted) setItems([]);
      });
    return () => ctrl.abort();
  }, [courseId]);

  // One `now` per render so every bucket and label agrees (same rule as the
  // instructor dashboard). Overdue items the student already completed are
  // dropped — there is nothing left to act on, and a red "overdue" next to
  // "submitted" would contradict itself. Upcoming keeps completed rows, with
  // their own completion verb, so a student sees what's already in.
  const now = Date.now();
  const all = items ?? [];
  const overdue = overdueItems(all, now).filter(
    (d) => completionLabel(d.item.completion) === null,
  );
  const upcoming = upcomingItems(all, now, { limit: 6 });
  const dueRows = [...overdue, ...upcoming];

  // Writing panel gate: shown when the course has set writing work, or when
  // this student already has documents to get back to.
  const hasWritingAssignments = all.some(
    (i) => i.kind === "writing" && i.archivedAt == null && !i.dangling,
  );
  const showWriting =
    provenanceEnabled && ((docs?.length ?? 0) > 0 || hasWritingAssignments);

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
        {/* ── Due next — the cross-module deadline strip, always on top ──── */}
        {dueRows.length > 0 && (
          <section
            className="app-modpanel app-modpanel--open"
            data-module="due-next"
          >
            <div className="app-modpanel__head">
              <div className="app-modpanel__heading">
                <span className="eyebrow">This week</span>
                <h2>Due next</h2>
              </div>
              {overdue.length > 0 && (
                <span className="app-modpanel__meta">
                  {overdue.length} overdue
                </span>
              )}
            </div>
            <div className="app-modpanel__body">
              <ItemRows
                rows={dueRows}
                hrefFor={(item) => studentHref(courseId, item)}
                showCompletion
              />
            </div>
          </section>
        )}

        {/* ── Agents — enabled AND the course has some ───────────────────── */}
        {agentsEnabled && <AgentsPanel courseId={courseId} hideWhenEmpty />}

        {/* ── Writing (provenance) — enabled AND there's something to show:
            assigned writing work, or this student's own documents ────────── */}
        {showWriting && (
          <section
            className="app-modpanel app-modpanel--open"
            data-module="writing"
          >
            <div className="app-modpanel__head">
              <div className="app-modpanel__heading">
                <span className="eyebrow">Provenance</span>
                <h2><Link to={`${base}/writing`}>Writing</Link></h2>
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

        {/* ── Code (Python notebooks) — enabled AND has live assignments
            (the panel hides itself; scratch stays on the Code nav item) ──── */}
        {codeEnabled && (
          <Suspense fallback={null}>
            <CodePanel courseId={courseId} />
          </Suspense>
        )}

        {/* ── Examples — assigned ones only; the panel hides itself when the
            course has assigned none. Browsing every example stays at
            /examples, which this deliberately does not duplicate. ─────────── */}
        <Suspense fallback={null}>
          <ExamplesPanel courseId={courseId} />
        </Suspense>

        {/* No Attendance panel: check-in is QR-gated (a student arrives via a
            scanned session code at /a/:id), and there is no student-facing
            attendance-HISTORY API yet. When a student can see their own past
            check-in statuses, re-add an Attendance module panel here (and the
            nav item in StudentModuleNav), gated on `showAttendance`. */}
      </div>
    </div>
  );
}
