// Assign ▸ All — /course/:id/instructor/assign.
//
// One list showing everything this course has assigned, whatever kind it is:
// writing, code, agents, and examples. The Assign menu in the header lists each
// kind's own page; this "All" entry appears only when more than one kind is on,
// since with one kind it would just repeat that kind's page.
//
// This is the Assign (authoring) side, so it lists one row per ASSIGNMENT: a
// writing assignment's checkpoints appear inline ("Draft due Oct 3 · Final due
// Oct 10"; a lone checkpoint is just "due Oct 3", never "Final"). Review ▸
// Submissions is where each checkpoint is listed as its own assignment.
//
// Visibility: writing and code rows carry the assignment's real Draft /
// Published state and can be published from here. Agents and examples have
// no draft state — their row can only be unassigned (taken off the schedule).
//
// This page supersedes the earlier combined AssignmentsPage, which unified
// writing and examples in the presentation layer only. Here the union is real:
// `course_items` is one table with one ordering, and each row resolves its own
// payload. Writing's own editor still lives on its page — this list schedules,
// it does not author.
//
// ── The rule that governs the status column ───────────────────────────────
//
// Completion is NOT one concept, and this page must never imply it is. Each
// kind reports a DIFFERENT VERB, from a different source:
//
//   Writing   "submitted"    an artifact the student minted
//   Agent     "finished"     server-derived, from a backbone reaching its exit
//   Example   "marked done"  the student's own opt-in claim
//
// A backbone exit is evidence; a checkbox is a claim. A single shared
// checkmark across all three would quietly present a self-report as something
// verified — the same class of error the provenance module's
// no-false-positives rule exists to prevent. The verb comes from
// `completionLabel()` and is rendered verbatim; never re-derive a tick from the
// boolean inside the union.
//
// There is deliberately no score, no verdict, no risk column, and no
// per-student grid on this page. Class-wide state lives on the per-module
// rosters, where each kind's own rules already apply.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import {
  completionLabel,
  deleteCourseItem,
  instructorHref,
  isSupplement,
  kindLabel,
  listCourseItems,
  setAssignmentPublished,
  updateCourseItem,
  type CourseItemDTO,
  type ItemKind,
  type WritingPayload,
} from "../api.js";
import { findExample } from "../../../examples/registry.js";
import {
  Badge,
  Button,
  Dropdown,
  PageHeader,
  Section,
  useConfirm,
} from "../../../components/index.js";

/** Epoch ms → a short human date. Dates set through the curation editors are
 *  day-granular, so a bare day reads truer than a day plus "12:00 AM". */
function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDueTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Checkpoint = WritingPayload["checkpoints"][number];

/** A writing item's checkpoints, or [] for every other kind. */
function checkpointsOf(item: CourseItemDTO): Checkpoint[] {
  if (item.kind !== "writing") return [];
  return (item.payload as unknown as WritingPayload | null)?.checkpoints ?? [];
}

/** A row's deadline for sorting. Writing: the soonest checkpoint still ahead,
 *  else the latest one passed. Everything else: the item's own. */
function itemDue(item: CourseItemDTO, now: number): number | null {
  const cps = checkpointsOf(item);
  if (cps.length === 0) return item.dueAt;
  const dated = cps.map((c) => c.dueAt).filter((d): d is number => d !== null);
  if (dated.length === 0) return null;
  const upcoming = dated.filter((d) => d >= now);
  return upcoming.length > 0 ? Math.min(...upcoming) : Math.max(...dated);
}

/**
 * The scheduling line for a row.
 *
 * "Supplement" is a first-class state, not an empty one: both dates null means
 * the instructor offered something without scheduling it, which is a normal
 * thing to do and reads better than a blank. Every existing agent is in this
 * state after the 0022 backfill. Writing shows its checkpoints instead — a
 * lone checkpoint by its date alone, never by its name.
 */
