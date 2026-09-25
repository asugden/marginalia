// Keeping course_items in step with the payloads it wraps.
//
// The wrapper table is the Assign band's only source, and the modules that own
// the payloads (agents, writing assignments, curated examples) know nothing
// about it. Without this file, the only wrappers that ever existed were the
// ones migration 0022 backfilled for pre-existing agents — a course could
// create assignments and curate examples all term and its Assign list would
// stay empty. These helpers are called by those modules at the moments a
// payload is created, renamed, archived, or removed, so the wrapper can no
// longer drift from the thing it names.
//
// Every helper is idempotent and course-scoped, and none of them touches a
// payload: the sync flows one way, payload → wrapper. Dates the wrapper owns
// (assigned_at / due_at) are set on creation only, except for examples, whose
// curation editor is where an instructor edits dates — there the curation row
// is the source of truth and the wrapper follows it on every save.
//
// Migration 0023 is the one-time version of the same idea for rows that
// already existed when this file landed.

import * as repo from "./repo.js";
import type { ItemKind } from "./types.js";

/**
 * Make sure exactly one live-or-archived wrapper exists for a payload. Creates
 * a dateless "supplement" row when none does; otherwise leaves the existing
 * row alone, so an instructor's own scheduling is never overwritten.
 */
export async function ensureItem(
  db: D1Database,
  params: {
    courseId: string;
    kind: ItemKind;
    payloadRef: string;
    title: string;
    assignedAt?: number | null;
    dueAt?: number | null;
    note?: string | null;
  },
): Promise<void> {
  const existing = await repo.findItemByPayload(
    db,
    params.courseId,
    params.kind,
    params.payloadRef,
  );
  if (existing) return;
  await repo.createItem(db, {
    courseId: params.courseId,
    kind: params.kind,
    payloadRef: params.payloadRef,
    title: params.title,
    ord: await repo.nextOrd(db, params.courseId),
    assignedAt: params.assignedAt ?? null,
    dueAt: params.dueAt ?? null,
    note: params.note ?? null,
  });
}

/** Remove the wrapper for a payload that no longer exists. The payload's own
 *  deletion is the caller's business; this only stops the Assign list from
 *  showing a "content missing" row for it. */
export async function removeItemForPayload(
  db: D1Database,
  courseId: string,
  kind: ItemKind,
  payloadRef: string,
): Promise<void> {
  const existing = await repo.findItemByPayload(db, courseId, kind, payloadRef);
  if (!existing) return;
  await repo.deleteItem(db, courseId, existing.id);
}

/**
 * Follow a payload's title, but only while the wrapper still carries the
 * payload's previous title. An instructor who deliberately renamed the
 * wrapper ("Week 3 warm-up" for an agent called "Derivatives tutor") keeps
 * their name; one who never touched it sees the rename flow through.
 */
export async function renameItemForPayload(
  db: D1Database,
  courseId: string,
  kind: ItemKind,
  payloadRef: string,
  previousTitle: string,
  nextTitle: string,
): Promise<void> {
  if (previousTitle === nextTitle) return;
  const existing = await repo.findItemByPayload(db, courseId, kind, payloadRef);
  if (!existing || existing.title !== previousTitle) return;
  await repo.updateItem(db, courseId, existing.id, { title: nextTitle });
}

/** Mirror a payload's archive state onto its wrapper. Used for writing, whose
 *  archive means "out of the students' picker" — the Assign list should say
 *  the same thing rather than show it as live. */
export async function setArchivedForPayload(
  db: D1Database,
  courseId: string,
  kind: ItemKind,
  payloadRef: string,
  archived: boolean,
): Promise<void> {
  const existing = await repo.findItemByPayload(db, courseId, kind, payloadRef);
  if (!existing) return;
  if ((existing.archived_at !== null) === archived) return;
  await repo.updateItem(db, courseId, existing.id, { archived });
}

/**
 * Reconcile example wrappers with the curated list after a save: create a
 * wrapper for every newly curated slug, drop wrappers for slugs no longer
 * curated, and copy dates and note from the curation row onto every wrapper,
 * since the curation editor is where those are edited. The wrapper title is
 * the slug — example titles live in front-end code the worker does not
 * import, and the Assign page resolves the display name from its registry.
 */
export async function syncExampleItems(
  db: D1Database,
  courseId: string,
  curated: Array<{
    slug: string;
    assignedAt: number | null;
    dueAt: number | null;
    note: string | null;
  }>,
): Promise<void> {
  const items = await repo.listItems(db, courseId, { includeArchived: true });
  const wrappers = new Map(
    items.filter((i) => i.kind === "example").map((i) => [i.payload_ref, i]),
  );
  const wanted = new Set(curated.map((c) => c.slug));

  for (const c of curated) {
    const existing = wrappers.get(c.slug);
    if (!existing) {
      await repo.createItem(db, {
        courseId,
        kind: "example",
        payloadRef: c.slug,
        title: c.slug,
        ord: await repo.nextOrd(db, courseId),
        assignedAt: c.assignedAt,
        dueAt: c.dueAt,
        note: c.note,
      });
      continue;
    }
    if (
      existing.assigned_at !== c.assignedAt ||
      existing.due_at !== c.dueAt ||
      existing.note !== c.note
    ) {
      await repo.updateItem(db, courseId, existing.id, {
        assignedAt: c.assignedAt,
        dueAt: c.dueAt,
        note: c.note,
      });
    }
  }
  for (const [slug, item] of wrappers) {
    if (!wanted.has(slug)) await repo.deleteItem(db, courseId, item.id);
  }
}

/**
 * Follow a payload's due date. Used for code assignments, whose editor is
 * where an instructor sets the one deadline — so, as with examples, the
 * payload is the source of truth and the wrapper follows it on every save.
 */
export async function setDueForPayload(
  db: D1Database,
  courseId: string,
  kind: ItemKind,
  payloadRef: string,
  dueAt: number | null,
): Promise<void> {
  const existing = await repo.findItemByPayload(db, courseId, kind, payloadRef);
  if (!existing || existing.due_at === dueAt) return;
  await repo.updateItem(db, courseId, existing.id, { dueAt });
}
