// The Assign band — /course/:id/instructor/assign.
//
// One list showing everything this course has assigned, whatever kind it is:
// writing, agents, and examples today; readings and discussions later. A new
// content type lands here as a ROW, not as a new tab. That is the whole point
// of the wrapper — the nav had been growing a tab per content type, which
// scaled badly and said nothing true about how the pieces relate.
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
  isSupplement,
  kindLabel,
  listCourseItems,
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

/**
 * The scheduling line for a row.
 *
 * "Supplement" is a first-class state, not an empty one: both dates null means
 * the instructor offered something without scheduling it, which is a normal
 * thing to do and reads better than a blank. Every existing agent is in this
 * state after the 0022 backfill.
 */
function scheduleLine(item: CourseItemDTO): string {
  if (isSupplement(item)) return "Supplement — always available";
  const parts: string[] = [];
  if (item.assignedAt !== null) parts.push(`assigned ${formatDay(item.assignedAt)}`);
  parts.push(item.dueAt !== null ? `due ${formatDueTime(item.dueAt)}` : "no deadline");
  return parts.join(" · ");
}

/**
 * Sort: soonest deadline first, undated last.
 *
 * Undated sorts last rather than first because "no deadline" is the instructor
 * declining to schedule something, and a list read for "what's next" should not
 * open with the items that are never next. Archived sinks below everything
 * live. Ties break on the instructor's own `ord`, then title, so the order is
 * stable across reloads instead of depending on fetch timing.
 */
function compareItems(a: CourseItemDTO, b: CourseItemDTO): number {
  const aArch = a.archivedAt !== null;
  const bArch = b.archivedAt !== null;
  if (aArch !== bArch) return aArch ? 1 : -1;
  if (a.dueAt === null && b.dueAt === null) {
    if (a.ord !== b.ord) return a.ord - b.ord;
    return a.title.localeCompare(b.title);
  }
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
  return a.title.localeCompare(b.title);
}

/** Where a row's title links — each kind's detail surface stays with the
 *  module that owns it. This list is a schedule, not a replacement editor. */
function detailHref(courseId: string, item: CourseItemDTO): string | null {
  const base = `/course/${courseId}/instructor`;
  switch (item.kind) {
    case "writing":
      return `${base}/assignments/${item.payloadRef}`;
    case "agent":
      return `${base}/agents/${item.payloadRef}`;
    case "example":
      return `${base}/assign/examples`;
    case "code":
      return `${base}/code/${item.payloadRef}`;
    default:
      return null;
  }
}

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
    () => (items === null ? null : [...items].sort(compareItems)),
    [items],
  );

  async function onToggleArchive(item: CourseItemDTO) {
    try {
      const saved = await updateCourseItem(item.id, {
        courseId,
        archived: item.archivedAt === null,
      });
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

  const liveCount = (items ?? []).filter((i) => i.archivedAt === null).length;
  const archivedCount = (items ?? []).filter((i) => i.archivedAt !== null).length;
  const supplementCount = (items ?? []).filter(
    (i) => i.archivedAt === null && isSupplement(i),
  ).length;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor"
        title="Assign"
        scope="Everything you've set this class, on one list — writing, agents, and examples together, in the order they come due. An item with no dates is a supplement: available the whole term, never late."
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
                archivedCount > 0 ? `${archivedCount} archived` : null,
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
                onArchive={() => onToggleArchive(item)}
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
 * The "New" control. Each kind is authored on its own surface — writing in the
 * assignments editor, agents in the agent editor, examples by curating from the
 * registry — so this navigates rather than opening one universal form. The
 * wrapper schedules content; it does not author it, and a single generic
 * "create anything" form would have to reimplement three editors.
 */
function NewItemControl({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  // Code is an opt-in module: it appears in this menu only once the course
  // has turned it on, so a course that never uses it never sees it.
  const { codeEnabled } = useCourse();
  return (
    <Dropdown
      value=""
      placeholder="New"
      ariaLabel="Assign something"
      align="end"
      options={[
        { value: "writing", label: "Writing assignment" },
        { value: "agent", label: "Agent" },
        { value: "example", label: "Example" },
        ...(codeEnabled ? [{ value: "code", label: "Coding assignment" }] : []),
      ]}
      onChange={(v) => {
        const base = `/course/${courseId}/instructor`;
        if (v === "writing") navigate(`${base}/assignments`);
        else if (v === "agent") navigate(`${base}/agents`);
        else if (v === "code") navigate(`${base}/code`);
        else navigate(`${base}/assign/examples`);
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
  onArchive,
  onUnassign,
}: {
  courseId: string;
  item: CourseItemDTO;
  onArchive: () => void;
  onUnassign: () => void;
}) {
  const archived = item.archivedAt !== null;
  const href = detailHref(courseId, item);

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
          {archived && (
            <>
              {" "}
              <Badge tone="neutral">archived</Badge>
            </>
          )}
          {dangling && (
            <>
              {" "}
              <Badge tone="warning">content missing</Badge>
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
          ) : (
            <>
              {scheduleLine(item)}
              {item.kind === "writing" && <WritingCheckpoints item={item} />}
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
        <Button variant="subtle" size="sm" onClick={onArchive}>
          {archived ? "Unarchive" : "Archive"}
        </Button>
        <Button variant="danger" size="sm" onClick={onUnassign}>
          Unassign
        </Button>
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

/**
 * Writing's checkpoints, inline.
 *
 * Writing is the one kind needing several dated moments — "draft Monday, final
 * Wednesday" is ONE assignment the student keeps one document across. The other
 * kinds are the one-date case, which is why the wrapper holds a single
 * `due_at` and writing keeps its own checkpoint rows.
 */
function WritingCheckpoints({ item }: { item: CourseItemDTO }) {
  const p = item.payload as unknown as WritingPayload | null;
  if (!p || p.checkpoints.length === 0) return null;
  return (
    <>
      {" · "}
      {p.checkpoints
        .map((c) => `${c.name} ${c.dueAt === null ? "(no deadline)" : formatDay(c.dueAt)}`)
        .join(" · ")}
    </>
  );
}
