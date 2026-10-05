// Student course dashboard — the student's whole view of the course's work,
// in one place. (Module pages exist, but this is where a student lands and
// what they need: everything assigned, with nothing hidden.)
//
// FOUR SECTIONS, in order:
//   * To do — assigned work not yet done. Shows what's overdue or due within
//     the week; "More (N)" reveals the rest (later and undated work), so
//     nothing is out of reach. Sorted by due date by default; "By type" groups
//     the same items by kind. The choice is remembered in this browser only.
//   * Explore — open-ended items with no deadline: agents to talk to,
//     examples to try.
//   * Your own work — documents and notebooks not tied to an assignment.
//   * Completed — done work, entirely separate at the bottom, so finishing
//     something moves it rather than making it vanish.
//
// Every card is the shared ItemCard (the same card instructors see), whole
// card clickable, with one status control on the right: Start (accent) for
// work not begun, Continue for work under way, and no button once done — the
// kind's own word says so instead ("submitted", "finished", "marked done").
// Free-form agents also offer a new chat beside Continue.
//
// The list is course/studentWork.ts, built from the same records every page
// reads. A writing assignment with several checkpoints shows each as its own
// item, but each opens the one document for that assignment and reads "done"
// from that document's real submissions.
import { useEffect, useMemo, useState } from "react";
import { listDocuments, type DocumentSummary } from "../modules/provenance/api.js";
import { listNotebooks, type NotebookSummaryDTO } from "../modules/code/api.js";
import { listAgents, type AgentSummary } from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { listCourseItems, type CourseItemDTO } from "../modules/course-items/api.js";
import { itemTitle } from "../modules/course-items/title.js";
import {
  buildStudentWork,
  byDueDate,
  completedOrder,
  splitAtWeek,
  type WorkItem,
  type WorkKind,
} from "../course/studentWork.js";
import { shortDate } from "../course/dueness.js";
import { PlusIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import { Button, IconButton, ItemCard, SegmentedControl } from "../components/index.js";

type SortMode = "due" | "type";
const SORT_KEY = "marginalia.dashboard.sort";

function readSort(): SortMode {
  try {
    return localStorage.getItem(SORT_KEY) === "type" ? "type" : "due";
  } catch {
    return "due";
  }
}

const GROUPS: { kind: WorkKind; label: string }[] = [
  { kind: "writing", label: "Writing" },
  { kind: "code", label: "Code" },
  { kind: "agent", label: "Agents" },
  { kind: "example", label: "Examples" },
  { kind: "reading", label: "Readings" },
];

export function DashboardPage() {
  const { courseId, courseName, provenanceEnabled, agentsEnabled, codeEnabled } = useCourse();
  const base = `/course/${courseId}`;
  // No preview-specific copy here: a preview runs as the course's sample
  // student, so this page must render exactly what a student sees. The
  // preview banner above it is the only thing that says "preview".

  const [items, setItems] = useState<CourseItemDTO[] | null>(null);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookSummaryDTO[] | null>(null);
  const [sort, setSort] = useState<SortMode>(readSort);
  const [showAll, setShowAll] = useState(false);

  // Each source is best-effort: a failed load shows what the others have
  // rather than blocking the dashboard.
  useEffect(() => {
    const ctrl = new AbortController();
    const settle = <T,>(p: Promise<T>, set: (v: T) => void, empty: T) =>
      p.then(set).catch(() => {
        if (!ctrl.signal.aborted) set(empty);
      });
    void settle(listCourseItems(courseId, {}, ctrl.signal), setItems, []);
    void settle(provenanceEnabled ? listDocuments(courseId, ctrl.signal) : Promise.resolve([]), setDocs, []);
    void settle(codeEnabled ? listNotebooks(courseId, ctrl.signal) : Promise.resolve([]), setNotebooks, []);
    void settle(
      agentsEnabled ? listAgents(courseId).then((r) => r.agents) : Promise.resolve([]),
      setAgents,
      [],
    );
    return () => ctrl.abort();
  }, [courseId, provenanceEnabled, codeEnabled, agentsEnabled]);

  const loading = items === null || agents === null || docs === null || notebooks === null;

  const work = useMemo(
    () =>
      loading
        ? []
        : buildStudentWork({
            courseId,
            items: items!,
            agents: agents!,
            docs: docs!,
            notebooks: notebooks!,
            enabled: { writing: provenanceEnabled, agents: agentsEnabled, code: codeEnabled },
            now: Date.now(),
            titleOf: itemTitle,
          }),
    [loading, courseId, items, agents, docs, notebooks, provenanceEnabled, agentsEnabled, codeEnabled],
  );
  const todo = byDueDate(work.filter((w) => w.state !== "done" && !w.explore));
  const explore = byDueDate(work.filter((w) => w.state !== "done" && w.explore));
  const done = completedOrder(work.filter((w) => w.state === "done"));
  const { week, later } = splitAtWeek(todo, Date.now());
  const shown = showAll ? todo : week;

  // Documents and notebooks of the student's own: not for any current
  // assignment.
  const assignedRefs = new Set(work.map((w) => w.item?.payloadRef).filter(Boolean));
  const ownDocs = (docs ?? []).filter((d) => d.assignmentId === null || !assignedRefs.has(d.assignmentId));
  const ownNotebooks = (notebooks ?? []).filter((n) => n.assignmentId === null);

  const changeSort = (v: string) => {
    const next: SortMode = v === "type" ? "type" : "due";
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // Private window or blocked storage: the choice lasts this visit.
    }
  };

  return (
    <div className="app-home__inner">
      <div className="app-head">
        <span className="eyebrow">{courseName || "Course"}</span>
        <span className="app-rule" />
        <h1>{courseName}</h1>
      </div>

      <div className="app-modstack">
        <section className="app-modpanel app-modpanel--open" data-module="todo">
          <div className="app-modpanel__head">
            <div className="app-modpanel__heading">
              <span className="eyebrow">Assignments</span>
              <h2>To do</h2>
            </div>
            <SegmentedControl
              options={[
                { value: "due", label: "By due date" },
                { value: "type", label: "By type" },
              ]}
              value={sort}
              onChange={changeSort}
            />
          </div>
          <div className="app-modpanel__body">
            {loading ? (
              <p className="app-empty">Loading…</p>
            ) : todo.length === 0 ? (
              <p className="app-empty">
                {done.length > 0 ? "You’re all caught up." : "Nothing has been assigned yet."}
              </p>
            ) : (
              <>
                {shown.length === 0 ? (
                  <p className="app-empty">Nothing due in the next week.</p>
                ) : sort === "due" ? (
                  <WorkList items={shown} />
                ) : (
                  GROUPS.map((g) => {
                    const group = shown.filter((w) => w.kind === g.kind);
                    return group.length === 0 ? null : (
                      <div className="app-dash__group" key={g.kind}>
                        <span className="mono-label">{g.label}</span>
                        <WorkList items={group} />
                      </div>
                    );
                  })
                )}
                {later.length > 0 && (
                  <div className="app-dash__more">
                    <Button variant="subtle" size="sm" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Show the next week only" : `More (${later.length})`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {!loading && explore.length > 0 && (
          <section className="app-modpanel app-modpanel--open" data-module="explore">
            <div className="app-modpanel__head">
              <div className="app-modpanel__heading">
                <span className="eyebrow">Open</span>
                <h2>Explore</h2>
              </div>
            </div>
            <div className="app-modpanel__body">
              <WorkList items={explore} />
            </div>
          </section>
        )}

        {(ownDocs.length > 0 || ownNotebooks.length > 0) && (
          <section className="app-modpanel app-modpanel--open" data-module="own">
            <div className="app-modpanel__head">
              <div className="app-modpanel__heading">
                <span className="eyebrow">Not assigned</span>
                <h2>Your own work</h2>
              </div>
            </div>
            <div className="app-modpanel__body">
              <div className="app-list">
                {ownDocs.map((d) => (
                  <ItemCard
                    key={d.id}
                    kind="writing"
                    seed={d.id}
                    title={d.title || "Untitled"}
                    href={`${base}/writing/${d.id}`}
                    sub={`${d.wordCount.toLocaleString()} word${d.wordCount === 1 ? "" : "s"} · edited ${relativeTime(d.updatedAt)}`}
                    meta={
                      <Button variant="subtle" size="sm" href={`${base}/writing/${d.id}`}>
                        Continue
                      </Button>
                    }
                  />
                ))}
                {ownNotebooks.map((n) => (
                  <ItemCard
                    key={n.id}
                    kind="code"
                    seed={n.id}
                    title={n.title || "Untitled"}
                    href={`${base}/code/${n.id}`}
                    sub={`Notebook · edited ${relativeTime(n.updatedAt)}`}
                    meta={
                      <Button variant="subtle" size="sm" href={`${base}/code/${n.id}`}>
                        Continue
                      </Button>
                    }
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section className="app-modpanel app-modpanel--open" data-module="completed">
            <div className="app-modpanel__head">
              <div className="app-modpanel__heading">
                <span className="eyebrow">Done</span>
                <h2>Completed</h2>
              </div>
              <span className="app-modpanel__meta">{done.length}</span>
            </div>
            <div className="app-modpanel__body">
              <WorkList items={done} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function WorkList({ items }: { items: WorkItem[] }) {
  return (
    <div className="app-list">
      {items.map((w) => (
        <WorkCard key={w.key} w={w} />
      ))}
    </div>
  );
}

function WorkCard({ w }: { w: WorkItem }) {
  const sub =
    w.state === "done" ? (
      <>
        {w.doneLabel ? w.doneLabel.charAt(0).toUpperCase() + w.doneLabel.slice(1) : "Done"}
        {w.dueAt !== null && <> · due {shortDate(w.dueAt)}</>}
        {w.progress && <> · {w.progress}</>}
      </>
    ) : (
      <>
        <span className="app-list__due">{w.dueLine}</span>
        {w.progress && <> · {w.progress}</>}
      </>
    );
  const meta =
    w.state === "new" ? (
      <Button variant="primary" size="sm" href={w.href}>
        Start
      </Button>
    ) : w.state === "started" ? (
      <>
        {w.newChatHref && (
          <IconButton variant="round" size="sm" href={w.newChatHref} title="Start a new chat with this agent">
            <PlusIcon size={16} />
          </IconButton>
        )}
        <Button variant="subtle" size="sm" href={w.href}>
          Continue
        </Button>
      </>
    ) : null;
  return (
    <ItemCard
      kind={w.kind}
      seed={w.seed}
      title={w.title}
      href={w.href}
      sub={sub}
      meta={meta}
      className={w.overdue ? "app-list__row--overdue" : undefined}
    />
  );
}
