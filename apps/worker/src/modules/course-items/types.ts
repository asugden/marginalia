// Shared types for the course-items module.
//
// The shape to notice: `CompletionDTO` is a discriminated union keyed on the
// same `kind` as the item, not a `{ complete: boolean }`. That is deliberate
// and load-bearing — see the module README. A boolean would make a student's
// self-report and a server-derived backbone exit render identically, which is
// the one thing this surface must not do.

/** The four assignable types. `reading` is reserved; nothing creates one yet. */
export type ItemKind = "writing" | "agent" | "example" | "reading";

export const ITEM_KINDS: readonly ItemKind[] = [
  "writing",
  "agent",
  "example",
  "reading",
];

export function isItemKind(v: unknown): v is ItemKind {
  return typeof v === "string" && (ITEM_KINDS as readonly string[]).includes(v);
}

/** Storage row, straight off D1. */
export interface CourseItemRow {
  id: string;
  course_id: string;
  kind: string;
  payload_ref: string;
  title: string;
  ord: number;
  assigned_at: number | null;
  due_at: number | null;
  note: string | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * Per-kind completion, as one student's state.
 *
 * Every arm carries its own VERB rather than a shared flag, because the four
 * facts are not equivalent evidence:
 *
 *   writing  `submitted`   an artifact exists that the student minted
 *   agent    `finished`    server-derived — a backbone reached its exit
 *   example  `markedDone`  the student's own claim, opt-in
 *   reading  `markedDone`  the student's own claim, opt-in
 *
 * A caller cannot accidentally collapse these: there is no shared field name
 * to read, so rendering one requires naming which kind it came from. Do not
 * add a `complete: boolean` convenience field — it would immediately become
 * the thing every call site reads, and the distinction would be gone.
 *
 * None of these is a score, a verdict, or a risk rating. The provenance
 * module's no-false-positives rule governs this surface too.
 */
export type ItemCompletionDTO =
  | { kind: "writing"; submitted: boolean }
  | { kind: "agent"; finished: boolean }
  | { kind: "example"; markedDone: boolean }
  | { kind: "reading"; markedDone: boolean };

/**
 * A wrapper row as the API returns it.
 *
 * `payload` is whatever the owning module resolved — deliberately typed as an
 * opaque record here, because this module does not know or care about the
 * internals of a writing assignment or an agent definition. It only forwards
 * what the module handed back.
 */
export interface CourseItemDTO {
  id: string;
  kind: ItemKind;
  payloadRef: string;
  title: string;
  ord: number;
  /** Both null = a recommended supplement: available, never due, never late. */
  assignedAt: number | null;
  dueAt: number | null;
  note: string | null;
  archivedAt: number | null;
  /**
   * True when the payload row no longer resolves — a deleted agent, an
   * archived-then-removed assignment, an example slug this deploy dropped.
   * The row is kept and reported rather than hidden so an instructor can see
   * why something vanished from the student list and clean it up.
   */
  dangling: boolean;
  /** Module-resolved payload detail, or null when `dangling`. */
  payload: Record<string, unknown> | null;
  /** Present only on the student's own view of their own items. */
  completion?: ItemCompletionDTO;
}

export function rowToCourseItem(
  row: CourseItemRow,
  opts: {
    payload: Record<string, unknown> | null;
    completion?: ItemCompletionDTO;
  },
): CourseItemDTO {
  return {
    id: row.id,
    kind: row.kind as ItemKind,
    payloadRef: row.payload_ref,
    title: row.title,
    ord: row.ord,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    note: row.note,
    archivedAt: row.archived_at,
    dangling: opts.payload === null,
    payload: opts.payload,
    ...(opts.completion ? { completion: opts.completion } : {}),
  };
}
