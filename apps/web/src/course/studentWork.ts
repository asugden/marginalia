// The student dashboard's model: every piece of assigned work as one list,
// each item knowing its state (new / started / done), where it opens, and how
// its deadline reads. Built from the same records every other page reads —
// course items (what's assigned, when, and whether it's done), the agents
// list (conversations), the student's documents and notebooks (started) — so
// a writing checkpoint listed as its own item still opens the one document
// for its assignment, and its "done" is that document's real submissions.
//
// Pure: no React, no fetching. DashboardPage renders it.

import type { AgentSummary } from "../client.js";
import type { CourseItemDTO } from "../modules/course-items/api.js";
import { completionLabel, studentHref } from "../modules/course-items/api.js";
import { daysBetween, duePhrase, expandCheckpoints, shortDate } from "./dueness.js";
import { relativeTime } from "../time.js";

export type WorkState = "new" | "started" | "done";
export type WorkKind = "writing" | "code" | "agent" | "example" | "reading";

export interface WorkItem {
  key: string;
  kind: WorkKind;
  /** The mark's tint seed — the same id other pages use for this item. */
  seed: string;
  /** The course item's own id, for resolving its title (examples). */
  item: CourseItemDTO | null;
  title: string;
  /** Where the card opens: the item's next step. */
  href: string;
  state: WorkState;
  /** The kind's own word for done: "submitted", "finished", "marked done". */
  doneLabel: string | null;
  dueAt: number | null;
  overdue: boolean;
  /** "Due Oct 4 · Due in 3 days", or "No deadline". */
  dueLine: string;
  /** What the student has done so far: "420 words · edited 4h ago". */
  progress: string | null;
  /** Free-form agents only: a fresh chat beside Continue. */
  newChatHref: string | null;
  /** Instructor ordering, for undated items. */
  ord: number;
  /** Open-ended, explorable: an agent or example with no deadline. Listed
   *  under Explore rather than To do. Assigned writing and code are work
   *  even without a deadline, so they never count. */
  explore: boolean;
}

export interface StudentWorkInput {
  courseId: string;
  items: CourseItemDTO[];
  agents: AgentSummary[];
  docs: { id: string; assignmentId: string | null; wordCount: number; updatedAt: number }[];
  notebooks: { id: string; assignmentId: string | null; updatedAt: number }[];
  enabled: { writing: boolean; agents: boolean; code: boolean };
  now: number;
  /** Resolves an item's display title (examples are stored by slug). */
  titleOf: (item: CourseItemDTO) => string;
}

const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;

export function buildStudentWork(input: StudentWorkInput): WorkItem[] {
  const { courseId, now } = input;
  const base = `/course/${courseId}`;
  const live = expandCheckpoints(
    input.items.filter(
      (i) =>
        i.archivedAt == null &&
        !i.dangling &&
        (i.kind === "writing"
          ? input.enabled.writing
          : i.kind === "agent"
            ? input.enabled.agents
            : i.kind === "code"
              ? input.enabled.code
              : true),
    ),
  );

  const dueParts = (dueAt: number | null) => {
    if (dueAt === null) return { overdue: false, dueLine: "No deadline" };
    const daysOut = daysBetween(now, dueAt);
    return { overdue: daysOut < 0, dueLine: `${shortDate(dueAt)} · ${duePhrase(daysOut)}` };
  };

  const out: WorkItem[] = [];
  const agentsSeen = new Set<string>();

  for (const item of live) {
    const done = completionLabel(item.completion);
    const common = {
      explore: item.dueAt === null && item.assignedAt === null && item.kind !== "writing" && item.kind !== "code",
      key: item.id,
      kind: item.kind as WorkKind,
      seed: item.checkpoint?.id ?? item.payloadRef,
      item,
      title: input.titleOf(item),
      dueAt: item.dueAt,
      ord: item.ord,
      doneLabel: done,
      newChatHref: null as string | null,
    };
    if (item.kind === "agent") {
      const a = input.agents.find((x) => x.id === item.payloadRef);
      if (!a) continue; // not visible to this student
      agentsSeen.add(a.id);
      out.push({ ...common, ...agentParts(a, base, done), ...dueParts(item.dueAt) });
      continue;
    }
    let started = false;
    let progress: string | null = null;
    if (item.kind === "writing") {
      const doc = input.docs.find((d) => d.assignmentId === item.payloadRef);
      if (doc) {
        started = true;
        progress = `${plural(doc.wordCount, "word")} · edited ${relativeTime(doc.updatedAt)}`;
      }
    } else if (item.kind === "code") {
      const nb = input.notebooks.find((n) => n.assignmentId === item.payloadRef);
      if (nb) {
        started = true;
        progress = `edited ${relativeTime(nb.updatedAt)}`;
      }
    }
    out.push({
      ...common,
      href: studentHref(courseId, item) ?? base,
      state: done ? "done" : started ? "started" : "new",
      progress,
      ...dueParts(item.dueAt),
    });
  }

  // Agents the student can use that aren't on the schedule still belong on
  // the dashboard: nothing a student can open should be invisible here.
  if (input.enabled.agents) {
    for (const a of input.agents) {
      if (agentsSeen.has(a.id)) continue;
      out.push({
        key: `agent:${a.id}`,
        kind: "agent",
        seed: a.id,
        item: null,
        title: a.title,
        dueAt: null,
        ord: Number.MAX_SAFE_INTEGER,
        explore: true,
        ...agentParts(a, base, null),
        ...dueParts(null),
      });
    }
  }

  // An overdue item reads as overdue only while it's still to do.
  return out.map((w) => (w.state === "done" ? { ...w, overdue: false } : w));
}

function agentParts(a: AgentSummary, base: string, done: string | null) {
  const inProgress = a.lastConversationId !== null && a.lastCompletedAt === null;
  // A guided agent is done once a conversation reached its end; a free-form
  // agent has no end, so it is never "done".
  const finished = a.hasBackbone && (a.lastCompletedAt !== null || done !== null);
  const startHref = `${base}/chat/new/${a.id}`;
  const continueHref = a.lastConversationId ? `${base}/chat/${a.lastConversationId}` : startHref;
  return {
    href: finished ? continueHref : inProgress ? continueHref : startHref,
    state: (finished ? "done" : a.lastConversationId ? "started" : "new") as WorkState,
    doneLabel: finished ? "finished" : null,
    progress: [
      a.hasBackbone ? "Guided" : "Free-form",
      a.lastUpdatedAt ? `last chat ${relativeTime(a.lastUpdatedAt)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    newChatHref: !a.hasBackbone && a.lastConversationId ? startHref : null,
  };
}

/** Overdue first (oldest first), then by deadline, then undated in the
 *  instructor's order. */
export function byDueDate(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.dueAt === null || b.dueAt === null) {
      if (a.dueAt !== b.dueAt) return a.dueAt === null ? 1 : -1;
      return a.ord - b.ord;
    }
    return a.dueAt - b.dueAt;
  });
}

/** To do, split at the week: what's overdue or due within 7 days is shown
 *  first; the rest (later deadlines, no deadline) sits behind "More". */
export function splitAtWeek(items: WorkItem[], now: number): { week: WorkItem[]; later: WorkItem[] } {
  const inWeek = (w: WorkItem) => w.dueAt !== null && daysBetween(now, w.dueAt) <= 7;
  return { week: items.filter(inWeek), later: items.filter((w) => !inWeek(w)) };
}

/** Completed work, most recently due first. */
export function completedOrder(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0) || a.ord - b.ord);
}
