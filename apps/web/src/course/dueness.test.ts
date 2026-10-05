// Deadline bucketing and phrasing for the dashboards.
//
//   npx tsx src/course/dueness.test.ts

import { dueLabel, expandCheckpoints, recentlyDueItems, scheduledItems } from "./dueness.js";
import type { CourseItemDTO } from "../modules/course-items/api.js";

let failures = 0;
let checks = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`ok    ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 15, 15, 0); // mid-afternoon UTC
const item = (id: string, dueAt: number | null, extra: Partial<CourseItemDTO> = {}): CourseItemDTO => ({
  id, kind: "code", payloadRef: id, title: id, ord: 0, assignedAt: null, dueAt, note: null,
  archivedAt: null, dangling: false, payload: null, ...extra,
});

const items = [
  item("ten-ago", now - 10 * DAY),
  item("week-ago", now - 7 * DAY),
  item("two-ago", now - 2 * DAY),
  item("yesterday", now - 1 * DAY),
  item("today", now + 1000),
  item("archived", now - 1 * DAY, { archivedAt: now }),
  item("supplement", null),
];

check(
  "recently due: last 7 days, most recent first, archived left out",
  recentlyDueItems(items, now).map((d) => d.item.id),
  ["yesterday", "two-ago", "week-ago"],
);
const [, twoAgo] = recentlyDueItems(items, now);
check("staff read a past deadline as a date", dueLabel(twoAgo!, "staff"), "Due 2 days ago");
check("students read it as overdue", dueLabel(twoAgo!), "Overdue by 2 days");
check("yesterday, staff", dueLabel(recentlyDueItems(items, now)[0]!, "staff"), "Due yesterday");
check(
  "a supplement is never scheduled",
  scheduledItems(items, now).some((d) => d.item.id === "supplement"),
  false,
);

{
  // A writing assignment's deadlines live on its checkpoints.
  const essay = item("ci_essay", null, {
    kind: "writing",
    payloadRef: "pasg_1",
    title: "Essay",
    payload: { checkpoints: [{ id: "cp_draft", name: "Draft", dueAt: now - 2 * DAY }, { id: "cp_final", name: "Final", dueAt: now + 3 * DAY }] },
    completion: { kind: "writing", submitted: true, checkpoints: ["cp_draft"] },
  });
  const split = expandCheckpoints([essay]);
  check("sibling checkpoints become separate items", split.map((i) => i.title), ["Essay — Draft", "Essay — Final"]);
  check("each carries its own deadline", split.map((i) => i.dueAt), [now - 2 * DAY, now + 3 * DAY]);
  check(
    "each carries its own completion",
    split.map((i) => i.completion?.kind === "writing" && i.completion.submitted),
    [true, false],
  );
  check("and its own checkpoint (for its link and colour)", split.map((i) => i.checkpoint?.id), ["cp_draft", "cp_final"]);
  check("split items are scheduled, not supplements", scheduledItems(split, now).length, 2);

  const lone = expandCheckpoints([
    item("ci_lone", null, {
      kind: "writing",
      payloadRef: "pasg_2",
      title: "Reflection",
      payload: { checkpoints: [{ id: "cp_only", name: "Submission", dueAt: now + DAY }] },
    }),
  ]);
  check("a lone checkpoint is just the assignment, with its date", [lone[0]!.title, lone[0]!.dueAt, lone[0]!.checkpoint], ["Reflection", now + DAY, undefined]);
  check("non-writing items pass through", expandCheckpoints([items[0]!]).map((i) => i.id), ["ten-ago"]);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