function scheduleLine(item: CourseItemDTO): string {
  const cps = checkpointsOf(item);
  const due = (ms: number | null) => (ms === null ? "no deadline" : `due ${formatDueTime(ms)}`);
  if (cps.length === 1) return due(cps[0]!.dueAt);
  if (cps.length > 1) return cps.map((c) => `${c.name} ${due(c.dueAt)}`).join(" · ");
  if (isSupplement(item)) return "Supplement — always available";
  const parts: string[] = [];
  if (item.assignedAt !== null) parts.push(`assigned ${formatDay(item.assignedAt)}`);
  parts.push(due(item.dueAt));
  return parts.join(" · ");
}

/**
 * Sort: drafts / hidden first (they wait on the instructor), then soonest
 * deadline, undated last.
 *
 * Undated sorts last rather than first because "no deadline" is the instructor
 * declining to schedule something, and a list read for "what's next" should not
 * open with the items that are never next. Ties break on the instructor's own
 * `ord`, then title, so the order is stable across reloads instead of depending
 * on fetch timing.
 */
function compareItems(a: CourseItemDTO, b: CourseItemDTO, now: number): number {
  const aHidden = a.archivedAt !== null;
  const bHidden = b.archivedAt !== null;
  if (aHidden !== bHidden) return aHidden ? -1 : 1;
  const aDue = itemDue(a, now);
  const bDue = itemDue(b, now);
  if (aDue === null && bDue === null) {
    if (a.ord !== b.ord) return a.ord - b.ord;
    return a.title.localeCompare(b.title);
  }
  if (aDue === null) return 1;
  if (bDue === null) return -1;
  if (aDue !== bDue) return aDue - bDue;
  return a.title.localeCompare(b.title);
}

/** Where a row's title links — each kind's detail surface stays with the
 *  module that owns it. This list is a schedule, not a replacement editor. */
export function AssignPage() {
  const { courseId } = useCourse();
  const [items, setItems] = useState<CourseItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    setItems(null);
    setError(null);
    const ctrl = new AbortController();
    listCourseItems(courseId, { includeArchived: true }, ctrl.signal)
      .then((rows) => {
        if (!ctrl.signal.aborted) setItems(rows);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  const sorted = useMemo(
    () => {
      if (items === null) return null;
      const now = Date.now();
      return [...items].sort((a, b) => compareItems(a, b, now));
    },
    [items],
  );

  async function reload() {
    setItems(await listCourseItems(courseId, { includeArchived: true }));
  }

  /** Writing / code: the assignment's own Draft ⇄ Published. */
  async function onTogglePublished(item: CourseItemDTO) {
    try {
      await setAssignmentPublished(courseId, item, item.archivedAt !== null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  /** Agents / examples hidden by the old Archive button: put the row back on
   *  the schedule. No new row gets into this state any more. */
  async function onRestore(item: CourseItemDTO) {
    try {
      const saved = await updateCourseItem(item.id, { courseId, archived: false });
      setItems((cur) => (cur ?? []).map((i) => (i.id === saved.id ? saved : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function onUnassign(item: CourseItemDTO) {
    if (
      !(await confirm({
        title: `Unassign “${item.title}”?`,
        body: "This takes it off the schedule. The content itself is kept, and so is everything students have already done with it — unassigning is not deleting.",
        confirmLabel: "Unassign",
      }))
    )
      return;
    try {
      await deleteCourseItem(courseId, item.id);
      setItems((cur) => (cur ?? []).filter((i) => i.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unassign failed");
    }
  }

  const all = sorted ?? [];
  const liveCount = all.filter((i) => i.archivedAt === null).length;
  const hiddenCount = all.length - liveCount;
  const supplementCount = all.filter(
    (i) => i.archivedAt === null && i.kind !== "writing" && isSupplement(i),
  ).length;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Assign"
        title="All assignments"
        scope="Everything you've set this class, on one list, in the order it comes due. An item with no dates is a supplement: available the whole term, never late."
      />

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Set for this course"
        meta={
          sorted === null
            ? undefined
            : [
                `${liveCount} item${liveCount === 1 ? "" : "s"}`,
                supplementCount > 0 ? `${supplementCount} supplement` : null,
                hiddenCount > 0 ? `${hiddenCount} not visible to students` : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
        actions={<NewItemControl courseId={courseId} />}
      >
        {sorted === null ? (
          <p className="muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="muted">
            Nothing assigned yet. Add a writing assignment, put an agent on the
            schedule, or assign an example for students to work through.
          </p>
        ) : (
          <div className="app-list">
            {sorted.map((item) => (
              <ItemRow
                key={item.id}
                courseId={courseId}
                item={item}
                onTogglePublished={() => onTogglePublished(item)}
                onRestore={() => onRestore(item)}
                onUnassign={() => onUnassign(item)}
              />
            ))}
          </div>
        )}
      </Section>
      {confirmDialog}
    </div>
  );
}

/**
 * The "New" control. Each kind is authored on its own surface, so this
 * navigates rather than opening one universal form — and it navigates straight
 * to that kind's CREATE form (never to a list the instructor then has to find
 * a "New" button on). Examples have no create form: they are curated from the
 * registry, so that page is where "new" lands.
 */
function NewItemControl({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  // The menu respects which modules this course has turned on: a kind is only
  // offered when the module that authors it is enabled, so a course with
  // Writing off is never sent to a writing editor its students can't see.
  // Examples are always assignable — they're public pages, not a module.
  const { codeEnabled, provenanceEnabled, agentsEnabled, genaiOptOut } = useCourse();
  return (
    <Dropdown
      value=""
      placeholder="New"
      ariaLabel="Assign something"
      align="end"
      options={[
        ...(provenanceEnabled ? [{ value: "writing", label: "Writing assignment" }] : []),
        ...(agentsEnabled && !genaiOptOut ? [{ value: "agent", label: "Agent" }] : []),
        { value: "example", label: "Example" },
        ...(codeEnabled ? [{ value: "code", label: "Coding assignment" }] : []),
      ]}
      onChange={(v) => {
        const base = `/course/${courseId}/instructor`;
        if (v === "writing") navigate(`${base}/assignments/new`);
        else if (v === "agent") navigate(`${base}/agents/new`);
        else if (v === "code") navigate(`${base}/code/new`);
        else if (v === "example") navigate(`${base}/assign/examples`);
        // No catch-all: a future kind must be wired here explicitly rather
        // than silently landing on the examples curation page.
      }}
    />
  );
}

/**
 * Type tag. Says what a row IS, and must never become a place to say how a row
 * is GOING — no "overdue", no "at risk", no tone change based on completion.
 *
 * "Agent" is the decided student-facing label and stays: in an AI course the
 * real term is part of the content, so students learning that the thing they
 * talk to is an agent is pedagogically useful rather than jargon leakage.
 */
function KindBadge({ kind }: { kind: ItemKind }) {
  return <Badge tone="neutral">{kindLabel(kind)}</Badge>;
}

function ItemRow({
  courseId,
  item,
  onTogglePublished,
  onRestore,
  onUnassign,
}: {
  courseId: string;
  item: CourseItemDTO;
  onTogglePublished: () => void;
  onRestore: () => void;
  onUnassign: () => void;
}) {
  const hidden = item.archivedAt !== null;
  // Writing and code have a real Draft / Published state; agents and examples
  // don't (see the file header).
  const publishable = item.kind === "writing" || item.kind === "code";
  const href = instructorHref(courseId, item);
  // A row whose module has since been turned off is stated rather than hidden:
  // students can't see it (their surfaces filter by the same flags), and the
  // instructor is the only one who can either unassign it or turn the module
  // back on in Settings.
  const { provenanceEnabled, agentsEnabled, codeEnabled } = useCourse();
  const moduleOff =
    (item.kind === "writing" && !provenanceEnabled) ||
    (item.kind === "agent" && !agentsEnabled) ||
    (item.kind === "code" && !codeEnabled);

  // The instructor's own completion state for their own account. Shown because
  // an instructor previewing an assignment is a normal thing to do, and the
  // endpoint returns the caller's own state by design — never the class's.
  const mine = completionLabel(item.completion);

  // An example whose slug the registry no longer knows is dangling in the same
  // way a deleted agent is. The worker already marks payload-less rows, and
  // the registry check catches the front-end-only case.
  const missingExample = item.kind === "example" && !findExample(item.payloadRef);
  const dangling = item.dangling || missingExample;
  // An example wrapper stores the slug as its title (the worker cannot see
  // the registry); show the registry's title instead, falling back to the
  // slug if the registry no longer knows it.
  const title =
    item.kind === "example" && !missingExample
      ? findExample(item.payloadRef)?.title ?? item.title
      : item.title;

  return (
    <div className="app-list__row prov-asg__row">
      <div className="app-list__main">
        <div className="app-list__title">
          {href && !dangling ? (
            <Link to={href}>{title}</Link>
          ) : (
            <span>{title}</span>
          )}{" "}
          <KindBadge kind={item.kind} />
          {item.kind === "agent" && !dangling && <AgentTraits item={item} />}
          {hidden && (
            <>
              {" "}
              <Badge tone="warning">{publishable ? "Draft" : "Off the schedule"}</Badge>
            </>
          )}
          {dangling && (
            <>
              {" "}
              <Badge tone="warning">content missing</Badge>
            </>
          )}
          {moduleOff && !dangling && (
            <>
              {" "}
              <Badge tone="warning">module off</Badge>
            </>
          )}
        </div>
        <div className="app-list__sub">
          {dangling ? (
            // Stated plainly rather than hidden: the row is why something
            // vanished from the student list, and the instructor is the only
            // one who can clean it up.
            <>
              The {kindLabel(item.kind).toLowerCase()} this points at no longer
              exists. Students don't see it. Unassign to clear the row.
            </>
          ) : moduleOff ? (
            <>
              The {item.kind === "agent" ? "Agents" : kindLabel(item.kind)}{" "}
              module is turned off for this course, so students don't see this.
              Turn it back on in Settings, or unassign to clear the row.
            </>
          ) : (
            <>
              {scheduleLine(item)}
              {hidden && publishable && " · students can't see this yet"}
              {/* The verb is per-kind and rendered verbatim — see the file
                  header. Absent when the caller hasn't done it, rather than
                  printed as a negative: this is the instructor's own state,
                  and "not finished" about oneself is noise. */}
              {mine && <> · you: {mine}</>}
              {item.note && <> · {item.note}</>}
            </>
          )}
        </div>
      </div>
      <div className="app-list__meta prov-asg__actions">
        {item.kind === "example" && !dangling && (
          <a
            className="ex-preview-link"
            href={`/examples/${item.payloadRef}`}
            target="_blank"
            rel="noreferrer"
          >
            Preview
          </a>
        )}
        {publishable && !dangling ? (
          // Deleting a writing or code assignment is done on its own page,
          // where the consequences for its submissions are spelled out.
          <Button variant="subtle" size="sm" onClick={onTogglePublished}>
            {hidden ? "Publish" : "Unpublish"}
          </Button>
        ) : (
          <>
            {hidden && (
              <Button variant="subtle" size="sm" onClick={onRestore}>
                Put back on schedule
              </Button>
            )}
            <button type="button" className="danger-link" onClick={onUnassign}>
              Unassign
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Guided vs. free-form renders as a property of the agent, not as a separate
 *  type — an agent is one kind of thing whether or not it carries an outline. */
function AgentTraits({ item }: { item: CourseItemDTO }) {
  const p = item.payload as { guided?: boolean; grounded?: boolean } | null;
  if (!p) return null;
  return (
    <>
      {p.guided && (
        <>
          {" "}
          <Badge tone="neutral">guided</Badge>
        </>
      )}
      {p.grounded && (
        <>
          {" "}
          <Badge tone="neutral">sources</Badge>
        </>
      )}
    </>
  );
}
